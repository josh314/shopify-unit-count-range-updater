import axios from 'axios';

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });

/********************************************************
 * Types & schemas
 * ===============
 *
 ****************/

import {
  ShopifySecretSchema,
  BulkOperationRunQueryDataSchema,
  BulkOperationRunMutationDataSchema,
  CurrentBulkOperationDataSchema,
  StagedUploadsCreateDataSchema,

  // factory function
  ShopifyGqlResponseSchemaFactory
} from '@schemas';

import {
  BulkOperationType,
  BulkOperationData,
  BulkOperationRunQueryData,
  BulkOperationRunMutationData,
  CurrentBulkOperationData,
  StagedUploadsCreateData,
  ShopifyGraphQlError,
  GqlRequestOptions
} from '@types';

/********************************************************
 * Helpers
 * =======
 *
 ******************/

const GID_PATTERN = /gid:\/\/shopify\/([a-zA-Z]+)\/([0-9]+)/;
export const getTypeFromGid = ( gid: string ) => {
  const m = gid.match( GID_PATTERN );
  return m && m[1];
};

// for pretty-printing in debug mode
const prettyPrintGqlQuery = ( q: string ) => {
  console.log('-----------------------------------------');
  console.log('Shopify GraphQL query:');

  let lines = q.split('\n');
  lines = lines.slice(1);

  if( !Array.isArray( lines ) || lines.length === 0 ) {
    console.log('(empty query)');
    console.log('-----------------------------------------');
    return;
  }

  const match = lines[0].match(/( *)/);
  if( match ) {
    const numLeadSpaces = match[1].length;
    lines = lines.map( s => s.slice(numLeadSpaces) );
    console.log(lines.join('\n'));
    console.log('-----------------------------------------');
  }
};

class ShopifyGraphQlRequestError extends Error {
  public readonly errors: Array<ShopifyGraphQlError>;

  public constructor( errors: Array<ShopifyGraphQlError> ) {
    super( errors.map( e => e.message ).join( '; ' ) );
    this.name = 'ShopifyGraphQlRequestError';
    this.errors = errors;
  }
}

class ShopifyUserErrorsError extends Error {
  public readonly userErrors: Array<{ field: Array<string> | null; message: string }>;

  public constructor( userErrors: Array<{ field: Array<string> | null; message: string }> ) {
    super( userErrors.map( e => e.message ).join( '; ' ) );
    this.name = 'ShopifyUserErrorsError';
    this.userErrors = userErrors;
  }
}

/**********************************************************
 * Shopify client class
 * ====================
 *
 ********************/

export async function initializeShopifyGql() {

  const response = await secretsClient.send( new GetSecretValueCommand({ SecretId: process.env.SHOPIFY_SECRET_NAME }) );

  const shopifySecrets = ShopifySecretSchema.parse( JSON.parse( response.SecretString! ) );

  const shopifyOptions = Object.assign( { apiVersion: '2025-10' }, shopifySecrets );

  return new ShopifyGql( shopifyOptions );

}


export class ShopifyGql {

  store: string;
  accessToken: string;
  apiVersion?: string;
  axios: axios.AxiosInstance;


  constructor( { store, accessToken, apiVersion }: { store: string; accessToken: string; apiVersion?: string } ) {
    this.store = store;
    this.accessToken = accessToken;
    this.apiVersion = apiVersion;
    this.axios = axios.create();
  }

  async gqlRequest<TData>( options: GqlRequestOptions<TData> ): Promise<TData> {

    const { gqlQuery, variables, dataSchema, debug } = options;

    if( debug ) {
      prettyPrintGqlQuery( gqlQuery );
    }

    const resp = await this.axios( {
      method: 'POST',
      url: `https://${this.store}.myshopify.com/admin/api/${ this.apiVersion ? this.apiVersion + '/' : '' }graphql.json`,
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": this.accessToken
      },
      data: {
        query: gqlQuery,
        variables
      },
      responseType: 'json'
    } );

