import type { Env } from '@types';

export function getEnvShortName( env: Env ): string {
  switch( env ) {
    case 'production':
      return 'prod';
    case 'development':
      return 'dev';
  }
}