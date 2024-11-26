#!/bin/bash

set -e

. "$(dirname "$0")/common/test-common.sh"

check_is_dev

docker_build

# from the temp directory where we generate fingerprints we delete all fingerprint looking files
# (those starting gds and those starting s3)
aws s3 rm "s3://$FINGERPRINT_BUCKET_NAME/temp/" --exclude "*" --include "s3*" --include "gds*"

echo "Extract running - this should take 5 mins - and a resulting fingerprint file will end up in the S3 bucket"

# leave whichever extract test you want to run uncommented

# realistic test s3
docker_start_extract "s3://umccr-fingerprint-local-dev-test/test-bams/HG004.bam" "temp/" "hg38.rna"

# real HG19 cttso
# docker_start_extract "s3://umccr-fingerprint-local-dev-test/test-bams/PTC_ctTSO220404_L2200417.bam" "temp/" "hg19.rna"

# realistic large test s3
# docker_start_extract "s3://umccr-fingerprint-local-dev-test/test-bams/HG00096.bam" "temp/" "hg38.rna"

echo "There should be newly created fingerprint object listed in the destination bucket"

aws s3 ls "s3://$FINGERPRINT_BUCKET_NAME/temp/"
