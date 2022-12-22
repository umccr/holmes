import { Construct } from "constructs";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import {
  LambdaInvoke,
  TaskEnvironmentVariable,
} from "aws-cdk-lib/aws-stepfunctions-tasks";
import { ICluster } from "aws-cdk-lib/aws-ecs";
import {
  IRole,
  ManagedPolicy,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { DockerImageCode, DockerImageFunction } from "aws-cdk-lib/aws-lambda";
import { Duration } from "aws-cdk-lib";

export type SomalierBaseStateMachineProps = {
  dockerImageAsset: DockerImageAsset;

  fargateCluster: ICluster;

  icaSecret: ISecret;

  fingerprintBucket: IBucket;
  fingerprintConfigFolder: string;

  allowExecutionByTesterRole?: Role;
};

/**
 * The Somalier base state machine holds all common state machine functionality,
 * allowing us to build a variety of state machines constructs using common
 * lambda and tasks.
 */
export class SomalierBaseStateMachineConstruct extends Construct {
  constructor(
    scope: Construct,
    id: string,
    protected props: SomalierBaseStateMachineProps
  ) {
    super(scope, id);
  }

  /**
   * Create a role used by all the lambdas in the state machine.
   *
   * @protected
   */
  protected createLambdaRole(): IRole {
    // create a single role that is used by all our step functions (could tighten this if needed)
    const permissions = [
      "service-role/AWSLambdaBasicExecutionRole",
      // question - could we reduce this to just read access to fingerprint bucket?
      // (probably no - it also accesses reference data via s3?)
      "AmazonS3ReadOnlyAccess",
    ];

    const lambdaRole = new Role(this, "Role", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
    });

    permissions.map((permission) => {
      lambdaRole.addManagedPolicy(
        ManagedPolicy.fromAwsManagedPolicyName(permission)
      );
    });

    return lambdaRole;
  }

  protected createLambdaEnv(): {
    [k: string]: string;
  } {
    return {
      SECRET_ARN: this.props.icaSecret.secretArn,
      FINGERPRINT_BUCKET_NAME: this.props.fingerprintBucket.bucketName,
      FINGERPRINT_CONFIG_FOLDER: this.props.fingerprintConfigFolder,
    };
  }

  protected createFargateLambdaEnv(): TaskEnvironmentVariable[] {
    return Array.from(
      Object.entries(this.createLambdaEnv()).map(([k, v]) => {
        return {
          name: k,
          value: v,
        };
      })
    );
  }

  /**
   * Create an AWS Step that invokes a somalier docker based lambda.
   *
   * @param stepName a unique String to distinguish the CDK name for this lambda
   * @param cmd the CMD array for docker lambda entry
   * @param inputPath the input path in the Steps flow for where lambda input should go (e.g. "$.data") or undefined for default
   * @param outputPath the output path in the Steps flow for where lambda output should go (e.g. "$.data") or undefined for default
   * @param role the role to assign the invoked lambda
   * @protected
   */
  protected createLambdaStep(
    stepName: string,
    cmd: string[],
    inputPath: string | undefined,
    outputPath: string | undefined,
    role: IRole
  ): LambdaInvoke {
    const func = new DockerImageFunction(this, `${stepName}Function`, {
      // as an example - processing a batch size of about 10 takes < 10 seconds
      // and requires in practice about 128k of memory
      memorySize: 1024,
      timeout: Duration.minutes(1),
      role: role,
      code: DockerImageCode.fromEcr(this.props.dockerImageAsset.repository, {
        tagOrDigest: this.props.dockerImageAsset.assetHash,
        cmd: cmd,
      }),
      environment: this.createLambdaEnv(),
    });
    return new LambdaInvoke(this, `${stepName}Task`, {
      lambdaFunction: func,
      inputPath: inputPath,
      outputPath: outputPath,
    });
  }
}
