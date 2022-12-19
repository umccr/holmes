import * as path from "path";
import { CfnOutput, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { HttpNamespace, Service } from "aws-cdk-lib/aws-servicediscovery";
import { HolmesSettings, STACK_DESCRIPTION } from "../holmes-settings";
import { SomalierCheckStateMachineConstruct } from "./somalier-check-state-machine-construct";
import { Bucket, ObjectOwnership } from "aws-cdk-lib/aws-s3";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { Cluster } from "aws-cdk-lib/aws-ecs";
import { SomalierExtractStateMachineConstruct } from "./somalier-extract-state-machine-construct";
import { SomalierDifferenceThenExtractStateMachineConstruct } from "./somalier-difference-then-extract-state-machine-construct";
import { SomalierDifferenceStateMachineConstruct } from "./somalier-difference-state-machine-construct";
import { AccountPrincipal, ManagedPolicy, Role } from "aws-cdk-lib/aws-iam";

/**
 * The Holmes application is a stack that implements a BAM fingerprinting
 * service.
 */
export class HolmesApplicationStack extends Stack {
  // the output Steps functions we create (are also registered into CloudMap)
  // we output this here so it can be used in the codepipeline build for testing
  public readonly checkStepsArnOutput: CfnOutput;
  public readonly extractStepsArnOutput: CfnOutput;
  public readonly differenceStepsArnOutput: CfnOutput;
  public readonly differenceThenExtractStepsArnOutput: CfnOutput;

  // an optional output CFN for any stack that has decided it wants a role to be created for testing
  public readonly testerRoleArnOutput: CfnOutput;

  constructor(
    scope: Construct,
    id: string,
    props: StackProps & HolmesSettings
  ) {
    super(scope, id, props);

    this.templateOptions.description = STACK_DESCRIPTION;

    // for dev/testing we can defer "creating" this bucket and instead use one that already exists
    const fingerprintBucket = props.shouldCreateFingerprintBucket
      ? new Bucket(this, "FingerprintBucket", {
          bucketName: props.fingerprintBucketName,
          objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
          autoDeleteObjects: true,
          removalPolicy: RemovalPolicy.DESTROY,
        })
      : Bucket.fromBucketName(
          this,
          "FingerprintBucket",
          props.fingerprintBucketName
        );

    // we sometimes need to execute tasks in a VPC context
    const vpc = Vpc.fromLookup(this, "MainVpc", {
      vpcName: "main-vpc",
    });

    // a fargate cluster we use for non-lambda Tasks
    const cluster = new Cluster(this, "FargateCluster", { vpc });

    // we need access to a ICA JWT in order to be able to download from GDS
    const icaSecret = Secret.fromSecretNameV2(
      this,
      "IcaJwt",
      props.icaSecretNamePartial
    );

    // the testing role can be requested and will allow execution of the steps from
    // another account
    let testerRole: Role | undefined = undefined;

    if (props.createTesterRoleAllowingAccount) {
      testerRole = new Role(this, "TesterRole", {
        assumedBy: new AccountPrincipal(props.createTesterRoleAllowingAccount),
        description:
          "A role created only in dev that allows execution of tests from the build account",
      });

      // enable full access to the fingerprint bucket as the test does some deletion
      fingerprintBucket.grantReadWrite(testerRole);

      // we add steps execution permissions in the state machine constructs
    }

    // the Docker asset shared by all steps
    const asset = this.addFingerprintDockerAsset();

    const checkStateMachine = new SomalierCheckStateMachineConstruct(
      this,
      "SomalierCheck",
      {
        dockerImageAsset: asset,
        icaSecret: icaSecret,
        fingerprintBucket: fingerprintBucket,
        fargateCluster: cluster,
        allowExecutionByTesterRole: testerRole,
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
        fargateCluster: cluster,
        allowExecutionByTesterRole: testerRole,
        ...props,
      }
    );

    const differenceStateMachine = new SomalierDifferenceStateMachineConstruct(
      this,
      "SomalierDifference",
      {
        dockerImageAsset: asset,
        icaSecret: icaSecret,
        fingerprintBucket: fingerprintBucket,
        fargateCluster: cluster,
        allowExecutionByTesterRole: testerRole,
        ...props,
      }
    );

    const differenceThenExtractStateMachine =
      new SomalierDifferenceThenExtractStateMachineConstruct(
        this,
        "SomalierDifferenceThenExtract",
        {
          dockerImageAsset: asset,
          icaSecret: icaSecret,
          fingerprintBucket: fingerprintBucket,
          fargateCluster: cluster,
          allowExecutionByTesterRole: testerRole,
          ...props,
        }
      );

    icaSecret.grantRead(checkStateMachine.taskRole);
    icaSecret.grantRead(extractStateMachine.taskRole);
    icaSecret.grantRead(differenceStateMachine.taskRole);
    icaSecret.grantRead(differenceThenExtractStateMachine.taskRole);
    icaSecret.grantRead(differenceThenExtractStateMachine.lambdaTaskRole);

    fingerprintBucket.grantRead(checkStateMachine.taskRole);
    fingerprintBucket.grantRead(differenceStateMachine.taskRole);
    fingerprintBucket.grantReadWrite(extractStateMachine.taskRole);
    fingerprintBucket.grantReadWrite(
      differenceThenExtractStateMachine.taskRole
    );
    fingerprintBucket.grantReadWrite(
      differenceThenExtractStateMachine.lambdaTaskRole
    );

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
      description: STACK_DESCRIPTION,
    });

    service.registerNonIpInstance("NonIp", {
      customAttributes: {
        checkStepsArn: checkStateMachine.stepsArn,
        extractStepsArn: extractStateMachine.stepsArn,
        differenceStepsArn: differenceStateMachine.stepsArn,
        differenceThenExtractStepsArn:
          differenceThenExtractStateMachine.stepsArn,
      },
    });

    if (testerRole) {
      this.testerRoleArnOutput = new CfnOutput(this, "TesterRoleArn", {
        value: testerRole.roleArn,
      });
    }

    this.checkStepsArnOutput = new CfnOutput(this, "CheckStepsArn", {
      value: checkStateMachine.stepsArn,
    });

    this.extractStepsArnOutput = new CfnOutput(this, "ExtractStepsArn", {
      value: extractStateMachine.stepsArn,
    });

    this.differenceStepsArnOutput = new CfnOutput(this, "DifferenceStepsArn", {
      value: differenceStateMachine.stepsArn,
    });

    this.differenceThenExtractStepsArnOutput = new CfnOutput(
      this,
      "DifferenceThenExtractStepsArn",
      {
        value: differenceThenExtractStateMachine.stepsArn,
      }
    );
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
