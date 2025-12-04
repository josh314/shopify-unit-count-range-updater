import * as readline from 'node:readline';
import { Readable } from 'node:stream';

import axios from 'axios';
import * as z from 'zod/v4';
import { initializeShopifyGql, getTypeFromGid } from '../../lib/shopify';

/********************************************************
 * Types & schemas
 * ===============
 *
 ****************/

const baseShape = {
  id: z.string(),
};

const QueryResultsObjectSchema = z.looseObject( baseShape );
type QueryResultsObject = z.infer<typeof QueryResultsObjectSchema>;

const MetafieldSchema = z.strictObject( {
  ...baseShape,
  __parentId: z.string(),
  namespace: z.string(),
  key: z.string(),
  value: z.string(),
  type: z.string(),
} );

const ProductVariantSchema = z.strictObject( {
  ...baseShape,
  product: z.object( {
    id: z.string(),
  } ),
  metafields: z.array( MetafieldSchema ).optional(),
  selectedOptions: z.array(
    z.object( {
      name: z.string(),
      value: z.string(),
    })
  )
} );
type ProductVariant = z.infer<typeof ProductVariantSchema>;

/*********************************************************
 * Helpers
 * =======
 *
 *****************/

async function collateQueryResults( queryResultsStream: NodeJS.ReadableStream ): Promise< ProductVariant[] > {

  const rl = readline.createInterface({
    input: queryResultsStream,
    crlfDelay: Infinity
  });

  const variants: ProductVariant[] = [];
  for await ( const line of rl ) {

    const obj: QueryResultsObject = QueryResultsObjectSchema.parse( JSON.parse( line.toString() ) );

    const type = getTypeFromGid( obj.id );
    if( type === 'ProductVariant' ) {

      const variant = ProductVariantSchema.parse( obj );
      variants.push( variant );

    }
    else if( type === 'Metafield' ) {

      const metafield = MetafieldSchema.parse( obj );
      const parent = variants.find( p => p.id === metafield.__parentId );
      if( !parent ) {
        console.warn('No parent found for metafield', metafield.id, metafield.__parentId );
        continue;
      }

      if( Array.isArray( parent.metafields ) ) {
        parent.metafields.push( metafield );
      }
      else {
        parent.metafields = [ metafield ];
      }

    }

  }

  return variants;

}

function getUnitCountRangeFromUnitCountString( unitCountStr: string ) {

  const unitCount = parseInt( unitCountStr, 10 );

  if( !unitCount || isNaN(unitCount) ) {
    return null;
  }
  else if( unitCount < 100 ) {
    return 'Under 100';
  }
  else if( unitCount >= 100 && unitCount <= 299 ) {
    return '100-299';
  }
  else if( unitCount >= 300 && unitCount <= 499 ) {
    return '300-499';
  }
  else if( unitCount >= 500 && unitCount <= 999 ) {
    return '500-999';
  }
  else if( unitCount >= 1000 ) {
    return '1000+';
  }

  return null;
}

function getNewUnitCountRangeForVariant( productVariant: ProductVariant ) {

  let unitCountRange: string | null = null;

  for( const option of productVariant.selectedOptions ) {
    if( option.name.toLowerCase() === 'unit count' ) {
      unitCountRange = getUnitCountRangeFromUnitCountString( option.value );
      break;
    }
  }

  if( unitCountRange ) {

    const metafield = productVariant.metafields?.find( mf => mf.namespace === 'wsn' && mf.key === 'unitCountRange' );
    if( metafield && metafield.value === unitCountRange ) {
      // no update needed
      return null;
    }

    return unitCountRange;

  }

  return null;

}

function getMutationForVariant( variant: ProductVariant ) {
  const newUnitCountRange = getNewUnitCountRangeForVariant( variant );
  if( newUnitCountRange ) {
    return {
      productId: variant.product.id,
      variants: [ {
        id: variant.id,
        metafields: [ {
          namespace: 'wsn',
          key: 'unitCountRange',
          value: newUnitCountRange,
          type: 'single_line_text_field'
        } ]
      } ]
    };
  }
}

function createBulkMutationForVariants( variants: ProductVariant[] ): string {
  let mutations = '';

  for( const variant of variants ) {
    const mutation = getMutationForVariant( variant );
    if( mutation ) {
      mutations += JSON.stringify(mutation) + '\n';
    }
  }

  return mutations;

}

/*********************************************************
 * Lambda handler
 * ==============
 *
 ******************/

export const handler = async function( event: { url: string } ) {

  console.log("Lambda function executed: process-query-results-and-schedule-mutation");

  const shopifyGql = await initializeShopifyGql();

  const { url } = event;

  const queryResults = await axios<Readable>( {
    method: 'get',
    url,
    responseType: 'stream'
  } );

  const variants = await collateQueryResults( z.instanceof(Readable).parse(queryResults.data) );

  const mutations = createBulkMutationForVariants( variants );

  if( !mutations || mutations.length === 0 ) {
    console.log( `No mutations to process. Exiting.` );
    return {
      store: shopifyGql.store,
      type: 'MUTATION',
      status: 'NONE',
      bulkOperationId: null,
    };
  }

  const mutationsFilename = 'bulk-mutation.jsonl';

  const createStagedUploadResp = await shopifyGql.createStagedUpload( mutationsFilename );

  if( !createStagedUploadResp?.stagedUploadsCreate?.stagedTargets?.[0] ) {
    throw new Error( `No staged upload targets returned from Shopify.` );
  }

  const { url: stagingUrl, parameters: stagingParams } = createStagedUploadResp.stagedUploadsCreate.stagedTargets[0];

  const payload: Record< string, unknown > = {};
  for( const param of stagingParams ) {
    payload[ param.name ] = param.value;
  }

  payload.file = Buffer.from( mutations );

  await axios.postForm(
    stagingUrl,
    payload,
  );

  const stagedUploadPath = stagingParams.find( _ => _.name === "key" )?.value;

  if( !stagedUploadPath ) {
    throw new Error( `No staged upload path returned from Shopify.` );
  }

  const scheduleBulkMutationResp = await shopifyGql.scheduleBulkProductVariantsUpdate( stagedUploadPath );

  console.log( `Shopify bulk mutation requested.` );
  console.log( `Shopify response:` );
  console.log( scheduleBulkMutationResp );

  if( !scheduleBulkMutationResp ) {
    throw new Error(`No bulk operation found.`);
  }

  const { type, status, id } = scheduleBulkMutationResp;

  return {
    store: shopifyGql.store,
    type,
    status,
    bulkOperationId: id,
  };

};
