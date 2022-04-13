# Fingerprint Lambda/Fargate Docker image

The Docker image making up our fingerprint tasks.

We define multiple entry points here - allowing this single asset to be used
for different deployed lambdas and fargate tasks
(changing only the CMD in the CDK definition).

This is mainly due to there being so much commonality between the various
lambdas (generally they use the same Somalier binary, the same packages,
the same shared library code).

We could split them into separate Docker assets if need be though.

## Local

The `local-test.sh` script are direct local test cases that can be executed
on the Typescript code directly as Nodejs apps.
This testing does require the environment have AWS_SECRET_X etc variables
set up for a user in UMCCR dev account.

```shell
./test-local.sh extract
```

```shell
./test-local.sh check
```

```shell
./test-local.sh check-start
```

```shell
./test-local.sh difference
```

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
