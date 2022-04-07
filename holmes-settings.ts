/**
 * The value of the Stack tag that we try to set throughout the entire deployment (for accurate costing)
 */
export const TAG_STACK_VALUE = "Holmes";

/**
 * The value of the CloudFormation description set throughout all stacks
 */
export const STACK_DESCRIPTION =
  "Holmes is a service for querying the somalier files in GDS/S3 looking for matching genomic data compared to an index file";

export interface HolmesSettings {
  /**
   * The CloudMap namespace to register the Steps function into
   */
  readonly namespaceName: string;

  /**
   * The id of the CloudMap namespace to register the Steps function into
   * NOTE: to be removed once there is a CloudMap.lookup() in CDK.
   */
  readonly namespaceId: string;

  /**
   * ICA secret name
   */
  readonly icaSecretNamePartial: string;
}
