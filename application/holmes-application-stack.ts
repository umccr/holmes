import * as path from "path";
import { CfnOutput, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { HttpNamespace, Service } from "aws-cdk-lib/aws-servicediscovery";
import { HolmesSettings, STACK_DESCRIPTION } from "../holmes-settings";
import { SomalierExtractStateMachineConstruct } from "./somalier-extract-state-machine-construct";
import { SomalierCheckStateMachineConstruct } from "./somalier-check-state-machine-construct";
import { Bucket } from "aws-cdk-lib/aws-s3";
import {
  AttributeType,
  BillingMode,
  ProjectionType,
  Table,
} from "aws-cdk-lib/aws-dynamodb";

export class HolmesApplicationStack extends Stack {
  // the output Steps functions we create (are also registered into CloudMap)
  // we output this here so it can be used in the codepipeline build for testing
  public readonly checkStepsArnOutput: CfnOutput;
  public readonly extractStepsArnOutput: CfnOutput;

  constructor(
    scope: Construct,
    id: string,
    props: StackProps & HolmesSettings
  ) {
    super(scope, id, props);

    this.templateOptions.description = STACK_DESCRIPTION;

    const fingerprintBucket = new Bucket(this, "FingerprintBucket", {
      bucketName: props.fingerprintBucketNameToCreate,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // we need access to a ICA JWT in order to be able to download from GDS
    const icaSecret = Secret.fromSecretNameV2(
      this,
      "IcaJwt",
      props.icaSecretNamePartial
    );

    // the Docker asset shared by all steps
    const asset = this.addFingerprintDockerAsset();

    const checkStateMachine = new SomalierCheckStateMachineConstruct(
      this,
      "SomalierCheck",
      {
        dockerImageAsset: asset,
        icaSecret: icaSecret,
        fingerprintBucket: fingerprintBucket,
        ...props,
      }
    );

    const extractStateMachine = new SomalierExtractStateMachineConstruct(
      this,
      "SomalierExtract",
      {
        dockerImageAsset: asset,
        icaSecret: icaSecret,
        fingerprintBucket: fingerprintBucket,
        ...props,
      }
    );

    icaSecret.grantRead(checkStateMachine.taskRole);
    icaSecret.grantRead(extractStateMachine.taskRole);

    fingerprintBucket.grantRead(checkStateMachine.taskRole);
    fingerprintBucket.grantReadWrite(extractStateMachine.taskRole);

    /* I don't understand CloudMap - there seems no way for me to import in a namespace that
        already exists... other than providing *all* the details... and a blank arn?? */
    const namespace = HttpNamespace.fromHttpNamespaceAttributes(
      this,
      "Namespace",
      {
        namespaceId: props.namespaceId,
        namespaceName: props.namespaceName,
        namespaceArn: "",
      }
    );

    const service = new Service(this, "Service", {
      namespace: namespace,
      name: "fingerprint",
      description:
        "Service for rapidly identifying existing BAM files with similar content",
    });

    service.registerNonIpInstance("NonIp", {
      customAttributes: {
        checkStepsArn: checkStateMachine.stepsArn,
        extractStepsArn: extractStateMachine.stepsArn,
      },
    });

    this.checkStepsArnOutput = new CfnOutput(this, "CheckStepsArn", {
      value: checkStateMachine.stepsArn,
    });

    this.extractStepsArnOutput = new CfnOutput(this, "ExtractStepsArn", {
      value: extractStateMachine.stepsArn,
    });
  }

  /**
   * The fingerprint docker asset is a lambda containing multiple entry points for various stages of
   * the steps function.
   *
   * @private
   */
  private addFingerprintDockerAsset(): DockerImageAsset {
    const dockerImageFolder = path.join(__dirname, "fingerprint-docker-image");

    return new DockerImageAsset(this, "FingerprintDockerImage", {
      directory: dockerImageFolder,
      buildArgs: {},
    });
  }
}
