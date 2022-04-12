#!/bin/sh

# this can be checked into github - despite detect-secrets thinking in might be a password
SECRETARN="arn:aws:secretsmanager:ap-southeast-2:843407916570:secret:IcaSecretsPortal"  # pragma: allowlist secret

docker run --rm -p 9000:8080 \
 --env AWS_REGION=ap-southeast-2 \
 --env AWS_ACCESS_KEY_ID \
 --env AWS_SECRET_ACCESS_KEY \
 --env AWS_SESSION_TOKEN \
 --env "SECRET_ARN=$SECRETARN" \
 fingerprint check.lambdaHandler
