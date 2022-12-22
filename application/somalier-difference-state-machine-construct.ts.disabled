import { Construct } from "constructs";
import { IRole } from "aws-cdk-lib/aws-iam";
import { Map, StateMachine, Succeed } from "aws-cdk-lib/aws-stepfunctions";
import {
  SomalierBaseStateMachineConstruct,
  SomalierBaseStateMachineProps,
} from "./somalier-base-state-machine-construct";

/**
 * The difference state machine calculates all BAM files that are located in the configured
 * BAM sources - and works out if there is a corresponding up-to-date fingerprint for that
 * BAM source.
 *
 * @input
 *
 * {
 *
 * }
 *
 * @output
 *
 * {
 *  needsFingerprinting: [
 *    [
 *      "gds://source/1.bam",
 *      "gds://source/2.bam",
 *    ],
 *    [
 *     "gds://source/3.bam",
 *     "gds://source/4.bam",
 *    ]
 *  ],
 *  hasFingerprinting: [
 *     "gds://source/5.bam",
 *     "gds://source/6.bam",
 *  ]
 * }
 */
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
      ["difference.lambdaHandler"],
      "$.Payload",
      this.lambdaRole,
      props
    );

    this.stateMachine = new StateMachine(this, "StateMachine", {
      definition: differenceInvoke.next(new Succeed(this, "Succeed")),
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
