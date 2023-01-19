#!/bin/sh

SECRET_ARN="arn:aws:secretsmanager:ap-southeast-2:843407916570:secret:IcaSecretsPortal" # pragma: allowlist secret
BN="umccr-fingerprint-local-dev-test"                                                   # pragma: allowlist secret
DI="fingerprint-dev-extract-test"

docker build --platform linux/amd64 -t $DI ../application/fingerprint-docker-image

# from the temp directory where we generate fingerprints we delete all fingerprint looking files
# (those starting 676473 i.e gds:// and those starting 7333 i.e. s3://)
aws s3 rm "s3://$BN/temp/" --exclude "*" --include "676473*" --include "7333*"

echo "This should take 5 mins"

# notes: we bind in our local copies of the reference files so that we can skip the download step
# we don't bind in a copy of the sites file as it is small *and* this tests out the download step
docker run --rm --platform linux/amd64 \
  --env AWS_REGION \
  --env AWS_ACCESS_KEY_ID \
  --env AWS_SECRET_ACCESS_KEY \
  --env AWS_SESSION_TOKEN \
  --env "SECRET_ARN=$SECRET_ARN" \
  --env "FINGERPRINT_BUCKET_NAME=$BN" \
  --env "FINGERPRINT_CONFIG_FOLDER=config/" \
  --env "FINGERPRINT_FOLDER=temp/" \
  --env "FINGERPRINT_REFERENCE=hg38.rna" \
  --mount "type=bind,source=$(pwd)/reference.hg38.rna.fa,target=/tmp/reference.fa" \
  --mount "type=bind,source=$(pwd)/reference.hg38.rna.fa.fai,target=/tmp/reference.fa.fai" \
  --entrypoint node \
           $DI \
           "/var/task/extract.cjs" \
            "s3://umccr-fingerprint-local-dev-test/test-bams/HG002-ready.bam"

aws s3 ls "s3://$BN/temp/"

# Some example files that can be used for Extract testing
#         "gds://development/test-data/holmes-test-data/family/giab_exome_trio/HG002-ready.bam"
#         "s3://umccr-fingerprint-local-dev-test/test-bams/HG003.bam" \
#         "gds://umccr-research/test_data/CCR180149_tumor_mini.bam"
#         "gds://development/test-data/holmes-test-data/individual/HG00096.bam" \
#         "gds://development/test-data/holmes-test-data/family/giab_exome_trio/HG002-ready.bam" \
#         "s3://umccr-fingerprint-local-dev-test/test-bams/HG003.bam" \
#         "s3://umccr-fingerprint-local-dev-test/test-bams/HG004.bam" \
