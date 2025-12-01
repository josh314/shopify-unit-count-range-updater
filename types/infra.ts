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
  vpcId?: string;
  vpcName?: string;
}

/** Settings for each environment */
export type Settings = {
  [K in Env]: EnvSettings;
};