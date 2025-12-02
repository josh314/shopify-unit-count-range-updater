import * as fs from 'fs';

import { PackageJson } from '@schemas';

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as events from 'aws-cdk-lib/aws-events';
import * as events_targets from 'aws-cdk-lib/aws-events-targets';

import type { StackData } from './stack-data';

import type { Env, EnvSettings, } from '@types';

interface ShopifyUnitRangeUpdaterStackProps extends cdk.StackProps {

  stackEnv: Env,
  envSettings: EnvSettings,
  stackData: StackData,

}

type StateMachineName = 'ShopifyUnitCountRangeUpdater';

export class ShopifyUnitRangeUpdaterStack extends cdk.Stack {

  stackData: StackData;

  stackEnv: Env;
  isProduction: boolean;

  stateMachineName: StateMachineName;

  notificationTopic: sns.Topic;
  logGroup: logs.LogGroup;
  vpc: ec2.IVpc;
  bucketName: string;
  bucket: s3.IBucket;

  // we save a single notifyOnFailureTask so that the same task can be used for multiple lambdas
  notifyOnFailureTask: sfn.IChainable;

  constructor( scope: Construct, id: string, props: ShopifyUnitRangeUpdaterStackProps ) {

    super( scope, id, props );

    const {
      stackEnv,
      envSettings: {
        vpcId,
        vpcName,
      },
      stackData
    } = props || {};

    this.stackEnv = stackEnv;
    this.isProduction = !!( this.stackEnv && Array.isArray( this.stackEnv.match( 'prod' ) ) );

    this.stackData = stackData;

    this.stateMachineName = 'ShopifyUnitCountRangeUpdater';

    this.bucketName = this.getBucketName();
    this.bucket = this.setBucket();
    this.vpc = this.setVpc( { vpcId, vpcName } );
    this.notificationTopic = this.configureNotificationTopic();

    this.notifyOnFailureTask = this.createNotifyOnFailureTask( );

    // Create a CloudWatch Log Group for Step Function Logs
    this.logGroup = new logs.LogGroup( this, 'ShopifyUnitCountRangeUpdaterLogGroup', {
      logGroupName: `/expresshop/${ this.stackEnv }/shopify-unit-count-range-updater`,
      retention: logs.RetentionDays.ONE_WEEK, // Set log retention period
      removalPolicy: this.isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.createStateMachine( );

    // Add tags to stack
    const { version } = PackageJson.parse(
      JSON.parse( fs.readFileSync('package.json', 'utf8') )
    );
    cdk.Tags.of( this ).add( 'StackVersion', version );

  }


  getBucketName() {
    if ( this.isProduction ) {
      return 'expresshop-shopify-unit-count-range-updater';
    }
    else if ( process.env.AWS_PROFILE ) {
      return `expresshop-shopify-unit-count-range-updater--${ process.env.AWS_PROFILE }`;
    }
    else {
      return `expresshop-shopify-unit-count-range-updater--${ this.stackEnv }`;
    }
  }

  stateMachineArnFromName( smName: StateMachineName ) {
    const stack = cdk.Stack.of(this);
    return `arn:aws:states:${ stack.region }:${ stack.account }:stateMachine:${ smName }`;
  }

  setBucket() {

    // create a Bucket for the application
    const bucket = new s3.Bucket( this, 'ShopifyUnitCountRangeUpdaterBucket', {
      bucketName: this.bucketName,
      eventBridgeEnabled: true,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days( 10 ),
        }
      ],
      ...(
        this.isProduction ?
          { removalPolicy: cdk.RemovalPolicy.RETAIN } :
          { removalPolicy: cdk.RemovalPolicy.DESTROY, autoDeleteObjects: true }
      ),
    });

    return bucket;
  }

  setVpc( { vpcId, vpcName }: { vpcId?: string, vpcName?: string } ) {

    // Determine VPC lookup strategy
    let vpcLookupOptions: ec2.VpcLookupOptions;

    if ( vpcId ) {
      vpcLookupOptions = { vpcId };
    } else if ( vpcName ) {
      vpcLookupOptions = { vpcName };
    } else {
      // Default to the AWS account's default VPC
      console.log('No VPC ID or name specified, deploying into the default VPC.');
      vpcLookupOptions = { isDefault: true };
    }
    // Lookup the VPC
    const vpc = ec2.Vpc.fromLookup( this, 'Vpc', vpcLookupOptions );

    this.vpc = vpc;

    return vpc;
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

  createStateMachine() {

    const stateMachineName = this.stateMachineName;

    // Define the start sequence which guards against concurrent executions of the state machine
    const start =
      sfn.Pass.jsonata( this, `${stateMachineName}__Start`, {
        stateName: 'Set SM Vars',
        outputs: {
          stateMachineArn: '{% $states.context.StateMachine.Id %}',
        }
      });


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