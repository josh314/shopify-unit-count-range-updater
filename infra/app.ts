import * as cdk from 'aws-cdk-lib';

import { ShopifyUnitRangeUpdaterStack } from 'lib/shopify-unit-count-range-updater-stack';
import { isEnv } from '@types';

const rawNodeEnv = process.env.NODE_ENV;
const nodeEnv = isEnv( rawNodeEnv ) ? rawNodeEnv : 'dev';

import { StackData } from './lib/stack-data';
const stackData = new StackData( nodeEnv );

import settings from '../settings';

async function preFlight() {

  console.log( 'Running pre-flight checks...' );

  if( !process.env.AWS_PROFILE ) {
    throw new Error( 'AWS_PROFILE environment variable must be set' );
  }

  console.log( `AWS_PROFILE: ${ process.env.AWS_PROFILE }` );


}

function main() {

  const app = new cdk.App();
  new ShopifyUnitRangeUpdaterStack(app, 'ShopifyUnitRangeUpdaterStack', {

    description: 'Stack for Shopify Unit Range Updater application',

    env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

    stackEnv: nodeEnv,
    envSettings: settings[ nodeEnv ],
    stackData: stackData,

  });

}

preFlight()
  .then( main )
  // .then( console.log )
  .catch( console.error );