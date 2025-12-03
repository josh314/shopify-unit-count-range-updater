/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import readline from 'readline';
import fs from 'fs';

import axios from 'axios';

const lambdas = [
  'schedule-shopify-bulk-query',
  'poll-shopify-bulk-query-status',
];

async function prompt( question: string ): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise( ( resolve ) => {
    rl.question( question, ( answer ) => {
      rl.close();
      resolve( answer.trim() );
    });
  });
}

function invokeLambda( lambdaIndex: number ): Promise<any> {

  const eventFile = `./data/events/${ lambdas[ lambdaIndex ] }.json`;

  const payload = JSON.parse( fs.readFileSync( eventFile, 'utf8' ) );

  const port = 8888 + lambdaIndex; // Port 8888 for CreateBarcodeLookupBatches, 8889 for GetProductData, etc.

  const req: axios.AxiosRequestConfig = {
    url: `http://localhost:${ port }/2015-03-31/functions/function/invocations`, // Use the domain from settings
    method: 'POST',
    data: payload,
    responseType: 'json',
  };

  return axios( req );

}


async function run() {

  console.log( 'Choose a lambda to invoke:\n' );
  for( const [ index, lambda ] of lambdas.entries() ) {
    console.log( `${ index + 1 }) ${ lambda }` );
  }

  const choice = await prompt( `Enter your choice [1-${ lambdas.length }]: ` );

  const chosenLambdaIndex = parseInt( choice ) - 1;
  const chosenLambdaName = lambdas[ chosenLambdaIndex ];

  let resp;
  if( chosenLambdaName ) {
    console.log( `Invoking Lambda function: ${ chosenLambdaName }` );
    resp = await invokeLambda( chosenLambdaIndex );
  }
  else {
    throw new Error( 'Invalid choice. Please enter a number between 1 and 4.' );
  }

  return resp;
}

run()
  .then( console.log )
  .catch( console.error );