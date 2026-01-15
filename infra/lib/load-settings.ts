import fs from 'node:fs';
import path from 'node:path';

import { settingsSchema, type Settings } from '@schemas';

function readSettingsSource(): string {
  const settingsJson = process.env.SETTINGS_JSON;
  if( settingsJson && settingsJson.trim().length > 0 ) {
    return settingsJson;
  }

  const settingsPath = process.env.SETTINGS_PATH;
  if( settingsPath && settingsPath.trim().length > 0 ) {
    const resolvedPath = path.resolve( settingsPath );
    return fs.readFileSync( resolvedPath, 'utf8' );
  }

  throw new Error(
    [
      'No settings provided.',
      'Provide SETTINGS_JSON (CI) or SETTINGS_PATH (workstation).',
      'Example: SETTINGS_PATH=./settings.local.json',
    ].join( '\n' )
  );
}

export function loadSettings(): Settings {
  const raw = readSettingsSource();

  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse( raw );
  } catch( err ) {
    throw new Error(
      [
        'Failed to parse settings JSON.',
        'If using SETTINGS_PATH, the file must contain JSON (not TS).',
        String( err ),
      ].join( '\n' )
    );
  }

  const parsed = settingsSchema.safeParse( parsedUnknown );
  if( !parsed.success ) {
    throw new Error(
      [
        'Settings failed validation:',
        parsed.error.toString(),
      ].join( '\n' )
    );
  }

  return parsed.data;
}
