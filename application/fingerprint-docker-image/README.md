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

The `test-local.sh` script are direct local test cases that can be executed
on the Typescript code directly as Nodejs apps.

This testing requires the execution environment have AWS\_\* variables
set up for a user in the UMCCR dev account. Other settings/paths in
both `test-local.sh` and `test-local.ts`
may need to be refreshed from time to time to match up with the developer
deployed versions of various artifacts. It is impossible to guarantee
that files won't move around in these dev buckets, hence the
BAMs chosen for testing may also change.

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

The `test-docker` folder has some scripts for doing local testing but in an environment
that _simulates_ AWS lambdas. This is good for testing packaging, lambda path issues etc.
IT IS STILL NOT IDENTICAL TO THE REAL LAMBDA ENVIRONMENT THOUGH - as it does not enforce
disk size or disk r/w limits like a real lambda does. This testing
does require the environment have AWS\_\* variables
set up for a user in UMCCR dev account.
