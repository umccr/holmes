import * as path from "path";
import {
  CfnOutput,
  Duration,
  Stack,
  StackProps,
  Stage,
  StageProps,
  Tags,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import { DockerImageCode, DockerImageFunction } from "aws-cdk-lib/aws-lambda";
import {
  IRole,
  ManagedPolicy,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import {
  IntegrationPattern,
  JsonPath,
  Map,
  StateMachine,
  Succeed,
} from "aws-cdk-lib/aws-stepfunctions";
import {
  EcsFargateLaunchTarget,
  EcsRunTask,
  LambdaInvoke,
} from "aws-cdk-lib/aws-stepfunctions-tasks";
import { ISecret, Secret } from "aws-cdk-lib/aws-secretsmanager";
import { HttpNamespace, Service } from "aws-cdk-lib/aws-servicediscovery";
import {
  HolmesSettings,
  STACK_DESCRIPTION,
  TAG_STACK_VALUE,
} from "../holmes-settings";
import { SomalierExtractStateMachineConstruct } from "./somalier-extract-state-machine-construct";

type Props = {
  dockerImageAsset: DockerImageAsset;
  icaSecret: ISecret;
};

export class SomalierCheckStateMachineConstruct extends Construct {
  private readonly lambdaRole: IRole;
  private readonly stateMachine: StateMachine;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    // create a single role that is used by all our step functions (could tighten this if needed)
    const permissions = [
      "service-role/AWSLambdaBasicExecutionRole",
      "AmazonS3ReadOnlyAccess",
    ];

    this.lambdaRole = new Role(this, "Role", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
    });

    permissions.map((permission) => {
      this.lambdaRole.addManagedPolicy(
        ManagedPolicy.fromAwsManagedPolicyName(permission)
      );
    });

    // The gather function is used to collate the full list of fingerprints in the system - we could extend
    // it to use a db or look at S3 etc. This is also performs the chunking for the Map stage
    // NOTE: the 'cmd' is how we differ from the other Funcs
    const gatherFunc = new DockerImageFunction(
      this,
      "FingerprintGatherFunction",
      {
        memorySize: 2048,
        timeout: Duration.seconds(180),
        role: this.lambdaRole,
        code: DockerImageCode.fromEcr(props.dockerImageAsset.repository, {
          tag: props.dockerImageAsset.assetHash,
          cmd: ["gather.lambdaHandler"],
        }),
      }
    );
    const gatherInvoke = new LambdaInvoke(this, "FingerprintGatherTask", {
      lambdaFunction: gatherFunc,
      outputPath: "$.Payload",
    });

    // the output of this func is
    /*
       { index: FROM INPUT STEP,
         relatednessThreshold: FROM INPUT STEP,
         fingerprintTasks: [ [ "gds://vol/file1", "gds://vol/file2" ], [ "gds://vol/file3", "gds://vol/file4" ] ]
       }
     */

    // The check function is used to compare the index fingerprint against an array of other fingerprints
    // NOTE: the 'cmd' is how we differ from the other Funcs
    const checkFunc = new DockerImageFunction(
      this,
      "FingerprintCheckFunction",
      {
        memorySize: 2048,
        timeout: Duration.seconds(180),
        role: this.lambdaRole,
        code: DockerImageCode.fromEcr(props.dockerImageAsset.repository, {
          tag: props.dockerImageAsset.assetHash,
          cmd: ["check.lambdaHandler"],
        }),
        environment: {
          SECRET_ARN: props.icaSecret.secretArn,
        },
      }
    );
    const checkInvoke = new LambdaInvoke(this, "FingerprintCheckTask", {
      lambdaFunction: checkFunc,
      outputPath: "$.Payload.matches",
    });

    // The Map invoke step is the parallel invocation according to the dynamic array input
    const mapInvoke = new Map(this, "FingerprintMapTask", {
      inputPath: "$",
      itemsPath: "$.fingerprintTasks",
      parameters: {
        "index.$": "$.index",
        "relatednessThreshold.$": "$.relatednessThreshold",
        "fingerprints.$": "$$.Map.Item.Value",
      },
    }).iterator(checkInvoke);

    this.stateMachine = new StateMachine(this, "StateMachine", {
      definition: gatherInvoke
        .next(mapInvoke)
        .next(new Succeed(this, "Collate")),
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
