import { pipelines, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
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
            actions: ["sts:AssumeRole"],
            resources: ["*"],
            conditions: {
              StringEquals: {
                "iam:ResourceTag/aws-cdk:bootstrap-role": "lookup",
              },
            },
          }),
        ],
      }),
      crossAccountKeys: true,
    });

    const devStage = new HolmesBuildStage(this, "Dev", {
      env: {
        account: AWS_DEV_ACCOUNT,
        region: AWS_DEV_REGION,
      },
      namespaceName: NAMESPACE_NAME,
      namespaceId: NAMESPACE_DEV_ID,
      icaSecretNamePartial: "IcaSecretsPortal", // pragma: allowlist secret
      fingerprintBucketNameToCreate: "umccr-fingerprint-dev",
      bamSources: ["gds://development/analysis_data"],
      referenceFastaBucketName: FASTA_BUCKET,
      referenceFastaBucketKey: FASTA_KEY,
      sitesBucketName: SITES_BUCKET,
      sitesBucketKey: SITES_KEY,
    });

    const prodStage = new HolmesBuildStage(this, "Prod", {
      env: {
        account: AWS_PROD_ACCOUNT,
        region: AWS_PROD_REGION,
      },
      namespaceName: NAMESPACE_NAME,
      namespaceId: NAMESPACE_PROD_ID,
      icaSecretNamePartial: "IcaSecretsPortal", // pragma: allowlist secret
      fingerprintBucketNameToCreate: "umccr-fingerprint-prod",
      bamSources: ["gds://production/analysis_data"],
      referenceFastaBucketName: FASTA_BUCKET,
      referenceFastaBucketKey: FASTA_KEY,
      sitesBucketName: SITES_BUCKET,
      sitesBucketKey: SITES_KEY,
    });

    pipeline.addStage(devStage, {
      post: [
        new pipelines.ShellStep("Validate Endpoint", {
          envFromCfnOutputs: {
            CHECK_STEPS_ARN: devStage.checkStepsArnOutput,
            EXTRACT_STEPS_ARN: devStage.extractStepsArnOutput,
          },
          commands: [
            "echo $CHECK_STEPS_ARN",
            //            "cd test/onto-cli",
            //            "npm ci",
            //            `npm run test -- "$FHIR_BASE_URL"`,
          ],
        }),
      ],
    });

    pipeline.addStage(prodStage, {
      pre: [new pipelines.ManualApprovalStep("PromoteToProd")],
    });
  }
}
