#!/usr/bin/env bash

# this is a helper script for launching the e2e test script in either dev, stg or prod

# holmes-e2e-test.ts is a standalone typescript script that will execute a e2e test suite

# it is AUTOMATICALLY EXECUTED AS PART OF THE CI process and is passed in settings appropriate to
# the env it is in

# HOWEVER, you may want to run the e2e suite from a LOCAL machine (keep in mind it takes 30 mins+)
# where you are logged into the appropriate accounts in AWS
# e2e tests will not interfere with the operations of the real system (they create a new folder in S3
# isolated to the test run) so can be run in production safely

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

case $ACCOUNT in

  "472057503814")
     # prod
     NODE_OPTIONS="--unhandled-rejections=strict" npx ts-node "$(dirname "$0")/holmes-e2e-test.ts" \
     . \
     "umccr-fingerprint-prod" \
     "s3://umccr-fingerprint-local-dev-test/test-bams" \
     "umccr" \
     $*
    ;;

  "455634345446")
     # stg
     NODE_OPTIONS="--unhandled-rejections=strict" npx ts-node "$(dirname "$0")/holmes-e2e-test.ts" \
     . \
     "umccr-fingerprint-stg" \
     "s3://umccr-fingerprint-local-dev-test/test-bams" \
     "umccr" \
     $*
    ;;

  "843407916570")
     # dev (local dev/test)
     NODE_OPTIONS="--unhandled-rejections=strict" npx ts-node "$(dirname "$0")/holmes-e2e-test.ts" \
     . \
     "umccr-fingerprint-local-dev-test" \
     "s3://umccr-fingerprint-local-dev-test/test-bams" \
     "umccr" \
     $*
    ;;

  *)
    echo "You must have credentials in your environment for either dev, stg or prod AWS accounts"
    ;;
esac
