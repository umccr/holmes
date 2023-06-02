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

Elsewhere in this repo is test scripts that exercise the code
_as Docker images_ within the real AWS environment. This is due to
much of the correct behaviour of the code being entirely dependent
on the AWS infrastructure that calls it (Steps), or the AWS infrastructure it
calls (S3).

I have started on a more well-structured Jest test set - and we should
progress this.
