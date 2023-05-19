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
import { FingerprintLambda } from "./fingerprint-lambda";

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
   * Create a lambda for specific fingerprint activity.
   *
   * @param stepName a unique String to distinguish the CDK name for this lambda
   * @param cmd the CMD array for docker lambda entry
   * @protected
   */
  protected createFingerprintLambda(
    stepName: string,
    cmd: string[]
  ): FingerprintLambda {
    return new FingerprintLambda(this, `${stepName}Lambda`, {
      fingerprintBucket: this.props.fingerprintBucket,
      fingerprintConfigFolder: this.props.fingerprintConfigFolder,
      dockerImageAsset: this.props.dockerImageAsset,
      icaSecret: this.props.icaSecret,
      cmd: cmd,
    });
  }

  /**
   * Create an AWS Step that invokes a somalier docker based lambda.
   *
   * @param stepName a unique String to distinguish the CDK name for this lambda
   * @param lambda
   * @param inputPath the input path in the Steps flow for where lambda input should go (e.g. "$.data") or undefined for default
   * @param outputPath the output path in the Steps flow for where lambda output should go (e.g. "$.data") or undefined for default
   * @protected
   */
  protected createLambdaStep(
    stepName: string,
    lambda: FingerprintLambda,
    inputPath: string | undefined,
    outputPath: string | undefined
  ): LambdaInvoke {
    return new LambdaInvoke(this, `${stepName}Task`, {
      lambdaFunction: lambda.dockerImageFunction,
      inputPath: inputPath,
      outputPath: outputPath,
    });
  }
}
