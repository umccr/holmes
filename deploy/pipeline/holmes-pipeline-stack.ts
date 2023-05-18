import { pipelines, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { STACK_DESCRIPTION } from "../holmes-settings";
import {
  AWS_BUILD_ACCOUNT,
  AWS_PROD_ACCOUNT,
  AWS_PROD_REGION,
  AWS_STG_ACCOUNT,
  AWS_STG_REGION,
  NAMESPACE_NAME,
  NAMESPACE_PROD_ID,
  NAMESPACE_STG_ID,
} from "../umccr-constants";
import { HolmesBuildStage } from "./holmes-build-stage";
import { LinuxBuildImage } from "aws-cdk-lib/aws-codebuild";

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
          "cd deploy/pipeline",
          "npm ci",
          // our cdk is configured to use ts-node - so we don't need any build step - just synth
          "npx cdk synth",
        ],
        primaryOutputDirectory: "deploy/pipeline/cdk.out",
        rolePolicyStatements: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["sts:AssumeRole"],
            resources: ["*"],
          }),
        ],
      }),
      codeBuildDefaults: {
        buildEnvironment: {
          buildImage: LinuxBuildImage.STANDARD_6_0,
        },
        // we need to give the codebuild engines permissions to assume a role in STG - in order that they
        // can invoke the tests - we don't know the name of the role yet (as it is built by CDK) - so we
        // are quite permissive (it is limited to one non-prod account though)
        rolePolicy: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["sts:AssumeRole"],
            resources: [`arn:aws:iam::${AWS_STG_ACCOUNT}:role/*`],
          }),
        ],
      },
      crossAccountKeys: true,
    });

    // our secret name is consistent across all envs
    const ICA_SEC = "IcaSecretsPortal"; // pragma: allowlist secret

    // staging
    {
      // other aspects are specific to staging
      const STG_FINGERPRINT_BUCKET = "umccr-fingerprint-stg";
      const STG_GDS_TEST_DATA_BASE = "gds://staging/test-data/holmes-test-data";

      const stgStage = new HolmesBuildStage(this, "Stg", {
        env: {
          account: AWS_STG_ACCOUNT,
          region: AWS_STG_REGION,
        },
        namespaceName: NAMESPACE_NAME,
        namespaceId: NAMESPACE_STG_ID,
        icaSecretNamePartial: ICA_SEC,
        fingerprintBucketName: STG_FINGERPRINT_BUCKET,
        fingerprintConfigFolder: "config/",
        shouldCreateFingerprintBucket: true,
        createTesterRoleAllowingAccount: AWS_BUILD_ACCOUNT,
      });

      const orderedSteps = pipelines.Step.sequence([
        // Need to work out the costs of running the long tests on every build
        // new pipelines.ManualApprovalStep("Run E2E Tests (20 mins)"),
        new pipelines.ShellStep("E2E Tests", {
          envFromCfnOutputs: {
            CHECK_STEPS_ARN: stgStage.checkStepsArnOutput,
            EXTRACT_STEPS_ARN: stgStage.extractStepsArnOutput,
            PAIRS_STEPS_ARN: stgStage.pairsStepsArnOutput,
            TESTER_ROLE_ARN: stgStage.testerRoleArnOutput!,
          },
          commands: [
            "npm ci",
            // this is an approx 20 minute test that deletes some fingerprints, then creates some
            // new fingerprints, then does some checks
            `NODE_OPTIONS="--unhandled-rejections=strict" npx ts-node test-e2e/holmes-e2e-test.ts "$TESTER_ROLE_ARN" "${STG_FINGERPRINT_BUCKET}" "${STG_GDS_TEST_DATA_BASE}" "$CHECK_STEPS_ARN" "$EXTRACT_STEPS_ARN" "$PAIRS_STEPS_ARN" `,
          ],
        }),
      ]);

      pipeline.addStage(stgStage, {
        post: orderedSteps,
      });
    }

    // production
    {
      const prodStage = new HolmesBuildStage(this, "Prod", {
        env: {
          account: AWS_PROD_ACCOUNT,
          region: AWS_PROD_REGION,
        },
        namespaceName: NAMESPACE_NAME,
        namespaceId: NAMESPACE_PROD_ID,
        icaSecretNamePartial: ICA_SEC,
        fingerprintBucketName: "umccr-fingerprint-prod",
        shouldCreateFingerprintBucket: true,
        fingerprintConfigFolder: "config/",
      });

      pipeline.addStage(prodStage, {
        pre: [new pipelines.ManualApprovalStep("PromoteToProd")],
      });

      // note: we don't automatically run tests in production as the tests in staging are meant to prove
      // things are working before we promote the build
      // HOWEVER it is possible to log in to prod and run
      // homes-e2e-test.sh
      // which will safely run a production test
    }
  }
}

/*const stgStage = new HolmesSlackCronBuildStage(this, "Stg", {
      env: {
        account: AWS_STG_ACCOUNT,
        region: AWS_STG_REGION,
      },
      bucket: "umccr-fingerprint-stg",
      // NOTE: THIS IS A UTC HOUR - SO LOOKING AT RUNNING ABOUT MIDDAY 2+10
      // NOTE: this runs only on the first day of the month in deployed stg
      cron: "cron(0 2 1 * ? *)",
      channel: "#arteria-dev",
      // we have a special folder in staging that reports on a static test set
      fingerprintFolder: "fingerprints-group-detection/",
      expectRelatedRegex: "^.*SBJ(\\d\\d\\d\\d\\d).*$",
      // we look back until we find fingerprints (useful for stg static test)
      days: undefined,
    });

    pipeline.addStage(stgStage, {});

    const prodStage = new HolmesSlackCronBuildStage(this, "Prod", {
      env: {
        account: AWS_PROD_ACCOUNT,
        region: AWS_PROD_REGION,
      },
      bucket: "umccr-fingerprint-prod",
      // NOTE: THIS IS A UTC HOUR - SO LOOKING AT RUNNING ABOUT MIDDAY 2+10
      // NOTE: it runs every day though we don't expect most days for it to discover fingerprints
      cron: "cron(0 2 * * ? *)",
      channel: "#biobots",
      fingerprintFolder: "fingerprints/",
      expectRelatedRegex: "^.*SBJ(\\d\\d\\d\\d\\d).*$",
      // we look back one day for fingerprints to report on
      days: 1,
    });*/