import { initializeShopifyGql } from '../../lib/shopify';

import type { BulkOperationLambdaResponse } from '@types';

const POLL_RESULTS_INTERVAL_MINUTES = parseInt( process.env.POLL_RESULTS_INTERVAL_MINUTES || '5' );

export const handler = async function( event: { type: 'QUERY' | 'MUTATION' } ): Promise<BulkOperationLambdaResponse> {

  console.info("Lambda function executed: PollShopifyBulkQueryResults");

  const { type } = event;

  const shopifyGql = await initializeShopifyGql();

  const debug = process.env.DEBUG === 'true' || process.env.DEBUG === '1';
  const result = await shopifyGql.pollBulkOperationStatus( type, debug );

  console.info(`Shopify response:`);
  console.info(result);

  const { currentBulkOperation } = result;

  if( !currentBulkOperation ) {
    throw new Error(`No current bulk operation found.`);
  }

  const { status, id, url } = currentBulkOperation;

  const response: BulkOperationLambdaResponse = Object.assign(
    {},
    {
      store: shopifyGql.store,
      type,
      status,
      bulkOperationId: id,
      url
    }
  );

  const messageType = type.toLowerCase();

  if( status === 'CANCELED' || status === 'EXPIRED' || status === 'FAILED' ) {

    response.message = `Bulk ${ messageType } failed. Restarting.`;

  }
  else if( status === 'COMPLETED' ) {

    response.message = `Bulk ${ messageType } results ready.`;
    response.url = url;

  }
  else {

    const when = new Date( Date.now() + POLL_RESULTS_INTERVAL_MINUTES * 60 * 1000 );
    console.info(`Bulk ${ messageType } results not ready yet. Polling again at ${ when.toString() }`);
    response.message = `Bulk ${ messageType } results not ready yet.`;

  }

  return response;

};
