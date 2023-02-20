# Dev

## CDK Setup for Dev

When starting development, check the dev account to see if Holmes is deployed
in local-dev-test mode. There should be a CloudFormation called `HolmesLocalDevTestStack`.
In general all the other development needs this to be present at a minimum.

## CDK Deployment for Dev

This stack can be brought up and down at will. Feel free to leave it installed during
the full development cycle (days/weeks) and then tear it down at the end. It is completely
separated from the CI deployment to staging and production.

- `cdk deploy HolmesLocalDevTestStack` in AWS dev
- `cdk destroy HolmesLocalDevTestStack` in AWS dev

Changes to the CDK constructs can be tested just by doing a deployment of your local code.

## Local Development

See [README.md](../local-dev-test/README.md)

## CDK Pipeline

Holmes is deployed (for real) to staging and production via AWS CI.

You can do all your development on a branch and deploy using the above techniques.

Once completed, move your code onto `main` and it will autopublish to staging and
run the E2E test suite.

If confident of your changes in staging, go to CodePipeline and promote to
production.
