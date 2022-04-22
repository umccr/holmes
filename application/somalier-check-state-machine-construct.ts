import { Construct } from "constructs";
import { IRole } from "aws-cdk-lib/aws-iam";
import { Map, StateMachine, Succeed } from "aws-cdk-lib/aws-stepfunctions";
import {
  SomalierBaseStateMachineConstruct,
  SomalierBaseStateMachineProps,
} from "./somalier-base-state-machine-construct";

export class SomalierCheckStateMachineConstruct extends SomalierBaseStateMachineConstruct {
  private readonly lambdaRole: IRole;
  private readonly stateMachine: StateMachine;

  constructor(
    scope: Construct,
    id: string,
    props: SomalierBaseStateMachineProps
  ) {
    super(scope, id, props);

    this.lambdaRole = this.createLambdaRole();

    // The check-start function is used to divide up the work and work out the correct sites file to use
    const checkStartInvoke = this.createLambdaStep(
      "CheckStart",
      ["check-start.lambdaHandler"],
      "$.Payload",
      this.lambdaRole,
      props
    );

    // The Map invoke step is the parallel invocation of Check according to the dynamic array input
    const checkMapInvoke = new Map(this, "FingerprintMapTask", {
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
    }).iterator(
      this.createLambdaStep(
        "Check",
        ["check.lambdaHandler"],
        "$.Payload.matches",
        this.lambdaRole,
        props
      )
    );

    this.stateMachine = new StateMachine(this, "StateMachine", {
      definition: checkStartInvoke
        .next(checkMapInvoke)
        .next(new Succeed(this, "Succeed")),
    });

    if (props.allowExecutionByTesterRole) {
      this.stateMachine.grantRead(props.allowExecutionByTesterRole);
      this.stateMachine.grantStartExecution(props.allowExecutionByTesterRole);
    }
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
