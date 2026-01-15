import type { Env, SecretConfiguration, LambdaConfiguration } from '@types';
import { getEnvShortName } from './utils';


const POLL_RESULTS_INTERVAL_MINUTES = 5;

export class StackData {

  stackEnv: Env;
  secretConfigurations: SecretConfiguration[];
  lambdaConfigurations: LambdaConfiguration[];

  constructor( stackEnv: Env ) {

    this.stackEnv = stackEnv;

    this.secretConfigurations = [
      {
        id: 'shopify',
        name: `${ getEnvShortName( stackEnv ) }/shopify-unit-count-range-updater/shopify`,
        envvar: 'SHOPIFY_SECRET_NAME',
      },
    ];

    this.lambdaConfigurations = [
      {
        id: 'ScheduleBulkQuery',
        secrets: [
          'shopify'
        ],
      },
      {
        id: 'PollBulkOperationStatus',
        envvars: {
          POLL_RESULTS_INTERVAL_MINUTES
        },
        secrets: [
          'shopify'
        ],
      },
      {
        id: 'ProcessQueryResultsAndScheduleMutation',
        secrets: [
          'shopify'
        ],
      },
    ];

  }

}