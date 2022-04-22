import { pipelines, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { STACK_DESCRIPTION } from "./holmes-settings";
import {
  AWS_DEV_ACCOUNT,
  AWS_DEV_REGION,
  AWS_PROD_ACCOUNT,
  AWS_PROD_REGION,
  FASTA_BUCKET,
  FASTA_KEY,
  NAMESPACE_DEV_ID,
  NAMESPACE_NAME,
  NAMESPACE_PROD_ID,
  SITES_BUCKET,
  SITES_KEY,
} from "./umccr-constants";
import { HolmesBuildStage } from "./holmes-build-stage";

/**
 * Stack to hold the self mutating pipeline, and all the relevant settings for deployments
 */
export class HolmesPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.templateOptions.description = STACK_DESCRIPTION;

    // these are *build* parameters that we either want to re-use across lots of stacks, or are
    // 'sensitive' enough we don't want them checked into Git - but not sensitive enough to record as a Secret
    const codeStarArn = StringParameter.valueFromLookup(
      this,
      "codestar_github_arn"
    );

    const pipeline = new pipelines.CodePipeline(this, "Pipeline", {
      // should normally be commented out - only use when debugging pipeline itself
      // selfMutation: false,
      // turned on because our stack makes docker assets
      dockerEnabledForSynth: true,
      dockerEnabledForSelfMutation: true,
      synth: new pipelines.CodeBuildStep("Synth", {
        // Use a connection created using the AWS console to authenticate to GitHub
        // Other sources are available.
        input: pipelines.CodePipelineSource.connection("umccr/holmes", "main", {
          connectionArn: codeStarArn,
        }),
        env: {},
        commands: [
          "npm ci",
          // our cdk is configured to use ts-node - so we don't need any build step - just synth
          "npx cdk synth",
        ],
        rolePolicyStatements: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["sts:AssumeRole"],
            resources: ["*"],
            //conditions: {
            //  StringEquals: {
            //    "iam:ResourceTag/aws-cdk:bootstrap-role": "lookup",
            //  },
            //},
          }),
        ],
      }),
      codeBuildDefaults: {
        // we need to give the codebuild engines permissions to assume a role in DEV - in order that they
        // can invoke the tests - we don't know the name of the role yet (as it is built by CDK) - so we
        // are quite permissive (it is limited to one non-prod account though)
        rolePolicy: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["sts:AssumeRole"],
            resources: [`arn:aws:iam::${AWS_DEV_ACCOUNT}:role/*`],
          }),
        ],
      },
      crossAccountKeys: true,
    });

    // our secret name is consistent across all envs
    const ICA_SEC = "IcaSecretsPortal"; // pragma: allowlist secret

    // the following are dev settings *purely* meant for staging/test rather than actual dev
    // work... see HolmesSandboxStack in holmes.ts for more dev like settings
    const DEV_FINGERPRINT_BUCKET = "umccr-fingerprint-dev";
    const DEV_SITES_BUCKET = "umccr-refdata-dev";
    const DEV_SITES_KEY = "somalier/sites.hg38.rna.HOLMESTESTONLY.vcf.gz";
    const DEV_SITES_CHECKSUM = "f5aa74e7abaab6dc7e88aa9f392d021d"; // pragma: allowlist secret
    const DEV_TEST_BAM_SOURCE = "gds://development/test-data/holmes-test-data";

    const devStage = new HolmesBuildStage(this, "Dev", {
      env: {
        account: AWS_DEV_ACCOUNT,
        region: AWS_DEV_REGION,
      },
      namespaceName: NAMESPACE_NAME,
      namespaceId: NAMESPACE_DEV_ID,
      icaSecretNamePartial: ICA_SEC,
      fingerprintBucketNameToCreate: DEV_FINGERPRINT_BUCKET,
      bamSources: [DEV_TEST_BAM_SOURCE],
      // our full path must contain this string - in this case everything in the TEST BAM path will match
      // (this feature is more useful in a folder filled with BAMs we don't want to fingerprint)
      bamLimits: ["/"],
      referenceFastaBucketName: FASTA_BUCKET,
      referenceFastaBucketKey: FASTA_KEY,
      sitesBucketName: DEV_SITES_BUCKET,
      sitesBucketKey: DEV_SITES_KEY,
    });

    const orderedSteps = pipelines.Step.sequence([
      // Need to work out the costs of running the long tests on every build
      // new pipelines.ManualApprovalStep("Run E2E Tests (20 mins)"),
      new pipelines.ShellStep("E2E Tests", {
        envFromCfnOutputs: {
          CHECK_STEPS_ARN: devStage.checkStepsArnOutput,
          EXTRACT_STEPS_ARN: devStage.extractStepsArnOutput,
          DIFFERENCE_STEPS_ARN: devStage.differenceStepsArnOutput,
        },
        commands: [
          "npm ci",
          // this is an approx 20 minute test that deletes some fingerprints, then creates some
          // new fingerprints, then does some checks
          `NODE_OPTIONS="--unhandled-rejections=strict" npx ts-node holmes-e2e-test.ts "arn:aws:iam::843407916570:role/HolmesTester" "${DEV_FINGERPRINT_BUCKET}" "${DEV_TEST_BAM_SOURCE}" "${DEV_SITES_CHECKSUM}" "$CHECK_STEPS_ARN" "$EXTRACT_STEPS_ARN" "$DIFFERENCE_STEPS_ARN"`,
        ],
      }),
    ]);

    pipeline.addStage(devStage, {
      post: orderedSteps,
    });

    const prodStage = new HolmesBuildStage(this, "Prod", {
      env: {
        account: AWS_PROD_ACCOUNT,
        region: AWS_PROD_REGION,
      },
      namespaceName: NAMESPACE_NAME,
      namespaceId: NAMESPACE_PROD_ID,
      icaSecretNamePartial: ICA_SEC,
      fingerprintBucketNameToCreate: "umccr-fingerprint-prod",
      bamSources: ["gds://production/analysis_data"],
      bamLimits: ["wgs_alignment_qc"],
      referenceFastaBucketName: FASTA_BUCKET,
      referenceFastaBucketKey: FASTA_KEY,
      sitesBucketName: SITES_BUCKET,
      sitesBucketKey: SITES_KEY,
    });

    pipeline.addStage(prodStage, {
      pre: [new pipelines.ManualApprovalStep("PromoteToProd")],
    });
  }
}
