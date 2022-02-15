#!/bin/sh

if [ -z "$PORTAL_TOKEN" ]; then
  echo "PORTAL_TOKEN env variable must be set to a valid portal access token"
  exit 1
fi

AWS_REGION=ap-southeast-2 npx ts-node gather-test-local.ts
