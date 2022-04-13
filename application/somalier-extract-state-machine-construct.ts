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
  ICluster,
  LogDriver,
  TaskDefinition,
} from "aws-cdk-lib/aws-ecs";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { IRole, ManagedPolicy } from "aws-cdk-lib/aws-iam";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { Bucket, IBucket } from "aws-cdk-lib/aws-s3";
import { HolmesReferenceDataSettings } from "../holmes-settings";
import {
  SomalierBaseStateMachineConstruct,
  SomalierBaseStateMachineProps,
} from "./somalier-base-state-machine-construct";

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
      definition: extractMapStep.next(new Succeed(this, "SucceedStep")),
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
