import { initializeShopifyGql } from '../../lib/shopify';
import type { ShopifyGql } from '../../lib/shopify';

let shopifyGql: ShopifyGql;

export const handler = async function(  ) {

  console.log("Lambda function executed: ScheduleShopifyBulkQuery");

  if( !shopifyGql ) {
    shopifyGql = await initializeShopifyGql();
  }

  console.log('Initiating new shopify export sequence now...');

  const bulkQuery = `
    {
      productVariants {
        edges {
          node {
            id
            createdAt
            title
            inventoryItem {
              tracked
              updatedAt
            }
            inventoryQuantity
            product {
              id
              handle
              publishedAt
              status
              title
              tags
            }
            metafields {
              edges {
                node {
                  id
                  namespace
                  key
                  value
                  type
                }
              }
            }
          }
        }
      }
    }
  `;

  const shopifyResp = await shopifyGql.scheduleBulkOperation( bulkQuery );

  console.log(`Shopify bulk query requested.`);
  console.log(`Shopify response:`);
  console.log(shopifyResp);

  if( !shopifyResp ) {
    throw new Error(`No bulk operation found.`);
  }

  const { status, id } = shopifyResp;

  return {
    store: shopifyGql.store,
    status,
    bulkOperationId: id,
  };

};
