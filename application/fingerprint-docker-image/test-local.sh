#!/bin/sh

# because we use esbuild for the docker image (which doesn't enforce types) - it is occasionally
# useful to allow the compiler to really have a go at the source and do full typescript checks
npx tsc --noEmit ./*.ts

if [ -z "$1" ]; then
  echo "Needs to specify which lambda you want to test"
  exit 1
fi

# these can safely be checked into github - despite detect-secrets thinking they might be passwords
SECRETARN="arn:aws:secretsmanager:ap-southeast-2:843407916570:secret:IcaSecretsPortal" # pragma: allowlist secret
BN="umccr-fingerprint-local-dev-test"                                                  # pragma: allowlist secret

# clean up any previous runs (only check phase)
rm -f /tmp/*.somalier

SOMALIER=somalier \
  FINGERPRINT_BUCKET_NAME="$BN" \
  FINGERPRINT_CONFIG_FOLDER="config/" \
  SECRET_ARN="$SECRETARN" \
  npx ts-node test-local.ts "$1"
