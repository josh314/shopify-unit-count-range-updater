# Shopify Unit Count Range Updater

This serverless application updates the unit count range metafield for product variants in a Shopify store. It performs a bulk query to retrieve product variants and updates the metafield based on the unit count. It is implemented as a set of AWS Lambda functions orchestrated by AWS Step Function and deployed via an included CDK app.

## AWS Pre-requisites

Before deploying this stack, you need to set up the following AWS resources:
  - API credentials for Shopify API in Secrets Manager

The API credentials secret should be specific to this application so as to not cause collisions with other bulk operations you may be performing against the Shopify API.

## `NODE_ENV`

Valid values for `NODE_ENV` are `dev` or `prod`. The value of `NODE_ENV` determines the environment in which the application is running and affects the configuration and behavior of the application.

## Settings for CDK

There are two ways to provide settings to the CDK application. For local development and usage, it is easiest to use a JSON file whose path is specified in the `SETTINGS_PATH` environment variable, for instance,

```bash
SETTINGS_PATH=./settings.json cdk synth
```

For CI/CD and production deployments, it is preferable to provide the settings as a JSON string in the `SETTINGS_JSON` environment variable. This latter option is, of course, also available for local development, but is less convenient.

The settings schema is defined in `schemas/infra.ts` and -- no matter its source -- the parsed JSON should conform to that schema.

## Local development

### TL;DR

To work on the Lambda functions, run the dev script:

```bash
bash dev-lambda
```

which will watch for changes, build and run in Docker containers. To test an invocation, use the `driver.ts` script:

```bash
npx ts-node driver.ts
```

You will be prompted to choose which lambda you'd like to test and the script will invoke it with an appropriate payload. More on all these pieces below.


### Building and bundling with `esbuild`

The Lambda function is built/bundled with `esbuild` and emitted into `dist`. This is automatically done by CDK (with either `cdk deploy` or `cdk synth`), but you can also build manually by running the following command:

```bash
node esbuild.mjs
```

The configuration used in `esbuild.mjs` is chosen to mimic that of the CDK app in the development environment.

### Docker

For local development of the Lambda function, we have a Dockerfile and a compose file. The `Dockerfile` copies into the image the contents of the `dist` directory, so the Lambdas must be bundled before testing (see the [section on esbuild](#building-and-bundling-with-esbuild). To bring up a container, run a command like the following:

```bash
docker compose up 
```

I actually like to use the `--build` flag to ensure that the container is built fresh each time and redirect output to a file since it tends to clobber itself:

```bash
docker compose up --build > docker.log
```

Furthermore, you may want to run in watch mode, which will automatically rebuild the container when the contents of `dist` change. To do this, you can use the `--watch` flag:

```bash
docker compose up --build --watch > docker.log
```

To invoke a containerized lambda, you can use the following command:

```
curl -XPOST "http://localhost:<port>/2015-03-31/functions/function/invocations" -d @/path/to/event.json
```

Where each lambda is running on a different port between 8888 and 8891 (see the compose file). Each lambda has a corresponding event file in the `events` directory. You'll probably need to modify these to suit your needs. At any rate, use the `driver.ts` script to invoke the lambdas with a more user-friendly interface that keeps track of the correct port and event file for you. Use of `driver.ts` expects event files to be in `data/events/` directory.