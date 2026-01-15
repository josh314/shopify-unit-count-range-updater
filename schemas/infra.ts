import * as z from 'zod/v4';

import { envs, type Env } from '@types';

/** Schema for contents of package.json */
export const PackageJson = z.object({
  version: z.string(),
});

/** Settings JSON validation */
export const cronSchema = z.object( {
  minute: z.string(),
  hour:   z.string(),
  day:    z.string(),
  month:  z.string(),
  year:   z.string(),
} ).strict();

export const envSettingsSchema = z.object( {
  stateMachineCron: cronSchema,
} ).strict();
export type EnvSettings = z.infer< typeof envSettingsSchema >;

const settingsShape: Record<Env, typeof envSettingsSchema> =
  Object.fromEntries(
    envs.map( env => [ env, envSettingsSchema ] )
  ) as Record<Env, typeof envSettingsSchema>;

export const settingsSchema = z.object( settingsShape ).strict();

export type Settings = z.infer< typeof settingsSchema >;
