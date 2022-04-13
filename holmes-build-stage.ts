import { CfnOutput, Stage, StageProps, Tags } from "aws-cdk-lib";
import { Construct } from "constructs";
import { HolmesSettings, TAG_STACK_VALUE } from "./holmes-settings";
import { HolmesApplicationStack } from "./application/holmes-application-stack";

export class HolmesBuildStage extends Stage {
  // the output Steps function that is created - useful here for pipeline testing
  // (this is also registered into CloudMap for more general use)
  public readonly checkStepsArnOutput: CfnOutput;
  public readonly extractStepsArnOutput: CfnOutput;
  public readonly differenceThenExtractStepsArnOutput: CfnOutput;

  constructor(
    scope: Construct,
    id: string,
    props: StageProps & HolmesSettings
  ) {
    super(scope, id, props);

    const stack = new HolmesApplicationStack(this, "Holmes", props);

    Tags.of(stack).add("Stack", TAG_STACK_VALUE);

    this.checkStepsArnOutput = stack.checkStepsArnOutput;
    this.extractStepsArnOutput = stack.extractStepsArnOutput;
    this.differenceThenExtractStepsArnOutput =
      stack.differenceThenExtractStepsArnOutput;
  }
}
