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
   * ICA secret name to allow us to make calls to fetch GDS files
   */
  readonly icaSecretNamePartial: string;

  /**
   * Bucket name of the fingerprint bucket (to create or use - see below)
   */
  readonly fingerprintBucketName: string;

  /**
   * This allows us to setup a stack with a pre-defined bucket fingerprint (good for dev/test) -
   * but the default here is we would leave it to the CDK stack to create the fingerprint bucket.
   */
  readonly shouldCreateFingerprintBucket: boolean;

  /**
   * Fingerprint config folder (in bucket) - must end with slash - will generally be config/
   */
  readonly fingerprintConfigFolder: string;

  /**
   * If set tells the stack to make an extra role that can be used to execute any of the steps
   * functions (and S3 actions in the fingerprint bucket) - with an assume role from the given
   * account.
   */
  readonly createTesterRoleAllowingAccount?: string;

  /**
   * If present, installs a tool to send regular reports to Slack about new fingerprints
   */
  readonly slackNotifier?: {
    /**
     * The name of channel in Slack that should be sent daily notifications.
     */
    readonly channel: string;

    /**
     * The Cron expression for when to run the slack notification
     */
    readonly cron: string;

    // The following are settings that are normally API parameters to the lambdads - but we do not
    // give our Slack users a chance to set these (should we?)
    // So anyhow they have to be baked in at this config level

    /**
     * The specific folder to look into for new fingerprints to report for Slack
     */
    readonly fingerprintFolder: string;

    /**
     * The relatedness threshold to report against for Slack
     */
    readonly relatednessThreshold: number;

    /**
     * A minimum N count that we need to meet to report against for Slack
     */
    readonly minimumNCount: number;

    /**
     * if present a regex that is matched to BAM filenames (i.e. not against the hex encoded keys)
     * and tells us to exclude them from sending to "somalier relate"
     */
    readonly excludeRegex?: string;

    /**
     * If present a regex that generates match groups - and expects all fingerprints with group matches
     * to the index - to also be 'related' genomically.. this is used to detect fingerprints that *should*
     * be related but come back not related
     */
    readonly expectRelatedRegex?: string;
  };
}
