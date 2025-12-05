import * as z from 'zod/v4';

/** Schema for contents of package.json */
export const PackageJson = z.object({
  version: z.string(),
});
