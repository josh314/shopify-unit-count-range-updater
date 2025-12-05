import * as z from 'zod/v4';

import {
  BulkOperationTypeSchema,
  BulkOperationStatusSchema,
  BulkOperationDataSchema,
  BulkOperationRunQueryDataSchema,
  BulkOperationRunMutationDataSchema,
  CurrentBulkOperationDataSchema,
  StagedUploadsCreateDataSchema,
  ShopifyGraphQlErrorSchema,
  ProductVariantSchema,
} from '@schemas'

export type BulkOperationType = z.infer<typeof BulkOperationTypeSchema>;
export type BulkOperationStatus = z.infer<typeof BulkOperationStatusSchema>;
export type BulkOperationData = z.infer<typeof BulkOperationDataSchema>;
export type BulkOperationRunQueryData = z.infer<typeof BulkOperationRunQueryDataSchema>;
export type BulkOperationRunMutationData = z.infer<typeof BulkOperationRunMutationDataSchema>;
export type CurrentBulkOperationData = z.infer<typeof CurrentBulkOperationDataSchema>;
export type StagedUploadsCreateData = z.infer<typeof StagedUploadsCreateDataSchema>;
export type ShopifyGraphQlError = z.infer<typeof ShopifyGraphQlErrorSchema>;
export type ProductVariant = z.infer<typeof ProductVariantSchema>;

export interface GqlRequestOptions<TData> {
  readonly gqlQuery: string;
  readonly variables?: Record<string, unknown>;
  readonly dataSchema: z.ZodType<TData>;
  readonly debug?: boolean;
}

export interface BulkOperationLambdaResponse {
  store: string;
  type: BulkOperationType;
  status: BulkOperationStatus;
  bulkOperationId?: string | null;
  url?: string | null;
  message?: string | null;
}