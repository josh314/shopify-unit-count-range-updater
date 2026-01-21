import { SecretsManagerClient, DescribeSecretCommand } from "@aws-sdk/client-secrets-manager";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { fromIni } from "@aws-sdk/credential-providers";

import { isEnv } from '@types';
import { StackData } from '../lib/stack-data';

const rawNodeEnv = process.env.NODE_ENV;
const nodeEnv = isEnv( rawNodeEnv ) ? rawNodeEnv : 'development';

const stackData = new StackData( nodeEnv );

function getAwsRegion() {
  // CDK commonly provides CDK_DEFAULT_REGION at runtime; in CI you may also have AWS_REGION.
  return process.env.CDK_DEFAULT_REGION ?? process.env.AWS_REGION ?? 'us-east-1';
}

function makeSdkConfig() {

  const region = getAwsRegion();

  if( process.env.AWS_PROFILE ) {
    return {
      region,
      credentials: fromIni( { profile: process.env.AWS_PROFILE } ),
    };
  }

  return { region };
}

async function preFlight() {

  console.log( 'Running pre-flight checks...' );

  const sdkConfig = makeSdkConfig();

  if( process.env.AWS_PROFILE ) {
    console.log( `AWS_PROFILE: ${ process.env.AWS_PROFILE }` );
  } else {
    console.log( 'AWS_PROFILE not set; using default AWS credential provider chain.' );
  }

  const sts = new STSClient( sdkConfig );
  const ident = await sts.send( new GetCallerIdentityCommand( {} ) );

  console.log( `Caller identity: account=${ ident.Account } arn=${ ident.Arn }` );

  const sm = new SecretsManagerClient( sdkConfig );

  for( const config of stackData.secretConfigurations ) {

    console.log( `Checking for secret \`${ config.name }\`...` );
    try {
      await sm.send( new DescribeSecretCommand( { SecretId: config.name } ) );
      console.log( `Secret FOUND` );
    } catch (error) {
      console.error( `Secret NOT FOUND: \`${ config.name }\`` );
      throw error;
    }

  }

}

preFlight().then(
  () => { console.log( 'Pre-flight checks completed successfully.' ); }
).catch( ( err ) => {
  console.error( err );
  process.exitCode = 1;
});