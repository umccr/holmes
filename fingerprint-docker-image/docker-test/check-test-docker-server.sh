#!/bin/sh

docker run --rm -p 9000:8080 \
 --env AWS_REGION=ap-southeast-2 \
 --env AWS_ACCESS_KEY_ID \
 --env AWS_SECRET_ACCESS_KEY \
 --env AWS_SESSION_TOKEN \
 --env "SECRET_ARN=arn:aws:secretsmanager:ap-southeast-2:843407916570:secret:IcaSecretsPortal" \
 fingerprint check.lambdaHandler
