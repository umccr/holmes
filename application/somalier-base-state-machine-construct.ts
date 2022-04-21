import { Construct } from "constructs";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import {
  IntegrationPattern,
  JsonPath,
  Map,
} from "aws-cdk-lib/aws-stepfunctions";
import {
  EcsFargateLaunchTarget,
  EcsRunTask,
  LambdaInvoke,
  TaskEnvironmentVariable,
} from "aws-cdk-lib/aws-stepfunctions-tasks";
import {
  Compatibility,
  ContainerDefinition,
  ContainerImage,
  CpuArchitecture,
  FargatePlatformVersion,
  FargateTaskDefinition,
  ICluster,
  LogDriver,
  TaskDefinition,
} from "aws-cdk-lib/aws-ecs";
import {
  IRole,
  ManagedPolicy,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { HolmesReferenceDataSettings } from "../holmes-settings";
import { DockerImageCode, DockerImageFunction } from "aws-cdk-lib/aws-lambda";
import { Duration } from "aws-cdk-lib";

export type SomalierBaseStateMachineProps = HolmesReferenceDataSettings & {
  dockerImageAsset: DockerImageAsset;
  fargateCluster: ICluster;
  icaSecret: ISecret;
  fingerprintBucket: IBucket;
  bamSources: string[];
  bamLimits: string[];
};

/**
 * The Somalier base state machine holds all common state machine functionality,
 * allowing us to build a variety of state machines constructs using common
 * lambda and tasks.
 */
export class SomalierBaseStateMachineConstruct extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: SomalierBaseStateMachineProps
  ) {
    super(scope, id);
  }

  /**
   * Create a role used by all the lambdas in the state machine.
   *
   * @protected
   */
  protected createLambdaRole(): IRole {
    // create a single role that is used by all our step functions (could tighten this if needed)
    const permissions = [
      "service-role/AWSLambdaBasicExecutionRole",
      // question - could we reduce this to just read access to fingerprint bucket?
      // (probably no - it also accesses reference data via s3?)
      "AmazonS3ReadOnlyAccess",
    ];

    const lambdaRole = new Role(this, "Role", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
    });

    permissions.map((permission) => {
      lambdaRole.addManagedPolicy(
        ManagedPolicy.fromAwsManagedPolicyName(permission)
      );
    });

    return lambdaRole;
  }
  /**
   * Create the task and container that we can run in Fargate to perform Somalier extract operations.
   *
   * @param icaSecret
   * @param dockerImageAsset
   * @protected
   */
  protected createExtractDefinition(
    icaSecret: ISecret,
    dockerImageAsset: DockerImageAsset
  ): [TaskDefinition, ContainerDefinition] {
    const td = new FargateTaskDefinition(this, "Td", {
      runtimePlatform: {
        // we lock the platform in the Dockerfiles to x64 to match up with this
        // (we have some developers on M1 macs so we need this to force intel builds)
        cpuArchitecture: CpuArchitecture.X86_64,
      },
      cpu: 1024,
      // some experimentation needed - we probably don't need this much memory but it may
      // give us better network performance...
      memoryLimitMiB: 4096,
    });

    td.taskRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonS3ReadOnlyAccess")
    );

    icaSecret.grantRead(td.taskRole);

    const cd = td.addContainer("Container", {
      image: ContainerImage.fromDockerImageAsset(dockerImageAsset),
      entryPoint: ["node", "/var/task/extract.cjs"],
      logging: LogDriver.awsLogs({
        streamPrefix: "holmes",
        logRetention: RetentionDays.ONE_WEEK,
      }),
    });

    return [td, cd];
  }

  /**
   * Create a Map step that accepts a (nested) list of files to fingerprint and fans out a
   * bunch of Fargate tasks to do the somalier extraction.
   *
   * The step task takes a chunked array of urls at
   *   $.needsFingerprinting
   *
   * @param fargateCluster
   * @param taskDefinition
   * @param containerDefinition
   * @param props
   * @protected
   */
  protected createExtractMapStep(
    fargateCluster: ICluster,
    taskDefinition: TaskDefinition,
    containerDefinition: ContainerDefinition,
    props: SomalierBaseStateMachineProps
  ): Map {
    const runTask = new EcsRunTask(this, "Job", {
      integrationPattern: IntegrationPattern.RUN_JOB,
      cluster: fargateCluster,
      taskDefinition: taskDefinition,
      launchTarget: new EcsFargateLaunchTarget({
        platformVersion: FargatePlatformVersion.VERSION1_4,
      }),
      containerOverrides: [
        {
          containerDefinition: containerDefinition,
          command: JsonPath.listAt("$.files"),
          environment: this.createFargateLambdaEnv(props),
        },
      ],
      // we should not get *anywhere* near 6 hours for tasks - each fingerprint takes about 15 mins... and
      // our default clumping size is 5, so 5x15 mins is about normal...
      // but we set it here as a worst case where we have an infinite loop or something - we want steps to
      // step in and kill the task
      timeout: Duration.hours(6),
    });

    // The Map invoke step is the parallel invocation according to the dynamic array input
    return new Map(this, "MapTask", {
      inputPath: "$",
      itemsPath: "$.needsFingerprinting",
      parameters: {
        "files.$": "$$.Map.Item.Value",
      },
      // the result of an ECS Task is a very large JSON with all the ECS details - and this will overflow
      // the steps State limits if not pruned
      resultSelector: {
        //"CreatedAt.$": "$.CreatedAt",
        //"ExecutionStoppedAt.$": "$.ExecutionStoppedAt",
        //"StartedAt.$": "$.StartedAt",
        //"StopCode.$": "$.StopCode",
        //"StoppedAt.$": "$.StoppedAt",
        //"StoppedReason.$": "$.StoppedReason",
        //"TaskArn.$": "$.TaskArn",
      },
    }).iterator(runTask);
  }

  protected createLambdaEnv(props: SomalierBaseStateMachineProps): {
    [k: string]: string;
  } {
    return {
      SOURCES: props.bamSources.join(" "),
      LIMITS: props.bamLimits.join(" "),
      SECRET_ARN: props.icaSecret.secretArn,
      FINGERPRINT_BUCKET_NAME: props.fingerprintBucket.bucketName,
      FASTA_BUCKET_NAME: props.referenceFastaBucketName,
      FASTA_BUCKET_KEY: props.referenceFastaBucketKey,
      SITES_BUCKET_NAME: props.sitesBucketName,
      SITES_BUCKET_KEY: props.sitesBucketKey,
    };
  }

  protected createFargateLambdaEnv(
    props: SomalierBaseStateMachineProps
  ): TaskEnvironmentVariable[] {
    return Array.from(
      Object.entries(this.createLambdaEnv(props)).map(([k, v]) => {
        return {
          name: k,
          value: v,
        };
      })
    );
  }

  /**
   * Create an AWS Step that invokes a somalier docker based lambda.
   *
   * @param stepName a unique String to distinguish the CDK name for this lambda
   * @param cmd the CMD array for docker lambda entry
   * @param outputPath
   * @param role
   * @param props
   * @protected
   */
  protected createLambdaStep(
    stepName: string,
    cmd: string[],
    outputPath: string,
    role: IRole,
    props: SomalierBaseStateMachineProps
  ): LambdaInvoke {
    const func = new DockerImageFunction(this, `${stepName}Function`, {
      memorySize: 2048,
      timeout: Duration.minutes(14),
      role: role,
      code: DockerImageCode.fromEcr(props.dockerImageAsset.repository, {
        tag: props.dockerImageAsset.assetHash,
        cmd: cmd,
      }),
      environment: this.createLambdaEnv(props),
    });
    return new LambdaInvoke(this, `${stepName}Task`, {
      lambdaFunction: func,
      outputPath: outputPath,
    });
  }
}
