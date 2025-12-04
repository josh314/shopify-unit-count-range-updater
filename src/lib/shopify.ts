import axios from 'axios';
import * as z from 'zod/v4';

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });

/********************************************************
 * Types & schemas
 * ===============
 *
 ****************/

/** Schema for the SSM containing Shopify secrets*/
const ShopifySecretSchema = z.object({
  store: z.string(),
  accessToken: z.string(),
  apiVersion: z.string().optional(),
});

const shopifyGraphQlErrorSchema = z.object( {
  message: z.string(),
  locations: z.array(
    z.object( {
      line: z.number(),
      column: z.number()
    } )
  ).optional(),
  path: z.array(
    z.union( [ z.string(), z.number() ] )
  ).optional(),
  extensions: z.record( z.string(), z.unknown() ).optional()
} );

type ShopifyGraphQlError = z.infer<typeof shopifyGraphQlErrorSchema>;

const makeShopifyGqlResponseSchema = <TData>( dataSchema: z.ZodType<TData> ) =>
  z.looseObject( {
    data: dataSchema.optional(),
    errors: z.array( shopifyGraphQlErrorSchema ).optional(),
  } );

interface GqlRequestOptions<TData> {
  readonly gqlQuery: string;
  readonly variables?: Record<string, unknown>;
  readonly dataSchema: z.ZodType<TData>;
  readonly debug?: boolean;
}

const UserErrorsSchema = z.array( z.object( {
  field: z.array( z.string() ).nullable(),
  message: z.string()
} ) );

const BulkOperationTypeSchema = z.enum( [
  'MUTATION',
  'QUERY'
] );
type BulkOperationType = z.infer<typeof BulkOperationTypeSchema>;

const BulkOperationStatusSchema = z.enum( [
  'CANCELED',
  'CANCELING',
  'COMPLETED',
  'CREATED',
  'EXPIRED',
  'FAILED',
  'RUNNING'
] );

const BulkOperationDataSchema = z.object( {
  id: z.string(),
  type: BulkOperationTypeSchema,
  status: BulkOperationStatusSchema,
  url: z.string().nullable().optional(),
  query: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
} );
type BulkOperationData = z.infer<typeof BulkOperationDataSchema>;

const BulkOperationRunQueryOrMutationDataSchema = z.object( {
  bulkOperation: BulkOperationDataSchema.nullable(),
  userErrors: UserErrorsSchema
} );

const BulkOperationRunQueryDataSchema = z.object( {
  bulkOperationRunQuery: BulkOperationRunQueryOrMutationDataSchema
} );

type BulkOperationRunQueryData = z.infer<typeof BulkOperationRunQueryDataSchema>;

const BulkOperationRunMutationDataSchema = z.object( {
  bulkOperationRunMutation: BulkOperationRunQueryOrMutationDataSchema
} );

type BulkOperationRunMutationData = z.infer<typeof BulkOperationRunMutationDataSchema>;


// Note that some numerical fields like objectCount are strings in the Shopify API (see https://shopify.dev/docs/api/admin-graphql/latest/scalars/UnsignedInt64)
const CurrentBulkOperationDataSchema = z.object( {
  currentBulkOperation: z.object( {
    id: z.string(),
    status: BulkOperationStatusSchema,
    type: z.string(),
    query: z.string(),
    errorCode: z.string().nullable(),
    createdAt: z.string(),
    completedAt: z.string().nullable(),
    objectCount: z.string().nullable(),
    rootObjectCount: z.string().nullable(),
    fileSize: z.string().nullable(),
    url: z.string().nullable(),
    partialDataUrl: z.string().nullable()
  } ).nullable()
} );

type CurrentBulkOperationData = z.infer<typeof CurrentBulkOperationDataSchema>;

const StagedUploadsCreateDataSchema = z.object( {
  stagedUploadsCreate: z.object( {
    userErrors: UserErrorsSchema,
    stagedTargets: z.array(
      z.object( {
        url: z.string(),
        resourceUrl: z.string(),
        parameters: z.array(
          z.object( {
            name: z.string(),
            value: z.string()
          } )
        )
      } )
    )
  } )
} );

type StagedUploadsCreateData = z.infer<typeof StagedUploadsCreateDataSchema>;


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

    const envelopeSchema = makeShopifyGqlResponseSchema( dataSchema );

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
