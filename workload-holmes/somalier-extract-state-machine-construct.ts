import { Construct } from "constructs";
import {
  DefinitionBody,
  IntegrationPattern,
  JsonPath,
  Pass,
  StateMachine,
  Succeed,
  Timeout,
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
  TaskEnvironmentVariable,
} from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Duration, Token } from "aws-cdk-lib";
import { standardEnv } from "./fingerprint-lambda-env";

// we pass through the entire input JSON as a string argument to Fargate
// it will decode it back to fields there
// BE CAREFUL TO KEEP THIS JSON STRUCTURE AND FARGATE ENTRY EXTRACT IN SYNC

/**
 * The input structure for the launch of the extract Steps machine.
 */
export type SomalierExtractInput = {
  // the URL of the BAM file to fingerprint
  index: string;

  // the reference data to use (e.g "hg38.rna")
  reference: string;

  // the slash terminated folder for storing fingerprints
  fingerprintFolder: string;

  // an optional tag of this fingerprint as a person
  individualId: string | undefined;

  // an optional tag of this fingerprint with a library
  libraryId: string | undefined;

  // an optional boolean that if true says to ignore these fingerprints during check
  excludeFromCheck: boolean | undefined;

  // an optional boolean that if true says to make this fingerprint auto expire after a few weeks
  autoExpire: boolean | undefined;
};

/**
 * A construct wrapping a state machine (steps) - that performs Fingerprint extracts on
 * a set of BAM URLs for a single subject.
 */
export class SomalierExtractStateMachineConstruct extends SomalierBaseStateMachineConstruct {
  readonly stateMachine: StateMachine;
  readonly taskDefinition: TaskDefinition;

  constructor(
    scope: Construct,
    id: string,
    props: SomalierBaseStateMachineProps & { fingerprintFolderDefault: string }
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
      containerDefinition
    );

    const defaults: Omit<SomalierExtractInput, "index" | "reference"> = {
      fingerprintFolder: props.fingerprintFolderDefault,
      individualId: undefined,
      libraryId: undefined,
      excludeFromCheck: undefined,
      autoExpire: undefined,
    };

    this.stateMachine = new StateMachine(this, "StateMachine", {
      definitionBody: DefinitionBody.fromChainable(
        new Pass(this, "Define Defaults", {
          parameters: defaults,
          resultPath: "$.inputDefaults",
        })
          .next(
            new Pass(this, "Apply Defaults", {
              // merge default parameters into whatever the user has sent us
              resultPath: "$.withDefaults",
              outputPath: "$.withDefaults.args",
              parameters: {
                "args.$":
                  "States.JsonToString(States.JsonMerge($.inputDefaults, $$.Execution.Input, false))",
              },
            })
          )
          .next(extractMapStep)
          .next(new Succeed(this, "SucceedStep"))
      ),
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

    // Allow the task definition role ecr access to the guardduty agent
    // https://docs.aws.amazon.com/guardduty/latest/ug/prereq-runtime-monitoring-ecs-support.html#before-enable-runtime-monitoring-ecs
    // Which is in another account - 005257825471.dkr.ecr.ap-southeast-2.amazonaws.com/aws-guardduty-agent-fargate
    td.obtainExecutionRole().addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonECSTaskExecutionRolePolicy"
      )
    );

    // add permissions to the task to read the BAM files from S3
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

  protected createFargateLambdaEnv(): TaskEnvironmentVariable[] {
    return Array.from(
      Object.entries(standardEnv(this.props)).map(([k, v]) => {
        return {
          name: k,
          value: v,
        };
      })
    );
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
   * @protected
   */
  protected createExtractMapStep(
    fargateCluster: ICluster,
    taskDefinition: TaskDefinition,
    containerDefinition: ContainerDefinition
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
          // this odd syntax is because command needs to be an array - but we want to just pass in the input state as a JSON serialized string
          command: Token.asList(JsonPath.array(JsonPath.stringAt("$"))),
          environment: this.createFargateLambdaEnv(),
        },
      ],
      // we should not get *anywhere* near 2 hours for tasks - each fingerprint takes about 15 mins...
      // but we set it here as a worst case where we have an infinite loop or something - we want steps to
      // step in and kill the task
      taskTimeout: Timeout.duration(Duration.hours(2)),
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
    return this.taskDefinition.taskRole;
  }
}
