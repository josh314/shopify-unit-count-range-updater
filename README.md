# Shopify Unit Count Range Updater

This serverless application updates the unit count range metafield for product variants in a Shopify store. It performs a bulk query to retrieve product variants and updates the metafield based on the unit count. It is implemented as a set of AWS Lambda functions orchestrated by AWS Step Function and deployed via an included CDK app.

## AWS Pre-requisites

Before deploying this stack, you need to set up the following AWS resources:
  - VPC
  - API credentials for Shopify API in Secrets Manager

The VPC can be specified by resource id or by name; if not specified the default VPC will be used. The API credentials secret should be specific to this application so as to not cause collisions with other bulk operations you may be performing against the Shopify API.

## `settings.ts` and `NODE_ENV`

Valid values for `NODE_ENV` are `dev`, `prod`, or `local`. The value of `NODE_ENV` determines the environment in which the application is running and affects the configuration and behavior of the application. `local` is like `dev`, but is used for local testing of the lambda function without deploying to AWS.

You must provide a `settings.ts` file in the project root. This file should default export an object of type `Settings` (see `types/index.ts` for this type definition) which contains the cloud for the application. 

