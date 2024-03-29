import { DockerImageCode, DockerImageFunction } from "aws-cdk-lib/aws-lambda";
import { Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import {
  IRole,
  ManagedPolicy,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { standardEnv } from "./fingerprint-lambda-env";

type Props = {
  dockerImageAsset: DockerImageAsset;

  icaSecret: ISecret;

  fingerprintBucket: IBucket;
  fingerprintConfigFolder: string;

  cmd: string[];

  extraEnv?: {
    [k: string]: string;
  };
};

/**
 * A lambda performing one of our fingerprint tasks.
 *
 * Uses a standard docker image - but then is customised
 * with a custom CMD.
 */
export class FingerprintLambda extends Construct {
  public readonly dockerImageFunction: DockerImageFunction;
  public readonly role: IRole;

  constructor(scope: Construct, id: string, private props: Props) {
    super(scope, id);

    this.role = this.createLambdaRole();

    this.dockerImageFunction = this.createLambda(this.role);
  }

  /**
   * Create a role used by all the lambdas in the state machine.
   *
   * @protected
   */
  createLambdaRole(): IRole {
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

  private createLambda(role: IRole) {
    return new DockerImageFunction(this, `Function`, {
      // as an example - processing a batch size of about 10 takes < 10 seconds
      // and requires in practice about 128k of memory
      memorySize: 4096,
      timeout: Duration.minutes(1),
      role: role,
      code: DockerImageCode.fromEcr(this.props.dockerImageAsset.repository, {
        tagOrDigest: this.props.dockerImageAsset.assetHash,
        cmd: this.props.cmd,
      }),
      environment: this.props.extraEnv
        ? { ...standardEnv(this.props), ...this.props.extraEnv }
        : standardEnv(this.props),
    });
  }
}
