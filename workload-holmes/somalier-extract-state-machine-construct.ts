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
import { Duration } from "aws-cdk-lib";
import { standardEnv } from "./fingerprint-lambda-env";

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

    this.stateMachine = new StateMachine(this, "StateMachine", {
      definitionBody: DefinitionBody.fromChainable(
        new Pass(this, "Define Defaults", {
          // we allow the default to be set - so we can have different extract state machines configured for different use cases
          parameters: {
            fingerprintFolder: props.fingerprintFolderDefault,
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
          // https://stackoverflow.com/questions/77442579/combining-jsonpath-listat-and-stringat-to-make-a-single-array-in-aws-steps-cdk
          // A pretty messy Pass stage just so we can concat some array values!
          .next(
            new Pass(this, "Merge To Make Command Array", {
              parameters: {
                merge: JsonPath.array(
                  JsonPath.array(
                    JsonPath.stringAt("$.reference"),
                    JsonPath.stringAt("$.fingerprintFolder"),
                    JsonPath.stringAt("$.subjectIdentifier")
                  ),
                  JsonPath.stringAt("$.indexes")
                ),
              },
              resultPath: "$.merge",
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
          // note: replace this once Steps ASL has the ability to concat arrays! (see above)
          command: JsonPath.listAt("$.merge.merge[*][*]"),
          environment: this.createFargateLambdaEnv(),
        },
      ],
      // we should not get *anywhere* near 6 hours for tasks - each fingerprint takes about 15 mins...
      // but we set it here as a worst case where we have an infinite loop or something - we want steps to
      // step in and kill the task
      taskTimeout: Timeout.duration(Duration.hours(6)),
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
