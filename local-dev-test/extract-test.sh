#!/bin/bash

set -e

. "$(dirname "$0")/common/test-common.sh"

check_is_dev

docker_build

# from the temp directory where we generate fingerprints we delete all fingerprint looking files
# (those starting 676473 i.e gds:// and those starting 7333 i.e. s3://)
aws s3 rm "s3://$FINGERPRINT_BUCKET_NAME/temp/" --exclude "*" --include "676473*" --include "7333*"

echo "Extract running - this should take 5 mins - and a resulting fingerprint file will end up in the S3 bucket"

# leave whichever extract test you want to run uncommented

# realistic test s3
#docker_start_extract "s3://umccr-fingerprint-local-dev-test/test-bams/HG002-ready.bam" "temp/" "hg38.rna"

# realistic test GDS
#docker_start_extract "gds://development/test-data/holmes-test-data/family/giab_exome_trio/HG002-ready.bam" "temp/" "hg38.rna"

# quick test
#docker_start_extract "gds://umccr-research/test_data/CCR180149_tumor_mini.bam" "temp/" "hg38.rna"

#docker_start_extract "gds://development/test-data/holmes-test-data/individual/HG00096.bam" "temp/" "hg38.rna"

echo "There should be newly created fingerprint object listed in the destination bucket"

aws s3 ls "s3://$FINGERPRINT_BUCKET_NAME/temp/"
