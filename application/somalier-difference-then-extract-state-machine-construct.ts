import { Construct } from "constructs";
import { StateMachine, Succeed } from "aws-cdk-lib/aws-stepfunctions";
import { TaskDefinition } from "aws-cdk-lib/aws-ecs";
import { IRole } from "aws-cdk-lib/aws-iam";
import {
  SomalierBaseStateMachineConstruct,
  SomalierBaseStateMachineProps,
} from "./somalier-base-state-machine-construct";

export class SomalierDifferenceThenExtractStateMachineConstruct extends SomalierBaseStateMachineConstruct {
  private readonly lambdaRole: IRole;
  private readonly stateMachine: StateMachine;
  private readonly taskDefinition: TaskDefinition;

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

    this.lambdaRole = this.createLambdaRole();

    // The check-start function is used to divide up the work and work out the correct sites file to use
    const differenceStep = this.createLambdaStep(
      "Difference",
      "difference.lambdaHandler",
      "$.Payload",
      this.lambdaRole,
      props
    );

    const extractMapStep = this.createExtractMapStep(
      props.fargateCluster,
      taskDefinition,
      containerDefinition,
      props
    );

    this.stateMachine = new StateMachine(this, "StateMachine", {
      definition: differenceStep
        .next(extractMapStep)
        .next(new Succeed(this, "Succeed")),
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

  public get lambdaTaskRole(): IRole {
    return this.lambdaRole;
  }
}
