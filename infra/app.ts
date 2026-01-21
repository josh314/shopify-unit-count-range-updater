import * as cdk from 'aws-cdk-lib';

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

main();
