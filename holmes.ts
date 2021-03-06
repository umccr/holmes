import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { HolmesPipelineStack } from "./holmes-pipeline-stack";
import { TAG_STACK_VALUE } from "./holmes-settings";
import {
  AWS_BUILD_ACCOUNT,
  AWS_BUILD_REGION,
  AWS_DEV_ACCOUNT,
  AWS_DEV_REGION,
  FASTA_BUCKET,
  FASTA_KEY,
  SITES_BUCKET,
  SITES_KEY,
} from "./umccr-constants";
import { HolmesApplicationStack } from "./application/holmes-application-stack";

const app = new cdk.App();

/**
 * This is the main pipeline stack that is deployed into the build
 * account and controls the build/deployment of the application.
 */
new HolmesPipelineStack(app, "HolmesPipelineStack", {
  // the pipeline can only be deployed to 'build' and this should only happen once
  env: {
    account: AWS_BUILD_ACCOUNT,
    region: AWS_BUILD_REGION,
  },
  tags: {
    Stack: TAG_STACK_VALUE,
  },
});

/**
 * This is a stack that can be deployed only in the dev account - and direct from
 * a developers desktop for quick turnaround on feature development.
 */
new HolmesApplicationStack(app, "HolmesSandboxStack", {
  description:
    "Sandbox deployment of Holmes during development - feel free to tear down",
  icaSecretNamePartial: "IcaSecretsPortal", // pragma: allowlist secret
  namespaceName: "umccr-sandbox",
  namespaceId: "ns-l7oievhyca6utk2m",
  env: {
    account: AWS_DEV_ACCOUNT,
    region: AWS_DEV_REGION,
  },
  fingerprintBucketNameToCreate: "sandbox-fingerprint-please-remove",
  bamSources: ["gds://development/analysis_data"],
  bamLimits: ["wgs_alignment_qc"],
  referenceFastaBucketName: FASTA_BUCKET,
  referenceFastaBucketKey: FASTA_KEY,
  sitesBucketName: SITES_BUCKET,
  sitesBucketKey: SITES_KEY,
});
