/**
 * The value of the Stack tag that we try to set throughout the entire deployment (for accurate costing)
 */
export const TAG_STACK_VALUE = "Holmes";

/**
 * The value of the CloudFormation description set throughout all stacks
 */
export const STACK_DESCRIPTION =
  "Holmes is a service for querying the somalier files in GDS/S3 looking for matching genomic data compared to an index file";

export type HolmesSettings = HolmesStackSettings & HolmesReferenceDataSettings;

export interface HolmesStackSettings {
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

  /**
   * Fingerprint bucket name of the bucket
   */
  readonly fingerprintBucketName: string;

  /**
   * This allows us to setup a stack with a pre-defined bucket fingerprint (good for dev/test) -
   * but the default here is we would leave it to the CDK stack to create the fingerprint bucket.
   */
  readonly shouldCreateFingerprintBucket: boolean;

  /**
   * BAM sources (url of folders)
   */
  readonly bamSources: string[];

  /**
   * BAM limits - strings that must be present in the path for the BAM to count
   */
  readonly bamLimits: string[];

  /**
   * If set tells the stack to make an extra role that can be used to execute any of the steps
   * functions (and S3 actions in the fingerprint bucket) - with an assume role from the given
   * account.
   */
  readonly createTesterRoleAllowingAccount?: string;
}

export interface HolmesReferenceDataSettings {
  /**
   * Reference FASTA bucket name
   */
  readonly referenceFastaBucketName: string;
  /**
   * Reference FASTA key
   */
  readonly referenceFastaBucketKey: string;

  /**
   * Sites VCF bucket name
   */
  readonly sitesBucketName: string;
  /**
   * Sites VCF key
   */
  readonly sitesBucketKey: string;
}
