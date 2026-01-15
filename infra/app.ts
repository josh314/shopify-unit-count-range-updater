import * as cdk from 'aws-cdk-lib';
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

import { ShopifyUnitRangeUpdaterStack } from 'lib/shopify-unit-count-range-updater-stack';
import { isEnv } from '@types';
import { loadSettings } from './lib/load-settings';
import { StackData } from './lib/stack-data';

const rawNodeEnv = process.env.NODE_ENV;
const nodeEnv = isEnv( rawNodeEnv ) ? rawNodeEnv : 'development';

const settings = loadSettings();
const envSettings = settings[ nodeEnv ];

const stackData = new StackData( nodeEnv );

async function preFlight() {

  console.log( 'Running pre-flight checks...' );

  if( !process.env.AWS_PROFILE ) {
    throw new Error( 'AWS_PROFILE environment variable must be set' );
  }

  console.log( `AWS_PROFILE: ${ process.env.AWS_PROFILE }` );

  const client = new SecretsManagerClient({
    profile: process.env.AWS_PROFILE,
    region: process.env.CDK_DEFAULT_REGION
  });

  for( const config of stackData.secretConfigurations ) {

    const params = {
      SecretId: config.name,
    };
    const command = new GetSecretValueCommand( params );

    console.log( `Checking for secret \`${ config.name }\` in profile \`${ process.env.AWS_PROFILE }\`...` );
    try {
      const _response = await client.send( command );
      console.log( `Secret FOUND` );
    } catch (error) {
      console.error( `Secret NOT FOUND` );
      console.error( `Exiting...` );
      process.exit( 1 );
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
  // .then( console.log )
  .catch( console.error );