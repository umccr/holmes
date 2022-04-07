import { Construct } from "constructs";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
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
} from "aws-cdk-lib/aws-stepfunctions-tasks";
import {
  Cluster,
  Compatibility,
  ContainerImage,
  CpuArchitecture,
  FargatePlatformVersion,
  LogDriver,
  TaskDefinition,
} from "aws-cdk-lib/aws-ecs";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import {
  IRole,
  ManagedPolicy,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";

type Props = {
  dockerImageAsset: DockerImageAsset;
  icaSecret: ISecret;
};

export class SomalierExtractStateMachineConstruct extends Construct {
  readonly taskDefinition: TaskDefinition;
  readonly stateMachine: StateMachine;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const vpc = Vpc.fromLookup(this, "MainVpc", {
      vpcName: "main-vpc",
    });

    const cluster = new Cluster(this, "FargateCluster", { vpc });

    this.taskDefinition = new TaskDefinition(this, "TD", {
      compatibility: Compatibility.FARGATE,
      runtimePlatform: {
        // we lock the platform in the Dockerfiles to intel to match up with this
        // (we have some developers on M1 macs so we need this to force intel builds)
        cpuArchitecture: CpuArchitecture.X86_64,
      },
      cpu: "1024",
      memoryMiB: "2048",
    });

    this.taskDefinition.taskRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonS3ReadOnlyAccess")
    );

    props.icaSecret.grantRead(this.taskDefinition.taskRole);

    const containerDef = this.taskDefinition.addContainer("TheContainer", {
      image: ContainerImage.fromDockerImageAsset(props.dockerImageAsset),
      entryPoint: ["node", "/var/task/extract.cjs"],
      logging: LogDriver.awsLogs({
        streamPrefix: "holmes",
        logRetention: RetentionDays.ONE_WEEK,
      }),
    });

    const runTask = new EcsRunTask(this, "ExtractJob", {
      integrationPattern: IntegrationPattern.RUN_JOB,
      cluster: cluster,
      taskDefinition: this.taskDefinition,
      launchTarget: new EcsFargateLaunchTarget({
        platformVersion: FargatePlatformVersion.VERSION1_4,
      }),
      containerOverrides: [
        {
          containerDefinition: containerDef,
          command: JsonPath.listAt("$.files"),
          environment: [
            {
              name: "SECRET_ARN",
              value: props.icaSecret.secretArn,
            },
          ],
        },
      ],
    });

    // The Map invoke step is the parallel invocation according to the dynamic array input
    const mapInvoke = new Map(this, "MapTask", {
      inputPath: "$",
      itemsPath: "$.fileGroups",
      parameters: {
        "fasta.$": "$.fasta",
        "sites.$": "$.sites",
        "files.$": "$$.Map.Item.Value",
      },
    }).iterator(runTask);

    this.stateMachine = new StateMachine(this, "StateMachine", {
      definition: mapInvoke.next(new Succeed(this, "SucceedStep")),
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
