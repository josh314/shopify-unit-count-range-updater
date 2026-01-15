import * as z from 'zod/v4';

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

export const settingsSchema = z.object( {
  prod: envSettingsSchema,
  dev:  envSettingsSchema,
} ).strict();

export type Settings = z.infer< typeof settingsSchema >;
