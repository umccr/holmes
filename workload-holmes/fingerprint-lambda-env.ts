import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { IBucket } from "aws-cdk-lib/aws-s3";

/**
 * Just a little common function so we can share env variable names
 * between both fargate and lambdas.
 * @param p properties to turn into environment variables
 */
export function standardEnv(p: {
  icaSecret: ISecret;
  fingerprintBucket: IBucket;
  fingerprintConfigFolder: string;
}): {
  [k: string]: string;
} {
  return {
    SECRET_ARN: p.icaSecret.secretArn,
    FINGERPRINT_BUCKET_NAME: p.fingerprintBucket.bucketName,
    FINGERPRINT_CONFIG_FOLDER: p.fingerprintConfigFolder,
  };
}
