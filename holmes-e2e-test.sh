#!/usr/bin/env bash

# this is a helper script for launching the e2e test script in either dev, stg or prod

# holmes-e2e-test.ts is a standalone typescript script that will execute a e2e test suite
# it is AUTOMATICALLY EXECUTED AS PART OF THE CI process and is passed in settings appropriate to
# the env it is in

# HOWEVER, you may want to run the e2e suite from a LOCAL machine (keep in mind it takes 30 mins+)
# where you are logged into the appropriate accounts in AWS
# e2e tests will not interfere with the operations of the real system (they create a new folder in S3
# isolated to the test run) so can be run in production safely

# NOTE: you may have to update the StateMachine ARNs if the stack has been refreshed

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

case $ACCOUNT in

  "472057503814")
     # prod
     NODE_OPTIONS="--unhandled-rejections=strict" npx ts-node holmes-e2e-test.ts \
     . \
     "umccr-fingerprint-prod" \
     "gds://production/test-data/holmes-test-data" \
     "arn:aws:states:ap-southeast-2:472057503814:stateMachine:SomalierCheckStateMachineFILLMEIN" \
     "arn:aws:states:ap-southeast-2:472057503814:stateMachine:SomalierExtractStateMachineFILLMEIN" \
     "arn:aws:states:ap-southeast-2:472057503814:stateMachine:SomalierPairsStateMachineFILLMEIN"
    ;;

  "455634345446")
     # stg
     NODE_OPTIONS="--unhandled-rejections=strict" npx ts-node holmes-e2e-test.ts \
     . \
     "umccr-fingerprint-stg" \
     "gds://development/test-data/holmes-test-data" \
     "arn:aws:states:ap-southeast-2:455634345446:stateMachine:SomalierCheckStateMachine1DDB4CFA-hgrtT7cs5XYK" \
     "arn:aws:states:ap-southeast-2:455634345446:stateMachine:SomalierExtractStateMachine59E102CC-0y8sSr7lSH8R" \
     "arn:aws:states:ap-southeast-2:455634345446:stateMachine:SomalierPairsStateMachine5E171314-BgxfR32P41kf"
    ;;

  "843407916570")
     # dev (local dev/test)
     NODE_OPTIONS="--unhandled-rejections=strict" npx ts-node holmes-e2e-test.ts \
     . \
     "umccr-fingerprint-local-dev-test" \
     "gds://development/test-data/holmes-test-data" \
     "arn:aws:states:ap-southeast-2:843407916570:stateMachine:SomalierCheckStateMachine1DDB4CFA-i6pQDTb3m5cD" \
     "arn:aws:states:ap-southeast-2:843407916570:stateMachine:SomalierExtractStateMachine59E102CC-LQXCKcSwpX3U" \
     "arn:aws:states:ap-southeast-2:843407916570:stateMachine:SomalierPairsStateMachine5E171314-IJYyoakK67Or"
    ;;

  *)
    echo "You must have credentials in your environment for either dev, stg or prod AWS accounts"
    ;;
esac
