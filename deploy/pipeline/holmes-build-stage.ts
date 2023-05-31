import { Stage, StageProps, Tags } from "aws-cdk-lib";
import { Construct } from "constructs";
import { HolmesSettings, TAG_STACK_VALUE } from "../holmes-settings";
import { HolmesApplicationStack } from "../../workload-holmes/holmes-application-stack";

export class HolmesBuildStage extends Stage {
  constructor(
    scope: Construct,
    id: string,
    props: StageProps & HolmesSettings
  ) {
    super(scope, id, props);

    const stack = new HolmesApplicationStack(this, "Holmes", props);

    Tags.of(stack).add("Stack", TAG_STACK_VALUE);
  }
}
