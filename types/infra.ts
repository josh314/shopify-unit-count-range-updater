import * as events from 'aws-cdk-lib/aws-events';

export const envs = [ 'prod', 'dev' ] as const;

/** Legal values for environment */
export type Env = typeof envs[ number ];

/** Checks if valid environment value. */
export function isEnv(key: string | undefined ): key is Env {
  if( !key ) {
    return false;
  }
  return ( envs as readonly string[] ).includes( key );
}

/** Environment-specific AWS settings */
export interface EnvSettings {
  stateMachineCron: events.CronOptions;
}
// for example:
// {
//   minute: '0',
//   hour: '*/2',
//   day: '*',
//   month: '*',
//   year: '*',
// }
//
// is a valid events.CronOptions object

/** Settings for each environment */
export type Settings = {
  [K in Env]: EnvSettings;
};

/** Legal values for secret names */
export type SecretId = 'shopify';

export interface SecretConfiguration {
  id: SecretId;
  envvar: string;
  name: string;
};

/** Legal names for the project's lambda functions */
export type LambdaId = 'ScheduleBulkQuery' | 'PollBulkOperationStatus' | 'ProcessQueryResultsAndScheduleMutation';

// Define the type for lambda configurations
export interface LambdaConfiguration {
  id: LambdaId;
  envvars?: { [key: string]: string | number };
  secrets?: SecretId[];
}