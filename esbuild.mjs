/*

  This script is used to bundle the TypeScript code for the Lambda functions using esbuild.
  It is intended just for development purposes to perform the same build that CDK's `NodejsFunction`
  performs (in dev mode), but without the need to synth the entire CDK stack. It also provides watch functionality.

*/

import * as fs from 'fs';
import * as path from 'path';
import * as esbuild from 'esbuild';

const functionDirs = await fs.promises.readdir('./src/functions', { withFileTypes: true });
const files = functionDirs.map( dir => path.join('./src/functions', dir.name, 'index.ts') );

const ctx = await esbuild.context({
  entryPoints: files,
  bundle: true,
  outdir: './dist',
  minify: false,
  sourcemap: 'both',
  platform: 'node',
  logLevel: 'info',
});

await ctx.watch();
console.log('esbuild is watching the following files for changes');
console.log(files.join('\n'));