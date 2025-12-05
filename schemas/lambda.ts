import * as z from 'zod/v4';

/*********************************************************
 * Schema for SSM secrets for Shopify access
 * =========================================
 *
 ********************************************************/

export const ShopifySecretSchema = z.object({
  store: z.string(),
  accessToken: z.string(),
  apiVersion: z.string().optional(),
});

/*********************************************************
 * Schemas for Shopify GQL requests and responses
 * ==============================================
 *
 ********************************************************/

export const ShopifyGraphQlErrorSchema = z.object( {
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

const UserErrorsSchema = z.array( z.object( {
  field: z.array( z.string() ).nullable(),
  message: z.string()
} ) );

export const BulkOperationTypeSchema = z.enum( [
  'MUTATION',
  'QUERY'
] );

export const BulkOperationStatusSchema = z.enum( [
  'CANCELED',
  'CANCELING',
  'COMPLETED',
  'CREATED',
  'EXPIRED',
  'FAILED',
  'RUNNING',
  'NO-OP' // Note: 'NO-OP' is not an official Shopify status, but just used internally to indicate no operation was performed
] );

export const BulkOperationDataSchema = z.object( {
  id: z.string(),
  type: BulkOperationTypeSchema,
  status: BulkOperationStatusSchema,
  url: z.string().nullable().optional(),
  query: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
} );

const BulkOperationRunQueryOrMutationDataSchema = z.object( {
  bulkOperation: BulkOperationDataSchema.nullable(),
  userErrors: UserErrorsSchema
} );

export const BulkOperationRunQueryDataSchema = z.object( {
  bulkOperationRunQuery: BulkOperationRunQueryOrMutationDataSchema
} );


export const BulkOperationRunMutationDataSchema = z.object( {
  bulkOperationRunMutation: BulkOperationRunQueryOrMutationDataSchema
} );

// Note that some numerical fields like objectCount are strings in the Shopify API (see https://shopify.dev/docs/api/admin-graphql/latest/scalars/UnsignedInt64)
export const CurrentBulkOperationDataSchema = z.object( {
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

export const StagedUploadsCreateDataSchema = z.object( {
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

/*********************************************************
 * Schemas for Shopify bulk query results
 * ======================================
 *
 ********************************************************/


const baseObjectShape = {
  id: z.string(),
};

export const QueryResultsObjectSchema = z.looseObject( baseObjectShape );

export const MetafieldSchema = z.strictObject( {
  ...baseObjectShape,
  __parentId: z.string(),
  namespace: z.string(),
  key: z.string(),
  value: z.string(),
  type: z.string(),
} );

export const ProductVariantSchema = z.strictObject( {
  ...baseObjectShape,
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

/*********************************************************
 * Factory for Shopify GQL response schemas
 * ========================================
 *
 ********************************************************/

export const ShopifyGqlResponseSchemaFactory = <TData>( dataSchema: z.ZodType<TData> ) =>
  z.looseObject( {
    data: dataSchema.optional(),
    errors: z.array( ShopifyGraphQlErrorSchema ).optional(),
  } );

