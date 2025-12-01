# Shopify Unit Count Range Updater

This serverless application updates the unit count range metafield for product variants in a Shopify store. It performs a bulk query to retrieve product variants and updates the metafield based on the unit count. It is implemented as a set of AWS Lambda functions orchestrated by AWS Step Function and deployed via an included CDK app.
