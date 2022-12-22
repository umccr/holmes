NODE_OPTIONS="--unhandled-rejections=strict" npx ts-node holmes-e2e-test.ts \
     . \
     "umccr-fingerprint-stg" \
     "gds://development/test-data/holmes-test-data" \
     "arn:aws:states:ap-southeast-2:455634345446:stateMachine:SomalierCheckStateMachine1DDB4CFA-hgrtT7cs5XYK" \
     "arn:aws:states:ap-southeast-2:455634345446:stateMachine:SomalierExtractStateMachine59E102CC-0y8sSr7lSH8R"
    