# Fingerprint Lambda/Fargate Docker image

The Docker image making up our fingerprint tasks.

We define multiple entry points here - allowing this single asset to be used
for different deployed lambdas and fargate tasks
(changing only the CMD or ENTRYPOINT in the CDK definition).

This is mainly due to there being so much commonality between the various
lambdas and fargate tasks (generally they use the same Somalier binary, the same packages,
the same shared library code).

We could split them into separate Docker assets if need be though.

## Entry Points

- Check - (Lambda - <15s) return a structured JSON comparing the inputs to _all_ the fingerprints
- List - (Lambda - <15s) test whether the inputs exist as fingerprints
- Relate - (Lambda - <30s) extract a somalier relate pairs/samples TSV from _just_ the inputs
- Extract (Fargate invoked - create fingerprint from BAM - 15 mins+)

## Testing

There is a Jest test suite that is being fleshed out. It requires AWS credentials to our
`dev` account to be present in the environment - then just `npx jest`. The Jest tests _will_
cover operations like fingerprint checks etc because they run reasonably quickly. It however
does not exercise the 'extract' functionality at all. This test suite runs locally
(in the sense it runs against the local code - it still requires access to the dev
fingerprint bucket for its test cases).
It does not test any aspect of the CDK/deployment.

There is an E2E test suite that is used to test the deployed software in AWS - and launches
proper long-running Fargate tasks etc. This can be run from dev, stg or prod. It is used
in the build pipeline as a gate.
