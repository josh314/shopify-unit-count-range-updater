import * as fs from 'fs';

import { PackageJson } from '@schemas';

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import type { StackData } from './stack-data';

import type { Env, EnvSettings } from '@types';

interface ShopifyUnitRangeUpdaterStackProps extends cdk.StackProps {

  stackEnv: Env,
  envSettings: EnvSettings,
  stackData: StackData,

}

export class ShopifyUnitRangeUpdaterStack extends cdk.Stack {

  constructor( scope: Construct, id: string, props: ShopifyUnitRangeUpdaterStackProps ) {
    super( scope, id, props );

    // Add tags to stack
    const { version } = PackageJson.parse(
      JSON.parse( fs.readFileSync('package.json', 'utf8') )
    );
    cdk.Tags.of( this ).add( 'StackVersion', version );

  }

}