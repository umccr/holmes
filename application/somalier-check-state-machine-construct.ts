import * as path from "path";
import {
  CfnOutput,
  Duration,
  Stack,
  StackProps,
  Stage,
  StageProps,
  Tags,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import { DockerImageCode, DockerImageFunction } from "aws-cdk-lib/aws-lambda";
import {
  IRole,
  ManagedPolicy,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import {
  IntegrationPattern,
  JsonPath,
  Map,
  StateMachine,
  Succeed,
} from "aws-cdk-lib/aws-stepfunctions";
import {
  EcsFargateLaunchTarget,
  EcsRunTask,
  LambdaInvoke,
} from "aws-cdk-lib/aws-stepfunctions-tasks";
import { ISecret, Secret } from "aws-cdk-lib/aws-secretsmanager";
import { HttpNamespace, Service } from "aws-cdk-lib/aws-servicediscovery";
import {
  HolmesReferenceDataSettings,
  HolmesSettings,
  STACK_DESCRIPTION,
  TAG_STACK_VALUE,
} from "../holmes-settings";
import { SomalierExtractStateMachineConstruct } from "./somalier-extract-state-machine-construct";
import { IBucket } from "aws-cdk-lib/aws-s3";

type Props = {
  dockerImageAsset: DockerImageAsset;
  icaSecret: ISecret;
  fingerprintBucket: IBucket;
};

export class SomalierCheckStateMachineConstruct extends Construct {
  private readonly lambdaRole: IRole;
  private readonly stateMachine: StateMachine;

  constructor(
    scope: Construct,
    id: string,
    props: Props & HolmesReferenceDataSettings
  ) {
    super(scope, id);

    // create a single role that is used by all our step functions (could tighten this if needed)
    const permissions = [
      "service-role/AWSLambdaBasicExecutionRole",
      "AmazonS3ReadOnlyAccess",
    ];

    this.lambdaRole = new Role(this, "Role", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
    });

    permissions.map((permission) => {
      this.lambdaRole.addManagedPolicy(
        ManagedPolicy.fromAwsManagedPolicyName(permission)
      );
    });

    const lambdaEnv = {
      SECRET_ARN: props.icaSecret.secretArn,
      FINGERPRINT_BUCKET_NAME: props.fingerprintBucket.bucketName,
      FASTA_BUCKET_NAME: props.referenceFastaBucketName,
      FASTA_BUCKET_KEY: props.referenceFastaBucketKey,
      SITES_BUCKET_NAME: props.sitesBucketName,
      SITES_BUCKET_KEY: props.sitesBucketKey,
    };

    // The gather function is used to collate the full list of fingerprints in the system - we could extend
    // it to use a db or look at S3 etc. This is also performs the chunking for the Map stage
    // NOTE: the 'cmd' is how we differ from the other Funcs
    const checkStartFunc = new DockerImageFunction(
      this,
      "FingerprintCheckStartFunction",
      {
        memorySize: 2048,
        timeout: Duration.seconds(180),
        role: this.lambdaRole,
        code: DockerImageCode.fromEcr(props.dockerImageAsset.repository, {
          tag: props.dockerImageAsset.assetHash,
          cmd: ["check-start.lambdaHandler"],
        }),
        environment: lambdaEnv,
      }
    );
    const checkStartInvoke = new LambdaInvoke(
      this,
      "FingerprintCheckStartTask",
      {
        lambdaFunction: checkStartFunc,
        outputPath: "$.Payload",
      }
    );

    // The gather function is used to collate the full list of fingerprints in the system - we could extend
    // it to use a db or look at S3 etc. This is also performs the chunking for the Map stage
    // NOTE: the 'cmd' is how we differ from the other Funcs
    const checkEndFunc = new DockerImageFunction(
      this,
      "FingerprintCheckEndFunction",
      {
        memorySize: 2048,
        timeout: Duration.seconds(180),
        role: this.lambdaRole,
        code: DockerImageCode.fromEcr(props.dockerImageAsset.repository, {
          tag: props.dockerImageAsset.assetHash,
          cmd: ["check-end.lambdaHandler"],
        }),
        environment: lambdaEnv,
      }
    );
    const checkEndInvoke = new LambdaInvoke(this, "FingerprintCheckEndTask", {
      lambdaFunction: checkEndFunc,
      outputPath: "$.Payload",
    });

    // the output of this func is
    /*
       { index: FROM INPUT STEP AS FINGERPRINT KEY,
         relatednessThreshold: FROM INPUT STEP,
         fingerprintTasks: [ [ "gds://vol/file1" AS FINGERPRINT KEY, "gds://vol/file2" AS FINGERPRINT KEY ], [ "gds://vol/file3", "gds://vol/file4" ] ]
       }
     */

    // The check function is used to compare the index fingerprint against an array of other fingerprints
    // NOTE: the 'cmd' is how we differ from the other Funcs
    const checkFunc = new DockerImageFunction(
      this,
      "FingerprintCheckFunction",
      {
        memorySize: 2048,
        timeout: Duration.seconds(180),
        role: this.lambdaRole,
        code: DockerImageCode.fromEcr(props.dockerImageAsset.repository, {
          tag: props.dockerImageAsset.assetHash,
          cmd: ["check.lambdaHandler"],
        }),
        environment: lambdaEnv,
      }
    );
    const checkInvoke = new LambdaInvoke(this, "FingerprintCheckTask", {
      lambdaFunction: checkFunc,
      outputPath: "$.Payload.matches",
    });

    // The Map invoke step is the parallel invocation according to the dynamic array input
    const mapInvoke = new Map(this, "FingerprintMapTask", {
      inputPath: "$",
      itemsPath: "$.fingerprintKeys",
      parameters: {
        "index.$": "$.index",
        "sitesChecksum.$": "$.sitesChecksum",
        "relatednessThreshold.$": "$.relatednessThreshold",
        "fingerprints.$": "$$.Map.Item.Value",
      },
      // https://blog.revolve.team/2022/01/20/step-functions-array-flattening/
      resultSelector: {
        "flatten.$": "$[*][*]",
      },
      outputPath: "$.flatten",
    }).iterator(checkInvoke);

    this.stateMachine = new StateMachine(this, "StateMachine", {
      definition: checkStartInvoke
        .next(mapInvoke)
        .next(new Succeed(this, "Collate")),
    });
  }

  public get stepsArn(): string {
    return this.stateMachine.stateMachineArn;
  }

  /**
   * Return the role created in this construct that is responsible for doing
   * the actual task activity (not the outer activity towards executing the task itself)
   */
  public get taskRole(): IRole {
    return this.lambdaRole;
  }
}
