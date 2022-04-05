/**
 * The value of the Stack tag that we try to set throughout the entire deployment (for accurate costing)
 */
export const TAG_STACK_VALUE = "Holmes";


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