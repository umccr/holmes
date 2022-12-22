import { Construct } from "constructs";
import {
  IntegrationPattern,
  JsonPath,
  Map,
  Pass,
  StateMachine,
  Succeed,
} from "aws-cdk-lib/aws-stepfunctions";
import {
  ContainerDefinition,
  ContainerImage,
  CpuArchitecture,
  FargatePlatformVersion,
  FargateTaskDefinition,
  ICluster,
  LogDriver,
  TaskDefinition,
} from "aws-cdk-lib/aws-ecs";
import { IRole, ManagedPolicy } from "aws-cdk-lib/aws-iam";
import {
  SomalierBaseStateMachineConstruct,
  SomalierBaseStateMachineProps,
} from "./somalier-base-state-machine-construct";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import {
  EcsFargateLaunchTarget,
  EcsRunTask,
} from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Duration } from "aws-cdk-lib";
import {
  ENV_NAME_FINGERPRINT_FOLDER,
  ENV_NAME_FINGERPRINT_REFERENCE,
} from "./fingerprint-docker-image/lib/env";

export class SomalierExtractStateMachineConstruct extends SomalierBaseStateMachineConstruct {
  readonly stateMachine: StateMachine;
  readonly taskDefinition: TaskDefinition;

  constructor(
    scope: Construct,
    id: string,
    props: SomalierBaseStateMachineProps
  ) {
    super(scope, id, props);

    const [taskDefinition, containerDefinition] = this.createExtractDefinition(
      props.icaSecret,
      props.dockerImageAsset
    );

    this.taskDefinition = taskDefinition;

    const extractMapStep = this.createExtractMapStep(
      props.fargateCluster,
      taskDefinition,
      containerDefinition,
      props
    );

    this.stateMachine = new StateMachine(this, "StateMachine", {
      definition: new Pass(this, "Define Defaults", {
        parameters: {
          fingerprintFolder: "fingerprints/",
        },
        resultPath: "$.inputDefaults",
      })
        .next(
          new Pass(this, "Apply Defaults", {
            // merge default parameters into whatever the user has sent us
            resultPath: "$.withDefaults",
            outputPath: "$.withDefaults.args",
            parameters: {
              "args.$":
                "States.JsonMerge($.inputDefaults, $$.Execution.Input, false)",
            },
          })
        )
        .next(extractMapStep)
        .next(new Succeed(this, "SucceedStep")),
    });

    if (props.allowExecutionByTesterRole) {
      this.stateMachine.grantRead(props.allowExecutionByTesterRole);
      this.stateMachine.grantStartExecution(props.allowExecutionByTesterRole);
    }
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
      // some experimentation needed - we definitely don't need this much memory but it may
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
  ): EcsRunTask {
    return new EcsRunTask(this, "Job", {
      integrationPattern: IntegrationPattern.RUN_JOB,
      cluster: fargateCluster,
      taskDefinition: taskDefinition,
      launchTarget: new EcsFargateLaunchTarget({
        platformVersion: FargatePlatformVersion.VERSION1_4,
      }),
      containerOverrides: [
        {
          containerDefinition: containerDefinition,
          command: JsonPath.listAt("$.indexes"),
          // the "command" mapping ability here is a bit limited so we will pass some values
          // that I normally would have said are parameters in via ENV variables
          environment: this.createFargateLambdaEnv().concat(
            { name: ENV_NAME_FINGERPRINT_FOLDER, value: "$.fingerprintFolder" },
            { name: ENV_NAME_FINGERPRINT_REFERENCE, value: "$.reference" }
          ),
        },
      ],
      // we should not get *anywhere* near 6 hours for tasks - each fingerprint takes about 15 mins... and
      // our default clumping size is 5, so 5x15 mins is about normal...
      // but we set it here as a worst case where we have an infinite loop or something - we want steps to
      // step in and kill the task
      timeout: Duration.hours(6),
    });

    // The Map invoke step is the parallel invocation according to the dynamic array input
    /*return new Map(this, "MapTask", {
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
    }).iterator(runTask); */
  }

  public get stepsArn(): string {
    return this.stateMachine.stateMachineArn;
  }

  /**
   * Return the role created in this construct that is responsible for doing
   * the actual task activity (not the outer activity towards executing the task itself)
   */
  public get taskRole(): IRole {
    return this.taskDefinition.taskRole;
  }
}