    const envelopeSchema = ShopifyGqlResponseSchemaFactory( dataSchema );

    const parsed = envelopeSchema.parse( resp.data );

    if ( parsed.errors && parsed.errors.length > 0 ) {
      throw new ShopifyGraphQlRequestError( parsed.errors );
    }

    if ( !parsed.data ) {
      throw new Error( 'Shopify GraphQL response contained neither data nor errors.' );
    }

    return parsed.data;

  }

  pollBulkOperationStatus( type: BulkOperationType , debug?: boolean ): Promise<CurrentBulkOperationData> {

    return this.gqlRequest<CurrentBulkOperationData>({
      debug: debug,
      gqlQuery: `
        {
          currentBulkOperation( type: ${ type } ) {
            id
            status
            type
            query
            errorCode
            createdAt
            completedAt
            objectCount
            rootObjectCount
            fileSize
            url
            partialDataUrl
          }
        }
      `,
      dataSchema: CurrentBulkOperationDataSchema
    });

  }

  async scheduleBulkOperation( bulkQuery: string, debug: boolean = false ): Promise<BulkOperationData | null> {

    if( debug ) {
      prettyPrintGqlQuery( bulkQuery );
    }

    const gqlQuery = `
      mutation {
        bulkOperationRunQuery(
          query: """${ bulkQuery }"""
        ) {
          bulkOperation {
            id
            type
            status
            query
            errorCode
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const resp = await this.gqlRequest<BulkOperationRunQueryData>({
      debug: debug,
      gqlQuery,
      dataSchema: BulkOperationRunQueryDataSchema
    });

    if( resp.bulkOperationRunQuery.userErrors.length > 0 ) {
      throw new ShopifyUserErrorsError( resp.bulkOperationRunQuery.userErrors );
    }

    return resp.bulkOperationRunQuery.bulkOperation;

  }

  async createStagedUpload( filename: string, debug?: boolean ): Promise<StagedUploadsCreateData> {

    const gqlQuery = `
      mutation {
        stagedUploadsCreate(input:[{
          resource: BULK_MUTATION_VARIABLES,
          filename: "${ filename }",
          mimeType: "text/jsonl",
          httpMethod: POST
        }]){
          userErrors {
            field,
            message
          },
          stagedTargets {
            url,
            resourceUrl,
            parameters {
              name,
              value
            }
          }
        }
      }
    `;

    return this.gqlRequest<StagedUploadsCreateData>({
      gqlQuery,
      debug,
      dataSchema: StagedUploadsCreateDataSchema
    });

  }

  scheduleBulkProductVariantsUpdate( stagedUploadPath: string ) {

    const mutationString = `
      mutation call($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          product {
            id
            title
          }
          userErrors {
            message
            field
          }
        }
      }
    `;

    return this.scheduleBulkOperationMutation( { mutationString, stagedUploadPath } );

  }

  async scheduleBulkOperationMutation( options: { mutationString: string; stagedUploadPath: string; debug?: boolean } ): Promise<BulkOperationData | null>  {

    const { mutationString, stagedUploadPath, debug } = options;

    const gqlQuery = `
      mutation {
        bulkOperationRunMutation( mutation: "${ mutationString }", stagedUploadPath: "${ stagedUploadPath }" ) {
          bulkOperation {
            id
            type
            status
            url
            errorCode
          }
          userErrors {
            message
            field
          }
        }
      }
    `;

    const resp = await this.gqlRequest<BulkOperationRunMutationData>({
      gqlQuery,
      debug,
      dataSchema: BulkOperationRunMutationDataSchema
    });


    if( resp.bulkOperationRunMutation.userErrors.length > 0 ) {
      throw new ShopifyUserErrorsError( resp.bulkOperationRunMutation.userErrors );
    }

    return resp.bulkOperationRunMutation.bulkOperation;

  }

}
