export const envs = [ 'production', 'development' ] as const;

/** Legal values for environment */
export type Env = typeof envs[ number ];

/** Checks if valid environment value. */
export function isEnv(key: string | undefined ): key is Env {
  if( !key ) {
    return false;
  }
  return ( envs as readonly string[] ).includes( key );
}

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