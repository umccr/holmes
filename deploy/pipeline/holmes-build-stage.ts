import { CfnOutput, Stage, StageProps, Tags } from "aws-cdk-lib";
import { Construct } from "constructs";
import { HolmesSettings, TAG_STACK_VALUE } from "../holmes-settings";
import { HolmesApplicationStack } from "../../workload-holmes/holmes-application-stack";

export class HolmesBuildStage extends Stage {
  // an optional output CFN for any stack that has decided it wants a role to be created for testing
  public readonly testerRoleArnOutput?: CfnOutput;

  constructor(
    scope: Construct,
    id: string,
    props: StageProps & HolmesSettings
  ) {
    super(scope, id, props);

    const stack = new HolmesApplicationStack(this, "Holmes", props);

    this.testerRoleArnOutput = stack.testerRoleArnOutput;

    Tags.of(stack).add("umccr-org:Stack", TAG_STACK_VALUE);
    Tags.of(stack).add("umccr-org:Product", "Holmes");
  }
}
