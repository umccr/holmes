import * as path from "path";
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
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
import { AccountPrincipal, ManagedPolicy, Role } from "aws-cdk-lib/aws-iam";
import { SomalierListStateMachineConstruct } from "./somalier-list-state-machine-construct";
import { SomalierPairsStateMachineConstruct } from "./somalier-pairs-state-machine-construct";

/**
 * The Holmes application is a stack that implements a BAM fingerprinting
 * service.
 */
export class HolmesApplicationStack extends Stack {
  // the output Steps functions we create (are also registered into CloudMap)
  // we output this here so it can be used in the codepipeline build for testing
  public readonly checkStepsArnOutput: CfnOutput;
  public readonly extractStepsArnOutput: CfnOutput;
  public readonly pairsStepsArnOutput: CfnOutput;

  // an optional output CFN for any stack that has decided it wants a role to be created for testing
  public readonly testerRoleArnOutput: CfnOutput;

  constructor(
    scope: Construct,
    id: string,
    props: StackProps & HolmesSettings
  ) {
    super(scope, id, props);

    this.templateOptions.description = STACK_DESCRIPTION;

    // for local dev/testing we can defer "creating" this bucket and instead use one that already exists
    const fingerprintBucket = props.shouldCreateFingerprintBucket
      ? new Bucket(this, "FingerprintBucket", {
          bucketName: props.fingerprintBucketName,
          objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
          lifecycleRules: [
            // we give the test suites the ability to create folders like fingerprints-test-01231432/
            // and we will auto delete them later
            {
              prefix: "fingerprints-test",
              expiration: Duration.days(1),
            },
            // not used but if we do ever need to make temp files this is where they would live
            {
              prefix: "temp",
              expiration: Duration.days(1),
            },
          ],
          // because there is some though of deleting some source bams after fingerprinting - we
          // don't even want the more production buckets to autodelete
          autoDeleteObjects: false,
          removalPolicy: RemovalPolicy.RETAIN,
        })
      : Bucket.fromBucketName(
          this,
          "FingerprintBucket",
          props.fingerprintBucketName
        );

    // we sometimes need to execute tasks in a VPC context so we need one of these
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
    const dockerImageFolder = path.join(__dirname, "fingerprint-docker-image");

    const asset = new DockerImageAsset(this, "FingerprintDockerImage", {
      directory: dockerImageFolder,
      buildArgs: {},
    });

    const stateProps = {
      dockerImageAsset: asset,
      icaSecret: icaSecret,
      fingerprintBucket: fingerprintBucket,
      fargateCluster: cluster,
      allowExecutionByTesterRole: testerRole,
      ...props,
    };

    const checkStateMachine = new SomalierCheckStateMachineConstruct(
      this,
      "SomalierCheck",
      stateProps
    );

    const extractStateMachine = new SomalierExtractStateMachineConstruct(
      this,
      "SomalierExtract",
      stateProps
    );

    const listStateMachine = new SomalierListStateMachineConstruct(
      this,
      "SomalierList",
      stateProps
    );

    const pairsStateMachine = new SomalierPairsStateMachineConstruct(
      this,
      "SomalierPairs",
      stateProps
    );

    icaSecret.grantRead(checkStateMachine.taskRole);
    icaSecret.grantRead(extractStateMachine.taskRole);
    icaSecret.grantRead(listStateMachine.taskRole);
    icaSecret.grantRead(pairsStateMachine.taskRole);

    fingerprintBucket.grantRead(checkStateMachine.taskRole);
    fingerprintBucket.grantRead(listStateMachine.taskRole);
    fingerprintBucket.grantRead(pairsStateMachine.taskRole);
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
      description: STACK_DESCRIPTION,
    });

    service.registerNonIpInstance("NonIp", {
      customAttributes: {
        checkStepsArn: checkStateMachine.stepsArn,
        extractStepsArn: extractStateMachine.stepsArn,
        pairsStepsArn: pairsStateMachine.stepsArn,
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

    this.pairsStepsArnOutput = new CfnOutput(this, "PairsStepsArn", {
      value: pairsStateMachine.stepsArn,
    });
  }
}
