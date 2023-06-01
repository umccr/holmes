import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { AWS_DEV_ACCOUNT, AWS_DEV_REGION } from "../umccr-constants";
import { HolmesApplicationStack } from "../../workload-holmes/holmes-application-stack";

const app = new cdk.App();

/**
 * This is a stack that can be deployed only in the dev account - and direct from
 * a developers desktop for quick turnaround on feature development.
 */
new HolmesApplicationStack(app, "HolmesLocalDevTestStack", {
  description:
    "Local dev/test deployment of Holmes during development - feel free to tear down - this is *not* part of the CodePipeline deploy",
  icaSecretNamePartial: "IcaSecretsPortal", // pragma: allowlist secret
  namespaceName: "umccr",
  namespaceId: "ns-mjt63c4ppdrly4jd",
  env: {
    account: AWS_DEV_ACCOUNT,
    region: AWS_DEV_REGION,
  },
  fingerprintBucketName: "umccr-fingerprint-local-dev-test",
  shouldCreateFingerprintBucket: false,
  fingerprintConfigFolder: "config/",
  slackNotifier: {
    cron: "cron(0 12 ? * * *)",
    days: undefined,
    // change this to the personal id of whichever dev is doing dev work
    channel: "C058W0G54H2",
    // fingerprintFolder: "fingerprints-test-bc13669e6503cdd3ab0ec7cef47a5b950968a02d/",
    fingerprintFolder: "fingerprints-prod/",
    // the default settings to use for all our Slack interactions with the API/lambdas
    relatednessThreshold: 0.8,
    minimumNCount: 50,
    expectRelatedRegex: "^.*SBJ(\\d\\d\\d\\d\\d).*$",
    excludeRegex: "^.*(PTC_|NTC_).*$",
  },
});
