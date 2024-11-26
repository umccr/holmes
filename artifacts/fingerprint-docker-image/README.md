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

There is a Jest test suite that currently _only_ tests Slack reporting on the local
machine and requires no AWS.

There is an E2E test suite that is used to test the deployed software in AWS - and launches
proper long running Fargate tasks etc.

In between those extremes should be some more testing but the way this project evolved
meant that something to do that slipped through the cracks.
