import { Construct } from "constructs";
import { Effect, IRole, PolicyStatement } from "aws-cdk-lib/aws-iam";
import {
  CustomState,
  Map,
  StateMachine,
  Succeed,
} from "aws-cdk-lib/aws-stepfunctions";
import {
  SomalierBaseStateMachineConstruct,
  SomalierBaseStateMachineProps,
} from "./somalier-base-state-machine-construct";
import { Arn, ArnFormat, Stack } from "aws-cdk-lib";

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
    /*const checkStartInvoke = this.createLambdaStep(
      "CheckStart",
      ["check-start.lambdaHandler"],
      "$.Payload",
      this.lambdaRole,
      props
    ); */

    // gds://development/FAKE00001/NTC.bam  6764733a2f2f646576656c6f706d656e742f46414b4530303030312f4e54432e62616d
    // gds://development/FAKE00002/NTC.bam  6764733a2f2f646576656c6f706d656e742f46414b4530303030322f4e54432e62616d
    // gds://development/FAKE00003/NTC.bam  6764733a2f2f646576656c6f706d656e742f46414b4530303030332f4e54432e62616d
    // gds://development/FAKE00004/NTC.bam  6764733a2f2f646576656c6f706d656e742f46414b4530303030342f4e54432e62616d
    // gds://development/FAKE00005/NTC.bam  6764733a2f2f646576656c6f706d656e742f46414b4530303030352f4e54432e62616d
    // gds://development/FAKE00006/NTC.bam  6764733a2f2f646576656c6f706d656e742f46414b4530303030362f4e54432e62616d
    // gds://development/FAKE00007/NTC.bam  6764733a2f2f646576656c6f706d656e742f46414b4530303030372f4e54432e62616d
    // gds://development/FAKE00008/NTC.bam  6764733a2f2f646576656c6f706d656e742f46414b4530303030382f4e54432e62616d
    // gds://development/FAKE00009/NTC.bam  6764733a2f2f646576656c6f706d656e742f46414b4530303030392f4e54432e62616d

    // gds://development/OTHERFAKE00001/PTC.bam  6764733a2f2f646576656c6f706d656e742f4f5448455246414b4530303030312f5054432e62616d
    // gds://development/OTHERFAKE00002/PTC.bam  6764733a2f2f646576656c6f706d656e742f4f5448455246414b4530303030322f5054432e62616d
    // gds://development/OTHERFAKE00003/PTC.bam  6764733a2f2f646576656c6f706d656e742f4f5448455246414b4530303030332f5054432e62616d
    // gds://development/OTHERFAKE00004/PTC.bam  6764733a2f2f646576656c6f706d656e742f4f5448455246414b4530303030342f5054432e62616d
    // gds://development/OTHERFAKE00005/PTC.bam  6764733a2f2f646576656c6f706d656e742f4f5448455246414b4530303030352f5054432e62616d
    // gds://development/OTHERFAKE00006/PTC.bam  6764733a2f2f646576656c6f706d656e742f4f5448455246414b4530303030362f5054432e62616d
    // gds://development/OTHERFAKE00007/PTC.bam  6764733a2f2f646576656c6f706d656e742f4f5448455246414b4530303030372f5054432e62616d
    // gds://development/OTHERFAKE00008/PTC.bam  6764733a2f2f646576656c6f706d656e742f4f5448455246414b4530303030382f5054432e62616d
    // gds://development/OTHERFAKE00009/PTC.bam  6764733a2f2f646576656c6f706d656e742f4f5448455246414b4530303030392f5054432e62616d

    // This is a workaround from the following issue
    //https://github.com/aws/aws-cdk/issues/23216
    // awaiting native support for a Distributed Map in CDK

    const checkLambdaStep = this.createLambdaStep(
      "Check",
      ["check.lambdaHandler"],
      "$.Payload.matches",
      this.lambdaRole,
      props
    );

    const dummyMap = new Map(this, "DummyMap");
    dummyMap.iterator(checkLambdaStep);

    const distributedMap = new CustomState(this, "DistributedMap", {
      stateJson: {
        Type: "Map",
        MaxConcurrency: 100,
        ItemReader: {
          Resource: "arn:aws:states:::s3:listObjectsV2",
          Parameters: {
            Bucket: props.fingerprintBucket.bucketName,
            Prefix: "prints/",
          },
        },
        ItemBatcher: {
          MaxItemsPerBatch: 5,
          BatchInput: {
            "index.$": "$.index",
            "relatednessThreshold.$": "$.relatednessThreshold",
          },
        },
        ItemProcessor: {
          ...(dummyMap.toStateJson() as any).Iterator,
          ProcessorConfig: {
            Mode: "DISTRIBUTED",
            ExecutionType: "STANDARD",
          },
        },
        /* ResultWriter: {
          Resource: "arn:aws:states:::s3:putObject",
          Parameters: {
            Bucket: props.fingerprintBucket.bucketName,
            // note the prefix here should not have a trailing /
            Prefix: "temp",
          },
        }, */
        ResultPath: "$.map_result",
      },
    });

    // The Map invoke step is the parallel invocation of Check according to the dynamic array input
    /* const checkMapInvoke = new Map(this, "FingerprintMapTask", {
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
    ); */

    this.stateMachine = new StateMachine(this, "StateMachine", {
      definition: distributedMap.next(new Succeed(this, "Succeed")),
    });

    /*{
      "Effect": "Allow",
      "Action": [
        "states:StartExecution"
      ],
      "Resource": [
        "arn:aws:states:region:accountID:stateMachine:stateMachineName"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [

      ],
      "Resource": "arn:aws:states:region:accountID:execution:stateMachineName/*"
    }*/

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
