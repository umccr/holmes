# Fingerprint Lambda Docker image

The Docker image making up our fingerprint lambda.

We define multiple lambda entry points here - allowing this single asset to be used
for different deployed lambdas (changing only the CMD in the CDK definition).
Mainly due to there being so much commonality between the various
lambdas (generally they use the same packages, possibly the same shared code). We could
totally split them into separate Docker assets if need be though.

## Local

The `adhoc-test` folder has some scripts for doing purely local testing - that
is executing the Typescript lambda code directly as if it is not in a lambda at all (just
as a Nodejs app). This testing does require the environment have AWS_SECRET_X etc variables
set up for a user in UMCCR dev account.

## Local Docker

The `docker-test` folder has some scripts for doing local testing but in an environment
that _simulates_ AWS lambdas. This is good for testing packaging, lambda path issues etc.
IT IS STILL NOT IDENTICAL TO THE REAL LAMBDA ENVIRONMENT THOUGH - as it does not enforce
disk size or disk r/w limits like a real lambda does. This testing does require the environment have AWS_SECRET_X etc variables
set up for a user in UMCCR dev account.

## Extract Testing (disabled)

For local testing/building of the extract function (disabled due to not working
in lambda time frames) you need to make a `sites.vcf.gz` file in the
Docker folder (see somalier website for this file).

In a real deployed version of the application this file is
fetched from the master location as part of the CodeBuild process.
