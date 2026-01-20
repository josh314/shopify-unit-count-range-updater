import * as cdk from 'aws-cdk-lib';
import { SecretsManagerClient, DescribeSecretCommand } from "@aws-sdk/client-secrets-manager";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { fromIni } from "@aws-sdk/credential-providers";

import { ShopifyUnitRangeUpdaterStack } from 'lib/shopify-unit-count-range-updater-stack';
import { isEnv } from '@types';
import { loadSettings } from './lib/load-settings';
import { StackData } from './lib/stack-data';

const isCi = !!process.env.CI;

if( !isCi && !process.env.AWS_PROFILE ) {
  throw new Error( 'Local deploy requires AWS_PROFILE.' );
}

const rawNodeEnv = process.env.NODE_ENV;
const nodeEnv = isEnv( rawNodeEnv ) ? rawNodeEnv : 'development';

const settings = loadSettings();
const envSettings = settings[ nodeEnv ];

const stackData = new StackData( nodeEnv );

function getAwsRegion() {
  // CDK commonly provides CDK_DEFAULT_REGION at runtime; in CI you may also have AWS_REGION.
  return process.env.CDK_DEFAULT_REGION ?? process.env.AWS_REGION ?? 'us-east-1';
}

function makeSdkConfig() {

  const region = getAwsRegion();

  if( process.env.AWS_PROFILE ) {
    return {
      region,
      credentials: fromIni( { profile: process.env.AWS_PROFILE } ),
    };
  }

  return { region };
}

async function preFlight() {

  console.log( 'Running pre-flight checks...' );

  const sdkConfig = makeSdkConfig();

  if( process.env.AWS_PROFILE ) {
    console.log( `AWS_PROFILE: ${ process.env.AWS_PROFILE }` );
  } else {
    console.log( 'AWS_PROFILE not set; using default AWS credential provider chain.' );
  }

  const sts = new STSClient( sdkConfig );
  const ident = await sts.send( new GetCallerIdentityCommand( {} ) );

  console.log( `Caller identity: account=${ ident.Account } arn=${ ident.Arn }` );

  const sm = new SecretsManagerClient( sdkConfig );

  for( const config of stackData.secretConfigurations ) {

    console.log( `Checking for secret \`${ config.name }\`...` );
    try {
      await sm.send( new DescribeSecretCommand( { SecretId: config.name } ) );
      console.log( `Secret FOUND` );
    } catch (error) {
      console.error( `Secret NOT FOUND: \`${ config.name }\`` );
      throw error;
    }

  }

}

function main() {

  const app = new cdk.App();
  new ShopifyUnitRangeUpdaterStack(app, 'ShopifyUnitRangeUpdaterStack', {

    description: 'Stack for Shopify Unit Range Updater application',

    env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

    stackEnv: nodeEnv,
    envSettings,
    stackData: stackData,

  });

}

preFlight()
  .then( main )
  .catch( ( err ) => {
    console.error( err );
    process.exitCode = 1;
  } );