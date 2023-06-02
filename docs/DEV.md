# Dev

## CDK Setup for Dev

When starting development, check the dev account to see if Holmes is deployed
in local-dev-test mode. There should be a CloudFormation called `HolmesLocalDevTestStack`.
In general all the other development needs this to be present at a minimum.

## CDK Deployment for Dev

This stack can be brought up and down at will. Feel free to leave it installed during
the full development cycle (days/weeks) and then tear it down at the end. It is completely
separated from the CI deployment to staging and production.

In `deploy/manual`

- `npm run dev-deploy` in AWS dev
- `npm run dev-destroy` in AWS dev

Changes to the CDK constructs can be tested just by doing a deployment of your local code.

## Local Development

See [README.md](../legacy/test-local-dev/README.md)

## CDK Pipeline

Holmes is deployed (for real) to staging and production via AWS CI.

You can do all your development on a branch and deploy using the above techniques.

Once completed, move your code onto `main` and it will autopublish to staging and
run the E2E test suite.

If confident of your changes in staging, go to CodePipeline and promote to
production.

## Fingerprint-docker-image

A single Docker lambda image is created that contains all code executed via Steps and as Lambdas -
all with different entrypoints.

This lambda image has the `somalier` tool compiled directly into the Docker image.

`somalier` cannot source fingerprints via network - so each lambda must download
the subset of fingerprints it is working on to the lambda /tmp directory - call
`somalier` and then return the results.

For checking, the lambdas are distributed concurrently using Steps Map - which means that no
one lambda is required to spend too much time downloading files, nor can the files
overflow its /tmp directory.

THe lambda _could_ be taught to source somalier files from any
source - currently supported are S3 and GDS.
