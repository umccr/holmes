#!/bin/sh

# these can safely be checked into github - despite detect-secrets thinking it might be a password
SECRETARN="arn:aws:secretsmanager:ap-southeast-2:843407916570:secret:IcaSecretsPortal"  # pragma: allowlist secret
BN="sandbox-fingerprint-please-remove" # pragma: allowlist secret

docker build --platform linux/amd64 -t fingerprint-fargate ..

docker run --rm --platform linux/amd64  \
 --env AWS_REGION=ap-southeast-2 \
 --env AWS_ACCESS_KEY_ID \
 --env AWS_SECRET_ACCESS_KEY \
 --env AWS_SESSION_TOKEN \
 --env "SECRET_ARN=$SECRETARN" \
 --env "FINGERPRINT_BUCKET_NAME=$BN" \
 --mount "type=bind,source=$(pwd)/reference.fasta,target=/tmp/reference.fasta" \
 --mount "type=bind,source=$(pwd)/sites.vcf.gz,target=/tmp/sites.vcf.gz" \
 --entrypoint node \
 fingerprint-fargate "/var/task/extract.cjs" \
  "gds://umccr-research/test_data/CCR180149_tumor_mini.bam" \

 # "s3://umccr-research-dev/htsget/htsnexus_test_NA12878.bam" \

