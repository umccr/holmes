#!/bin/bash

set -e

. "$(dirname "$0")/../dev-test-common/test-common.sh"

check_is_dev

docker_build

F="fingerprints-1kg-small/" # pragma: allowlist secret

CONTAINER=$(docker_start check.lambdaHandler "$F")

echo "Container started with id $CONTAINER"

sleep 2

##
## NOTE: there are some pre-prepared inputs for different tests.. just change the value of the case
## manually and then visually inspect the output
## (sorry this is not really a proper testing framework)
##
TEST_CASE="regex"

# when passed in as 'Items' the file paths needs to be hex encoded S3.. so here they are to be shared
TEST_K1="fingerprints-1kg-small/6764733a2f2f316b672d67656e6f6d65732f65787472612f484730313737372e62616d"
TEST_K2="fingerprints-1kg-small/6764733a2f2f316b672d67656e6f6d65732f65787472612f484730313737392e62616d"
TEST_K3="fingerprints-1kg-small/6764733a2f2f316b672d67656e6f6d65732f65787472612f484730313738312e62616d"
TEST_K4="fingerprints-1kg-small/6764733a2f2f316b672d67656e6f6d65732f746573742d6578616d706c652f484730313737372e62616d"

case $TEST_CASE in
"regex")
  LAMBDA_INPUT_STRING=$(jq -n \
    --arg i "gds://1kg-genomes/extra/HG01777.bam" \
    --argjson r "0.4" \
    --arg f "$F" \
    --arg err "^.*HG(\d\d\d\d\d)\.bam$" \
    --arg k1 $TEST_K1 --arg k2 $TEST_K2 --arg k3 $TEST_K3 --arg k4 $TEST_K4 \
    '{BatchInput:{ indexes: [$i], fingerprintFolder: $f, relatednessThreshold: $r, expectRelatedRegex: $err }, Items: [{Key: $k1},{Key: $k2},{Key: $k3},{Key: $k4}]}')
  ;;
esac

echo "Invoking lambda entrypoint via Lambda HTTP runtime RIC"

curl -s -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" -d "$LAMBDA_INPUT_STRING" | jq

docker logs "$CONTAINER"
docker kill "$CONTAINER"
