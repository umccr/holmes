#!/bin/bash

##
## NOTE: there are some pre-prepared inputs for different tests.. just change the value of the case
## manually and then visually inspect the output
## (sorry this is not really a proper testing framework - this is more for adhoc dev testing)
##
TEST_CASE="regex"

set -e

. "$(dirname "$0")/common/test-common.sh"

check_is_dev

docker_build

# when passed in as 'Items' the file paths needs to be hex encoded S3.. so here they are
TEST_K1="fingerprints-1kg-small/6764733a2f2f316b672d67656e6f6d65732f65787472612f484730313737372e62616d" # gds://1kg-genomes/extra/HG01777.bam # pragma: allowlist secret
TEST_K2="fingerprints-1kg-small/6764733a2f2f316b672d67656e6f6d65732f65787472612f484730313737392e62616d" # gds://1kg-genomes/extra/HG01779.bam # pragma: allowlist secret
TEST_K3="fingerprints-1kg-small/6764733a2f2f316b672d67656e6f6d65732f65787472612f484730313738312e62616d" # gds://1kg-genomes/extra/HG01781.bam # pragma: allowlist secret
TEST_K4="fingerprints-1kg-small/6764733a2f2f316b672d67656e6f6d65732f746573742d6578616d706c652f484730313737372e62616d" # gds://1kg-genomes/test-example/HG01777.bam # pragma: allowlist secret
TEST_T1="fingerprints-trio/6764733a2f2f646576656c6f706d656e742f746573742d646174612f686f6c6d65732d746573742d646174612f66616d696c792f676961625f65786f6d655f7472696f2f48473030322d72656164792e62616d" # gds://development/test-data/holmes-test-data/family/giab_exome_trio/HG002-ready.bam # pragma: allowlist secret
TEST_T2="fingerprints-trio/6764733a2f2f646576656c6f706d656e742f746573742d646174612f686f6c6d65732d746573742d646174612f66616d696c792f676961625f65786f6d655f7472696f2f48473030332d72656164792e62616d" # gds://development/test-data/holmes-test-data/family/giab_exome_trio/HG003-ready.bam # pragma: allowlist secret
TEST_T3="fingerprints-trio/6764733a2f2f646576656c6f706d656e742f746573742d646174612f686f6c6d65732d746573742d646174612f66616d696c792f676961625f65786f6d655f7472696f2f48473030342d72656164792e62616d" # gds://development/test-data/holmes-test-data/family/giab_exome_trio/HG004-ready.bam # pragma: allowlist secret

case $TEST_CASE in
"regex")
  # the regex test will output a result that shows K1 and K4 were 'meant' to match but didn't
  FINGERPRINT_FOLDER="fingerprints-1kg-small/"
  LAMBDA_INPUT_STRING=$(jq -n \
    --arg i "gds://1kg-genomes/extra/HG01777.bam" \
    --argjson r "0.4" \
    --arg f "$FINGERPRINT_FOLDER" \
    --arg expectedRegex "^.*HG(\d\d\d\d\d)\.bam$" \
    --arg k1 $TEST_K1 --arg k2 $TEST_K2 --arg k3 $TEST_K3 --arg k4 $TEST_K4 \
    '{BatchInput:{ indexes: [$i], fingerprintFolder: $f, relatednessThreshold: $r, expectRelatedRegex: $expectedRegex }, Items: [{Key: $k1},{Key: $k2},{Key: $k3},{Key: $k4}]}')
  ;;
"trio")
  # the trio test will output a result that shows relations between the three trio members
  FINGERPRINT_FOLDER="fingerprints-trio/"
  LAMBDA_INPUT_STRING=$(jq -n \
    --arg i "gds://development/test-data/holmes-test-data/family/giab_exome_trio/HG002-ready.bam" \
    --argjson r "0.4" \
    --arg f "$FINGERPRINT_FOLDER" \
    --arg k1 $TEST_T1 --arg k2 $TEST_T2 --arg k3 $TEST_T3 \
    '{BatchInput:{ indexes: [$i], fingerprintFolder: $f, relatednessThreshold: $r }, Items: [{Key: $k1},{Key: $k2},{Key: $k3}]}')
  ;;
esac

CONTAINER=$(docker_start_check check.lambdaHandler "$FINGERPRINT_FOLDER")

echo "Container started with id $CONTAINER"

sleep 2

echo "Invoking lambda entrypoint via Lambda HTTP runtime RIC"

curl -s -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" -d "$LAMBDA_INPUT_STRING" | jq

docker logs "$CONTAINER"
docker kill "$CONTAINER"
