import { pipelines, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { HolmesApplicationStage } from "./holmes-application-stack";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";

/**
 * Stack to hold the self mutating pipeline, and all the relevant settings for deployments
 */
export class HolmesPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

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
          // need to think how to get pre-commit to run in CI given .git is not present
          // "pip install pre-commit",
          // "git init . && pre-commit run --all-files",
          "npm ci",
          // "aws s3 cp s3://umccr-refdata-prod/somalier/sites.hg38.rna.vcf.gz fingerprint-docker-image/",
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

    const devStage = new HolmesApplicationStage(this, "Dev", {
      env: {
        account: "843407916570",
        region: "ap-southeast-2",
      },
      namespaceName: "umccr",
      namespaceId: "ns-mjt63c4ppdrly4jd",
      icaSecretNamePartial: "IcaSecretsPortal",
    });

    const prodStage = new HolmesApplicationStage(this, "Prod", {
      env: {
        account: "472057503814",
        region: "ap-southeast-2",
      },
      namespaceName: "umccr",
      namespaceId: "ns-z7kktgazzvwokcvz",
      icaSecretNamePartial: "IcaSecretsPortal",
    });

    pipeline.addStage(devStage, {
      post: [
        new pipelines.ShellStep("Validate Endpoint", {
          envFromCfnOutputs: {
            STEPS_ARN: devStage.stepsArnOutput,
          },
          commands: [
            "echo $STEPS_ARN",
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
