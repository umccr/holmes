import { Construct } from "constructs";
import { Effect, IRole, PolicyStatement } from "aws-cdk-lib/aws-iam";
import {
  CustomState,
  Map,
  Pass,
  StateMachine,
  Succeed,
} from "aws-cdk-lib/aws-stepfunctions";
import {
  SomalierBaseStateMachineConstruct,
  SomalierBaseStateMachineProps,
} from "./somalier-base-state-machine-construct";
import { Arn, ArnFormat, Stack } from "aws-cdk-lib";

/**
 *  NOTE NOTE NOTE
 *
 *
 * We have a requirement for listing the fingerprints that are in the db - and we would like to do
 * it as an "operation" (i.e. a steps invoke) rather than giving permissions to clients to read
 * the fingerprint bucket. HOWEVER - the way the Distributed Map functionality works is that it
 * kind of delivers output into files in a bucket anyhow. So not sure we actually gain anything
 * as the client still has to read the bucket to put the output JSON back together. And they could
 * instead literally just do a ListBucket.
 *
 * I have left this code here - but the state machine is not published into cloudmap or
 * advertised.
 */

export class SomalierListStateMachineConstruct extends SomalierBaseStateMachineConstruct {
  private readonly lambdaRole: IRole;
  private readonly stateMachine: StateMachine;

  constructor(
    scope: Construct,
    id: string,
    props: SomalierBaseStateMachineProps
  ) {
    super(scope, id, props);

    this.lambdaRole = this.createLambdaRole();

    const listLambdaStep = this.createLambdaStep(
      "List",
      ["list.lambdaHandler"],
      undefined,
      "$.Payload",
      this.lambdaRole
    );

    // This is a workaround from the following issue
    // https://github.com/aws/aws-cdk/issues/23216
    // awaiting native support for a Distributed Map in CDK
    const dummyMap = new Map(this, "DummyMap");
    dummyMap.iterator(listLambdaStep);

    const distributedMap = new CustomState(this, "DistributedMap", {
      stateJson: {
        Type: "Map",
        ItemReader: {
          Resource: "arn:aws:states:::s3:listObjectsV2",
          Parameters: {
            Bucket: props.fingerprintBucket.bucketName,
            "Prefix.$": "$.fingerprintFolder",
          },
        },
        ItemBatcher: {
          // the number of kb of input in each batch.. our "list" output is probably going to be double
          // the input - so we set this well under the 256kb limits
          MaxInputBytesPerBatch: 1024 * 64,
          BatchInput: {
            "fingerprintFolder.$": "$.fingerprintFolder",
          },
        },
        ItemProcessor: {
          ...(dummyMap.toStateJson() as any).Iterator,
          ProcessorConfig: {
            Mode: "DISTRIBUTED",
            ExecutionType: "STANDARD",
          },
        },
        ResultWriter: {
          Resource: "arn:aws:states:::s3:putObject",
          Parameters: {
            Bucket: props.fingerprintBucket.bucketName,
            // note the prefix here should NOT have a trailing / (unlike some of other paths we use)
            Prefix: "temp",
          },
        },
        // ResultPath: "$.matches",
      },
    });

    // NOTE: we use a technique here to allow optional input parameters to the state machine
    // by defining defaults and then JsonMerging them with the actual input params
    this.stateMachine = new StateMachine(this, "StateMachine", {
      definition: new Pass(this, "Define Defaults", {
        parameters: {
          fingerprintFolder: "fingerprints/",
          bamRegex: "^.*$",
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
        .next(distributedMap)
        .next(new Succeed(this, "Succeed")),
    });

    this.stateMachine.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["states:StartExecution"],
        resources: [
          Arn.format(
            {
              arnFormat: ArnFormat.COLON_RESOURCE_NAME,
              service: "states",
              resource: "stateMachine",
              resourceName: "*",
            },
            Stack.of(this)
          ),
        ],
      })
    );

    this.stateMachine.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["states:DescribeExecution", "states:StopExecution"],
        resources: [
          Arn.format(
            {
              arnFormat: ArnFormat.COLON_RESOURCE_NAME,
              service: "states",
              resource: "execution",
              resourceName: "*" + "/*",
            },
            Stack.of(this)
          ),
        ],
      })
    );

    // this is too broad - but once the CFN native Distributed Map is created - it will handle this for us
    // (I think it isn't doing it because of our DummyMap)
    this.stateMachine.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["lambda:InvokeFunction"],
        resources: ["*"],
      })
    );

    props.fingerprintBucket.grantReadWrite(this.stateMachine);

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
