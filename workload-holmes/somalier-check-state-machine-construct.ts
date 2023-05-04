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
 * A statemachine thats checks for somalier similarity between a large set of BAM files
 * and some passed in 'index' BAM files.
 */
export class SomalierCheckStateMachineConstruct extends SomalierBaseStateMachineConstruct {
  private readonly lambdaRole: IRole;
  private readonly stateMachine: StateMachine;

  constructor(
    scope: Construct,
    id: string,
    props: SomalierBaseStateMachineProps & { resultWriter?: any }
  ) {
    super(scope, id, props);

    this.lambdaRole = this.createLambdaRole();

    const checkLambdaStep = this.createLambdaStep(
      "Check",
      ["check.lambdaHandler"],
      undefined,
      "$.Payload",
      this.lambdaRole
    );

    // This is a workaround from the following issue
    // https://github.com/aws/aws-cdk/issues/23216
    // awaiting native support for a Distributed Map in CDK
    const dummyMap = new Map(this, "DummyMap");
    dummyMap.iterator(checkLambdaStep);

    const distributedMap = new CustomState(this, "DistributedMap", {
      stateJson: {
        Type: "Map",
        // we will be limited by the concurrency of our lambda itself - which by default is 1000
        // at this concurrency and a items per batch of 10 we easily handle more sample ids than the lab
        // has ever currently processed
        MaxConcurrency: 900,
        ItemReader: {
          Resource: "arn:aws:states:::s3:listObjectsV2",
          Parameters: {
            Bucket: props.fingerprintBucket.bucketName,
            "Prefix.$": "$.fingerprintFolder",
          },
        },
        ItemBatcher: {
          MaxItemsPerBatch: 50,
          // map all our params across as batch input
          // we can do this with confidence because our steps ensures that everyone of these has a default
          BatchInput: {
            "indexes.$": "$.indexes",
            "relatednessThreshold.$": "$.relatednessThreshold",
            "minimumNCount.$": "$.minimumNCount",
            "fingerprintFolder.$": "$.fingerprintFolder",
            "excludeRegex.$": "$.excludeRegex",
            "expectRelatedRegex.$": "$.expectRelatedRegex",
          },
        },
        // if result writer is set - this allows us to chose to write the (potentially large) result
        // set out to S3 for parsing
        ResultWriter: props.resultWriter,
        ItemProcessor: {
          ...(dummyMap.toStateJson() as any).Iterator,
          ProcessorConfig: {
            Mode: "DISTRIBUTED",
            ExecutionType: "STANDARD",
          },
        },
        ResultPath: "$.matches",
      },
    });

    let def = new Pass(this, "Define Defaults", {
      parameters: {
        // by default we want to avoid kinship detection in the checking - so setting this high
        relatednessThreshold: 0.8,
        // by default we get very little value out of comparisons between samples where N is low
        minimumNCount: 50,
        // this is a regex that by default *won't* exclude anything
        excludeRegex: "^\\b$",
        // this is a regex that by default *won't* match anything - and hence will do no "expected" related checks
        expectRelatedRegex: "^\\b$",
        fingerprintFolder: "fingerprints/",
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
      .next(distributedMap);

    if (!props.resultWriter) {
      // if we have a ResultWriter - then the distributed map returns the location of the output
      // and we just want to pass that through
      // otherwise we want to collapse the results down to a unique array
      def = def.next(
        new Pass(this, "Remove Empties", {
          // remove all the empty {} results from any workers that matched nothing
          // (I mean - this leaves one of the {} as the function is a ArrayUnique - not remove empty)
          resultPath: "$.uniqued",
          outputPath: "$.uniqued.unique",
          parameters: {
            "unique.$": "States.ArrayUnique($.matches)",
          },
        })
      );
    }

    def = def.next(new Succeed(this, "Succeed"));

    // NOTE: we use a technique here to allow optional input parameters to the state machine
    // by defining defaults and then JsonMerging them with the actual input params
    this.stateMachine = new StateMachine(this, "StateMachine", {
      definition: def,
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
