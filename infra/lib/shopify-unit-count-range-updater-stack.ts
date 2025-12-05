import * as fs from 'fs';

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as events from 'aws-cdk-lib/aws-events';
import * as events_targets from 'aws-cdk-lib/aws-events-targets';

/***************************************************************************
 * Types and schemas
 * =================
 *
 ***************************************************************************/

import type { StackData } from './stack-data';

import type { Env, LambdaId } from '@types';

import { PackageJson } from '@schemas';

interface ShopifyUnitRangeUpdaterStackProps extends cdk.StackProps {

  stackEnv: Env,
  stackData: StackData,

}

type StateMachineName = 'ShopifyUnitCountRangeUpdater';

/***************************************************************************
 * Stack
 * =====
 *
 ***************************************************************************/

export class ShopifyUnitRangeUpdaterStack extends cdk.Stack {

  stackData: StackData;

  stackEnv: Env;
  isProduction: boolean;

  stateMachineName: StateMachineName;

  notificationTopic: sns.Topic;
  logGroup: logs.LogGroup;
  functions: Map<string,lambdaNodejs.NodejsFunction>;

  // we save a single notifyOnFailureTask so that the same task can be used for multiple lambdas
  notifyOnFailureTask: sfn.IChainable;

  constructor( scope: Construct, id: string, props: ShopifyUnitRangeUpdaterStackProps ) {

    super( scope, id, props );

    const {
      stackEnv,
      stackData
    } = props || {};

    this.stackEnv = stackEnv;
    this.isProduction = !!( this.stackEnv && Array.isArray( this.stackEnv.match( 'prod' ) ) );

    this.stackData = stackData;
    this.stateMachineName = 'ShopifyUnitCountRangeUpdater';
    this.notificationTopic = this.configureNotificationTopic();
    this.notifyOnFailureTask = this.createNotifyOnFailureTask( );

    // Create a CloudWatch Log Group for Step Function Logs
    this.logGroup = new logs.LogGroup( this, 'ShopifyUnitCountRangeUpdaterLogGroup', {
      logGroupName: `/expresshop/${ this.stackEnv }/shopify-unit-count-range-updater`,
      retention: logs.RetentionDays.ONE_WEEK, // Set log retention period
      removalPolicy: this.isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.functions = this.configureLambdas( );

    this.createStateMachine( );

    // Add tags to stack
    const { version } = PackageJson.parse(
      JSON.parse( fs.readFileSync('package.json', 'utf8') )
    );
    cdk.Tags.of( this ).add( 'StackVersion', version );

  }

  getSecrets() {

    const secrets = new Map<string,secretsmanager.ISecret>();

    for( const config of this.stackData.secretConfigurations ) {

      const secret = secretsmanager.Secret.fromSecretNameV2( this, `Secret__${ config.id }`, config.name );
      secrets.set( config.id, secret );

    }

    return secrets;

  }

  stateMachineArnFromName( smName: StateMachineName ) {
    const stack = cdk.Stack.of(this);
    return `arn:aws:states:${ stack.region }:${ stack.account }:stateMachine:${ smName }`;
  }

  configureNotificationTopic() {

    // Configure topic for failure notifications
    const topic = new sns.Topic( this, 'FailureTopic', {
      displayName: 'Shopify Unit Count Range Updater Failure',
      topicName: 'ShopifyUnitCountRangeUpdaterFailureTopic',
    } );
    const email = ssm.StringParameter.valueForStringParameter( this, '/notifications/email/admin' );
    topic.addSubscription( new subscriptions.EmailSubscription( email ) );

    return topic;

  }

  createNotifyOnFailureTask( ) {

    const stateMachineName = this.stateMachineName;

    return sfn.Pass.jsonata(this, `${ stateMachineName }__PrettifyError`, {
      stateName: 'PrettifyError',
      outputs: {
        Cause: '{% $string( $parse( $states.input.Cause ), true ) %}',
      }
    })
      .next(
        new tasks.SnsPublish(this, `${ stateMachineName }__NotifyOfFailure`, {
          stateName: 'NotifyOnFailure',
          topic: this.notificationTopic,
          message: sfn.TaskInput.fromText(`{%
            'Message: State machine execution failed' &
            '\nStateMachineName: ' & $states.context.StateMachine.Name &
            '\nStateMachineId: ' & $states.context.StateMachine.Id &
            '\nExecutionId: ' & $states.context.Execution.Id &
            '\nCause: ' & ( $states.input.Cause ? $states.input.Cause : 'Unknown' )
          %}`),
          outputs: {
            Cause: '{% $states.input.Cause ? $states.input.Cause : "Unknown" %}',
          }
        })
      )
      .next( new sfn.Fail(this, `${ stateMachineName }__Fail`, {
        stateName: 'Fail',
        cause: '{% $states.input.Cause ? $states.input.Cause : "Unknown" %}',
      }) );

  }

  configureLambdas( ) {

    const secrets = this.getSecrets();

    const { logGroup } = this;

    const functions = this.stackData.lambdaConfigurations.reduce( ( acc, config ) => {

      const environment = {
        ...( this.isProduction ? {} : { NODE_OPTIONS: '--enable-source-maps' } ),
        NODE_ENV: this.stackEnv,
      };

      const bundlingOpts: cdk.aws_lambda_nodejs.BundlingOptions = {
        minify: this.isProduction,
        commandHooks: {
          beforeBundling() {
            return [];
          },
          afterBundling( _inputDir: string, outputDir: string ): string[] { // makes a local copy of the output bundle for testing purposes
            return [
              `mkdir -p dist`,
              `cp -r ${outputDir}/* dist/`,
            ];
          },
          beforeInstall() {
            return [];
          },
        },
        sourceMap: !this.isProduction,
        ...( !this.isProduction ? { sourceMapMode: cdk.aws_lambda_nodejs.SourceMapMode.BOTH } : {} ),
      };

      const fnProperties = {
        functionName: `${ config.id }`,
        description: `Component of the Product Data Updater application`,
        runtime: lambda.Runtime.NODEJS_24_X,
        entry: `src/functions/${config.id}/index.ts`,
        handler: 'handler',
        logGroup,
        environment,
        bundling: bundlingOpts,

        timeout: cdk.Duration.minutes( 15 ),
      };

      const fn = new lambdaNodejs.NodejsFunction( this, config.id, fnProperties );

      if( config.secrets ) {

        for( const lambdaConfigSecret of config.secrets ) {

          const secret = secrets.get( lambdaConfigSecret );

          const secretConfig = this.stackData.secretConfigurations.find( sc => sc.id === lambdaConfigSecret );

          if( !secret || !secretConfig ) {
            throw new Error( `Secret configuration not found for secret id: ${ lambdaConfigSecret }` );
          }

          secret.grantRead( fn );
          fn.addEnvironment( secretConfig.envvar, secretConfig.name );

        }
      }

      acc.set( config.id, fn );

      return acc;
    }, new Map<string,lambdaNodejs.NodejsFunction>() );

    return functions;
  }

  createLambdaTask( lambdaId: LambdaId ) {

    // Define the lambda invocation task
    return tasks.LambdaInvoke.jsonata( this, `${lambdaId}Lambda`, {
      stateName: `${lambdaId}Task`, // we just give the short name here
      lambdaFunction: this.functions.get( lambdaId )!,
      outputs: "{% $states.result.Payload %}"
    })
      .addRetry( {
        errors: [ 'States.ALL' ],
        interval: cdk.Duration.minutes( 1 ),
        maxAttempts: 3,
      } )
      .addCatch( this.notifyOnFailureTask );

  }

  createStateMachine() {

    const stateMachineName = this.stateMachineName;

    //define a task for each lambda function
    const scheduleBulkQuery = this.createLambdaTask( 'ScheduleBulkQuery' );
    const pollBulkOperationStatus = this.createLambdaTask( 'PollBulkOperationStatus' );
    const processQueryResultsAndScheduleMutation = this.createLambdaTask( 'ProcessQueryResultsAndScheduleMutation' );

    const waitThenPoll = sfn.Wait.jsonata( this, 'WaitToPoll', {
      time: sfn.WaitTime.duration( cdk.Duration.minutes( 5 ) ),
    })
      .next( pollBulkOperationStatus )
      .next( sfn.Pass.jsonata( this, 'AssignBulkOperationVars', {
        assign: {
          bulkOperationType: '{% $states.input.type %}',
          bulkOperationStatus: '{% $states.input.status %}',
        },
      }) );

    const checkMutationForNoop = sfn.Choice.jsonata( this, 'CheckForNoop' );
    checkMutationForNoop.when( sfn.Condition.jsonata( "{% $states.input.status = 'NO-OP' %}" ), new sfn.Succeed( this, `${stateMachineName}__GracefullyExit:No-op`, {
      stateName: 'GracefullyExit:No-op',
      outputs: {
        cause:  "Exited: No operation needed.",
      }
    }) );
    checkMutationForNoop.otherwise( waitThenPoll );

    const processQueryResultsAndScheduleMutationAndCheckForNoop = processQueryResultsAndScheduleMutation.next( checkMutationForNoop );

    // choice state based upon operation type.
    const checkBulkOperationType = sfn.Choice.jsonata( this, 'CheckBulkOperationType' );
    checkBulkOperationType.when( sfn.Condition.jsonata( "{% $bulkOperationType = 'QUERY' %}" ), processQueryResultsAndScheduleMutationAndCheckForNoop );
    checkBulkOperationType.when( sfn.Condition.jsonata( "{% $bulkOperationType = 'MUTATION' %}" ), new sfn.Succeed( this, `${stateMachineName}__GracefullyExit:Finished`, {
      stateName: 'GracefullyExit:Finished',
      outputs: {
        cause:  "Exited: finished update.",
      }
    }) );
    checkBulkOperationType.otherwise(
      sfn.Pass.jsonata(this, `${ stateMachineName }__SetUnknownOperationTypeCause`, {
        stateName: 'SetUnknownOperationTypeCause',
        outputs: {
          Cause: 'Unknown bulk operation type',
        }
      })
        .next( this.notifyOnFailureTask )
    );

    // choice state based upon bulk operation status.
    const checkBulkOperationStatus = sfn.Choice.jsonata( this, 'CheckBulkOperationStatus' );
    checkBulkOperationStatus.when( sfn.Condition.jsonata( "{% $bulkOperationStatus = 'COMPLETED' %}" ), checkBulkOperationType );
    checkBulkOperationStatus.when( sfn.Condition.jsonata( "{% $bulkOperationStatus in [ 'CANCELED', 'CANCELING', 'EXPIRED', 'FAILED' ] %}" ), scheduleBulkQuery );
    checkBulkOperationStatus.otherwise( waitThenPoll );

    // Define the start sequence which guards against concurrent executions of the state machine
    const start =
      sfn.Pass.jsonata( this, `${stateMachineName}__Start`, {
        stateName: 'Set SM Vars',
        outputs: {
          stateMachineArn: '{% $states.context.StateMachine.Id %}',
        }
      })
        .next( scheduleBulkQuery )
        .next( waitThenPoll )
        .next( checkBulkOperationStatus );


    // Define the state machine
    const stateMachine = new sfn.StateMachine( this, 'ShopifyUnitCountRangeUpdaterStateMachine', {
      stateMachineName,
      comment: 'Component of the Shopify Unit Count Range Updater application',
      queryLanguage: sfn.QueryLanguage.JSONATA,
      definitionBody: sfn.DefinitionBody.fromChainable( start ),
      logs: {
        destination: this.logGroup,
        level: sfn.LogLevel.ALL, // Available levels: OFF, ERROR, ALL
        includeExecutionData: true, // Include input/output data in logs
      },
    });

    new events.Rule( this, 'ShopifyUnitCountRangeUpdaterSMCron', {
      ruleName: 'ShopifyUnitCountRangeUpdaterSMCron',
      description: 'Rule to trigger the ShopifyUnitCountRangeUpdater state machine on a schedule',
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '0',
        day: '*',
        month: '*',
        year: '*',
      }),
    })
      .addTarget(
        new events_targets.SfnStateMachine( stateMachine )
      );

    return stateMachine;

  }

}