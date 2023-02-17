#!/bin/sh

# because we use esbuild for the docker image (which doesn't enforce types) - it is occasionally
# useful to allow the compiler to really have a go at the source and do full typescript checks
npx tsc --noEmit ./*.ts

if [ -z "$1" ]; then
  echo "Needs to specify which lambda you want to test"
  exit 1
fi

. ./test-common.sh

# clean up any previous runs (only check phase)
rm -f /tmp/*.somalier

SOMALIER=somalier \
  FINGERPRINT_BUCKET_NAME="$FINGERPRINT_BUCKET_NAME" \
  FINGERPRINT_CONFIG_FOLDER="$FINGERPRINT_CONFIG_FOLDER" \
  SECRET_ARN="$ICA_SECRET_ARN" \
  npx ts-node test-local.ts "$1"
