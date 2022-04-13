import { Construct } from "constructs";
import { IRole } from "aws-cdk-lib/aws-iam";
import { Map, StateMachine, Succeed } from "aws-cdk-lib/aws-stepfunctions";
import {
  SomalierBaseStateMachineConstruct,
  SomalierBaseStateMachineProps,
} from "./somalier-base-state-machine-construct";

export class SomalierDifferenceStateMachineConstruct extends SomalierBaseStateMachineConstruct {
  private readonly lambdaRole: IRole;
  private readonly stateMachine: StateMachine;

  constructor(
    scope: Construct,
    id: string,
    props: SomalierBaseStateMachineProps
  ) {
    super(scope, id, props);

    this.lambdaRole = this.createLambdaRole();

    const differenceInvoke = this.createLambdaStep(
      "Difference",
      "difference.lambdaHandler",
      "$.Payload",
      this.lambdaRole,
      props
    );

    this.stateMachine = new StateMachine(this, "StateMachine", {
      definition: differenceInvoke.next(new Succeed(this, "Succeed")),
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
