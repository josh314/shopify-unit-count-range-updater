import { initializeShopifyGql } from '../../lib/shopify';

interface Response {
  status?: string;
  bulkOperationId?: string;
  url?: string | null;
  message?: string;
}

const POLL_RESULTS_INTERVAL_MINUTES = parseInt( process.env.POLL_RESULTS_INTERVAL_MINUTES || '5' );

export const handler = async function( ) {

  console.info("Lambda function executed: PollShopifyBulkQueryResults");

  const shopifyGql = await initializeShopifyGql();

  const debug = process.env.DEBUG === 'true' || process.env.DEBUG === '1';
  const result = await shopifyGql.pollBulkOperationStatus( debug );

  console.info(`Shopify response:`);
  console.info(result);

  const { currentBulkOperation } = result;

  if( !currentBulkOperation ) {
    throw new Error(`No current bulk operation found.`);
  }

  const { status, id, url } = currentBulkOperation;

  const response: Response =  Object.assign(
    {},
    {
      status,
      bulkOperationId: id,
      url
    }
  );

  if( status === 'CANCELED' || status === 'EXPIRED' || status === 'FAILED' ) {

    response.message = "Bulk query failed. Restarting.";

  }
  else if( status === 'COMPLETED' ) {

    response.message = "Bulk query results ready.";
    response.url = url;

  }
  else {

    const when = new Date( Date.now() + POLL_RESULTS_INTERVAL_MINUTES * 60 * 1000 );
    console.info(`Bulk query results not ready yet. Polling again at ${ when.toString() }`);
    response.message = "Bulk query results not ready yet.";

  }

  return response;

};
