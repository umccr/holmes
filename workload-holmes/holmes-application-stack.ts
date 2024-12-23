import * as path from "path";
import {
  CfnOutput,
  CfnResource,
  Duration,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { HttpNamespace, Service } from "aws-cdk-lib/aws-servicediscovery";
import { HolmesSettings, STACK_DESCRIPTION } from "../deploy/holmes-settings";
import { SomalierCheckStateMachineConstruct } from "./somalier-check-state-machine-construct";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { Cluster } from "aws-cdk-lib/aws-ecs";
import { SomalierExtractStateMachineConstruct } from "./somalier-extract-state-machine-construct";
import {
  AccountPrincipal,
  Effect,
  ManagedPolicy,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import {
  Architecture,
  DockerImageCode,
  DockerImageFunction,
  FunctionUrlAuthType,
} from "aws-cdk-lib/aws-lambda";
import { FingerprintLambda } from "./fingerprint-lambda";

/**
 * The Holmes application is a stack that implements a BAM fingerprinting
 * service.
 */
export class HolmesApplicationStack extends Stack {
  // an optional output CFN for any stack that has decided it wants a role to be created for testing
  public readonly testerRoleArnOutput?: CfnOutput;

  constructor(
    scope: Construct,
    id: string,
    props: StackProps & HolmesSettings
  ) {
    super(scope, id, props);

    this.templateOptions.description = STACK_DESCRIPTION;

    // for local dev/testing we can defer "creating" this bucket and instead use one that already exists
    const fingerprintBucket = Bucket.fromBucketName(
      this,
      "FingerprintBucket",
      props.fingerprintBucketName
    );

    // we sometimes need to execute tasks in a VPC context so we need one of these
    const vpc = Vpc.fromLookup(this, "MainVpc", {
      vpcName: "main-vpc",
    });

    // a fargate cluster we use for non-lambda Tasks
    const cluster = new Cluster(this, "FargateCluster", {
      vpc: vpc,
      enableFargateCapacityProviders: true,
      containerInsights: true,
    });

    // we need access to a ICA JWT in order to be able to download from GDS
    const icaSecret = Secret.fromSecretNameV2(
      this,
      "IcaJwt",
      props.icaSecretNamePartial
    );

    // the testing role can be requested and will allow execution of the steps from
    // another account
    let testerRole: Role | undefined = undefined;

    if (props.createTesterRoleAllowingAccount) {
      testerRole = new Role(this, "TesterRole", {
        assumedBy: new AccountPrincipal(props.createTesterRoleAllowingAccount),
        description:
          "A role created only in dev that allows execution of tests from the build account",
      });

      // enable full access to the fingerprint bucket as the test does some deletion
      fingerprintBucket.grantReadWrite(testerRole);

      // the tester needs to be able to discover the services
      testerRole.addManagedPolicy(
        ManagedPolicy.fromAwsManagedPolicyName("AWSCloudMapReadOnlyAccess")
      );

      // the test role needs to be able to launch lambda services - these are added later once
      // lambdas are constructed

      // we add steps execution permissions in the state machine constructs
    }

    // the Docker asset shared by all steps
    const fingerprintDockerImageFolder = path.join(
      __dirname,
      "..",
      "artifacts",
      "fingerprint-docker-image"
    );

    const fingerprintDockerImageAsset = new DockerImageAsset(
      this,
      "FingerprintDockerImage",
      {
        directory: fingerprintDockerImageFolder,
        buildArgs: {
          // encountered https://github.com/aws/aws-cdk/issues/31548
          // this is hopefully temporary (could be fixed at AWS end OR at CDK end OR at docker end)
          provenance: "false",
        },
      }
    );

    const stateProps = {
      dockerImageAsset: fingerprintDockerImageAsset,
      icaSecret: icaSecret,
      fingerprintBucket: fingerprintBucket,
      fargateCluster: cluster,
      allowExecutionByTesterRole: testerRole,
      ...props,
    };

    const checkLargeStateMachine = new SomalierCheckStateMachineConstruct(
      this,
      "SomalierCheckLarge",
      {
        resultWriter: {
          Resource: "arn:aws:states:::s3:putObject",
          Parameters: {
            Bucket: fingerprintBucket.bucketName,
            Prefix: "temp",
          },
        },
        ...stateProps,
      }
    );

    const extractStateMachine = new SomalierExtractStateMachineConstruct(
      this,
      "SomalierExtract",
      { ...stateProps, fingerprintFolderDefault: "fingerprints/" }
    );

    const checkLambda = new FingerprintLambda(this, "Check", {
      dockerImageAsset: fingerprintDockerImageAsset,
      icaSecret: icaSecret,
      fingerprintBucket: fingerprintBucket,
      cmd: ["check.lambdaHandler"],
      fingerprintConfigFolder: props.fingerprintConfigFolder,
      extraEnv: {
        // the check lambda needs to launch and process the Check Steps Machine
        CHECK_STEPS_ARN: checkLargeStateMachine.stepsArn,
      },
    });

    const listLambda = new FingerprintLambda(this, "List", {
      dockerImageAsset: fingerprintDockerImageAsset,
      icaSecret: icaSecret,
      fingerprintBucket: fingerprintBucket,
      cmd: ["list.lambdaHandler"],
      fingerprintConfigFolder: props.fingerprintConfigFolder,
    });

    const relateLambda = new FingerprintLambda(this, "Relate", {
      dockerImageAsset: fingerprintDockerImageAsset,
      icaSecret: icaSecret,
      fingerprintBucket: fingerprintBucket,
      cmd: ["relate.lambdaHandler"],
      fingerprintConfigFolder: props.fingerprintConfigFolder,
    });

    const controlLambda = new FingerprintLambda(this, "Control", {
      dockerImageAsset: fingerprintDockerImageAsset,
      icaSecret: icaSecret,
      fingerprintBucket: fingerprintBucket,
      cmd: ["control.lambdaHandler"],
      fingerprintConfigFolder: props.fingerprintConfigFolder,
    });

    // the extractor is the only service that needs access to ICA (to download
    // the BAM files)... the fingerprints themselves live in S3
    icaSecret.grantRead(extractStateMachine.taskRole);

    // check large needs to read fingerprints BUT ALSO write back the Large results to the same S3 bucket
    // AND it also needs ability to "do" things to the lambdas it calls
    fingerprintBucket.grantReadWrite(checkLargeStateMachine.taskRole);
    checkLargeStateMachine.stateMachine.grantStartExecution(checkLambda.role);
    checkLargeStateMachine.stateMachine.grantRead(checkLambda.role);

    // the extractor needs to be able to write the fingerprints out
    fingerprintBucket.grantReadWrite(extractStateMachine.taskRole);

    // the lambdas just read
    fingerprintBucket.grantRead(checkLambda.role);
    fingerprintBucket.grantRead(listLambda.role);
    fingerprintBucket.grantRead(relateLambda.role);
    fingerprintBucket.grantRead(controlLambda.role);

    /* I don't understand CloudMap - there seems no way for me to import in a namespace that
        already exists... other than providing *all* the details... and a blank arn?? */
    const namespace = HttpNamespace.fromHttpNamespaceAttributes(
      this,
      "Namespace",
      {
        namespaceId: props.namespaceId,
        namespaceName: props.namespaceName,
        namespaceArn: "",
      }
    );

    const service = new Service(this, "Service", {
      namespace: namespace,
      name: "fingerprint",
      description: STACK_DESCRIPTION,
    });

    service.registerNonIpInstance("NonIp", {
      customAttributes: {
        extractStepsArn: extractStateMachine.stepsArn,
        checkLambdaArn: checkLambda.dockerImageFunction.functionArn,
        listLambdaArn: listLambda.dockerImageFunction.functionArn,
        relateLambdaArn: relateLambda.dockerImageFunction.functionArn,
        controlLambdaArn: controlLambda.dockerImageFunction.functionArn,
      },
    });

    if (testerRole) {
      this.testerRoleArnOutput = new CfnOutput(this, "TesterRoleArn", {
        value: testerRole.roleArn,
      });

      checkLambda.dockerImageFunction.grantInvoke(testerRole);
      listLambda.dockerImageFunction.grantInvoke(testerRole);
      relateLambda.dockerImageFunction.grantInvoke(testerRole);
      controlLambda.dockerImageFunction.grantInvoke(testerRole);
    }

    if (props.slackNotifier) {
      // if the lambdas are sending reports to Slack - they need the permissions to access the secret
      // that holds the Slack secret key
      const slackSecret = Secret.fromSecretNameV2(
        this,
        "SlackSecret",
        "SlackApps"
      );
      slackSecret.grantRead(checkLambda.role);
      slackSecret.grantRead(listLambda.role);
      slackSecret.grantRead(relateLambda.role);
      slackSecret.grantRead(controlLambda.role);

      // the Slack lambda itself also needs special permissions to access the secrets and other
      // housekeeping services
      const permissions = [
        "service-role/AWSLambdaBasicExecutionRole",
        "AmazonS3ReadOnlyAccess",
        "AWSCloudMapReadOnlyAccess",
        "AWSStepFunctionsFullAccess",
      ];

      const lambdaRole = new Role(this, "Role", {
        assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
      });

      slackSecret.grantRead(lambdaRole);

      permissions.map((permission) => {
        lambdaRole.addManagedPolicy(
          ManagedPolicy.fromAwsManagedPolicyName(permission)
        );
      });

      const env: any = {
        CHANNEL: props.slackNotifier.channel,
        FINGERPRINT_BUCKET_NAME: fingerprintBucket.bucketName,
        FINGERPRINT_FOLDER: props.slackNotifier.fingerprintFolder,
        FINGERPRINT_CONTROL_FOLDER: props.slackNotifier.fingerprintFolder,
        RELATEDNESS_THRESHOLD:
          props.slackNotifier.relatednessThreshold.toString(),
        MINIMUM_N_COUNT: props.slackNotifier.minimumNCount.toString(),
        LAMBDA_CHECK_ARN: checkLambda.dockerImageFunction.functionArn,
      };

      if (props.slackNotifier.excludeRegex)
        env["EXCLUDE_REGEX"] = props.slackNotifier?.excludeRegex;

      if (props.slackNotifier.expectRelatedRegex)
        env["EXPECT_RELATED_REGEX"] = props.slackNotifier?.expectRelatedRegex;

      // we install one function that is only for invocation from AWS event bridge
      {
        const eventFunc = new DockerImageFunction(
          this,
          `ScheduledGroupFunction`,
          {
            memorySize: 512,
            timeout: Duration.seconds(30),
            architecture: Architecture.X86_64,
            code: DockerImageCode.fromEcr(
              fingerprintDockerImageAsset.repository,
              {
                cmd: ["scheduler-event.lambdaHandler"],
                tagOrDigest: fingerprintDockerImageAsset.assetHash,
              }
            ),
            role: lambdaRole,
            environment: env,
          }
        );

        const schedulerRole = new Role(this, "SchedulerRole", {
          assumedBy: new ServicePrincipal("scheduler.amazonaws.com"),
          inlinePolicies: {
            allowInvokePolicy: new PolicyDocument({
              statements: [
                new PolicyStatement({
                  actions: ["lambda:InvokeFunction"],
                  resources: [eventFunc.functionArn],
                  effect: Effect.ALLOW,
                }),
              ],
            }),
          },
        });

        new CfnResource(this, "DailyScheduler", {
          type: "AWS::Scheduler::Schedule",
          properties: {
            Description:
              "Schedules a daily examination of the previous days sequencing fingerprints",
            FlexibleTimeWindow: {
              Mode: "FLEXIBLE",
              MaximumWindowInMinutes: 5,
            },
            ScheduleExpression: props.slackNotifier.cron,
            ScheduleExpressionTimezone: "Australia/Melbourne",
            Target: {
              Arn: eventFunc.functionArn,
              RoleArn: schedulerRole.roleArn,
              Input: JSON.stringify({}),
            },
          },
        });
      }

      // we install another function (same image, just different entrypoint) that is for
      // invoking from Slack commands
      {
        const publicSlackRole = new Role(this, "PublicSlackRole", {
          assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
        });

        publicSlackRole.addManagedPolicy(
          ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaBasicExecutionRole"
          )
        );

        // the slack command lambda needs access to the secret so that it can get
        // signing secrets (that help it verify the incoming commands)
        slackSecret.grantRead(publicSlackRole);

        const publicSlackFunc = new DockerImageFunction(
          this,
          `PublicSlackFunction`,
          {
            // the public slack function does almost no work itself...
            memorySize: 512,
            // note that this public slack function has only 3 seconds to respond to
            // Slack command - so it is configured to async trigger the other lambdas
            timeout: Duration.seconds(30),
            architecture: Architecture.X86_64,
            code: DockerImageCode.fromEcr(
              fingerprintDockerImageAsset.repository,
              {
                cmd: ["slack-command.lambdaHandler"],
                tagOrDigest: fingerprintDockerImageAsset.assetHash,
              }
            ),
            role: publicSlackRole,
            environment: {
              // the public slack function needs to know the locations of all
              // the lambda - so that it can invoke them in response to Slash commands
              LAMBDA_CHECK_ARN: checkLambda.dockerImageFunction.functionArn,
              LAMBDA_LIST_ARN: listLambda.dockerImageFunction.functionArn,
              LAMBDA_RELATE_ARN: relateLambda.dockerImageFunction.functionArn,
              LAMBDA_CONTROL_ARN: controlLambda.dockerImageFunction.functionArn,
              ...env,
            },
          }
        );

        // the slack role executes the relevant lambdas on command
        checkLambda.dockerImageFunction.grantInvoke(publicSlackRole);
        listLambda.dockerImageFunction.grantInvoke(publicSlackRole);
        relateLambda.dockerImageFunction.grantInvoke(publicSlackRole);
        controlLambda.dockerImageFunction.grantInvoke(publicSlackRole);

        checkLambda.dockerImageFunction.grantInvoke(lambdaRole);

        const fnUrl = publicSlackFunc.addFunctionUrl({
          // auth is done *in* the Slack function to make sure
          // it is only sent messages from the right Slack channel - but we do not
          // need any AWS level auth
          authType: FunctionUrlAuthType.NONE,
        });

        new CfnOutput(this, "SlackFunctionUrl", {
          value: fnUrl.url,
        });
      }
    }
  }
}
