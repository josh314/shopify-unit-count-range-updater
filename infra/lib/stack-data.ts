import type { Env, SecretConfiguration } from '@types';

export class StackData {

  stackEnv: Env;
  secretConfigurations: SecretConfiguration[];

  constructor( stackEnv: Env ) {

    this.stackEnv = stackEnv;

    this.secretConfigurations = [
      {
        id: 'shopify',
        name: `${stackEnv }/shopify-unit-count-range-updater/shopify`,
        envvar: 'SHOPIFY_SECRET_NAME',
      },
    ];

  }

}