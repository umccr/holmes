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
          "n 22",
          "cd workload-holmes",
          "npm ci",
          "cd ../deploy/pipeline",
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
          buildImage: LinuxBuildImage.STANDARD_7_0,
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
      const STG_GDS_TEST_DATA_BASE =
        "s3://umccr-fingerprint-local-dev-test/test-bams";

      const stgStage = new HolmesBuildStage(
        this,
        "Stg",
        {
          env: {
            account: AWS_STG_ACCOUNT,
            region: AWS_STG_REGION,
          },
        },
        {
          namespaceName: NAMESPACE_NAME,
          namespaceId: NAMESPACE_STG_ID,
          icaSecretNamePartial: ICA_SEC,
          fingerprintBucketName: STG_FINGERPRINT_BUCKET,
          fingerprintConfigFolder: "config/",
          // this is a difference from prod - we allow tests to be run from build
          createTesterRoleAllowingAccount: AWS_BUILD_ACCOUNT,
          // the default settings to use for all our Slack interactions with the API/lambdas
          // most of these are settings that normally are able to be specified by the API caller
          // - but for Slack we have preset these
          slackNotifier: {
            cron: "cron(0 12 ? * * *)",
            channel: "C06659VLQCA",
            fingerprintFolder: "fingerprints/",
            relatednessThreshold: 0.8,
            minimumNCount: 50,
            excludeRegex: "^.*(PTC_|NTC_).*$",
          },
        }
      );

      const orderedSteps = pipelines.Step.sequence([
        // Need to work out the costs of running the long tests on every build
        // new pipelines.ManualApprovalStep("Run E2E Tests (20 mins)"),
        new pipelines.ShellStep("E2E Tests", {
          envFromCfnOutputs: {
            TESTER_ROLE_ARN: stgStage.testerRoleArnOutput!,
          },
          commands: [
            "cd test-e2e",
            "npm ci",
            // this is an approx 20 minute test that deletes some fingerprints, then creates some
            // new fingerprints, then does some checks
            `NODE_OPTIONS="--unhandled-rejections=strict" npx ts-node holmes-e2e-test.ts "$TESTER_ROLE_ARN" "${STG_FINGERPRINT_BUCKET}" "${STG_GDS_TEST_DATA_BASE}" "${NAMESPACE_NAME}"`,
          ],
        }),
      ]);

      pipeline.addStage(stgStage, {
        post: orderedSteps,
      });
    }

    // production
    {
      const prodStage = new HolmesBuildStage(
        this,
        "Prod",
        {
          env: {
            account: AWS_PROD_ACCOUNT,
            region: AWS_PROD_REGION,
          },
        },
        {
          namespaceName: NAMESPACE_NAME,
          namespaceId: NAMESPACE_PROD_ID,
          icaSecretNamePartial: ICA_SEC,
          fingerprintBucketName: "umccr-fingerprint-prod",
          fingerprintConfigFolder: "config/",
          // the default settings to use for all our Slack interactions with the API/lambdas
          // most of these are settings that normally are able to be specified by the API caller
          // - but for Slack we have preset these
          slackNotifier: {
            cron: "cron(0 12 ? * * *)",
            channel: "C058REG24R1",
            fingerprintFolder: "fingerprints/",
            relatednessThreshold: 0.8,
            minimumNCount: 50,
            excludeRegex: "^.*(PTC_|NTC_).*$",
          },
        }
      );

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
