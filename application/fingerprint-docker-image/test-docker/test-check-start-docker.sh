#!/bin/sh

# these can safely be checked into github - despite detect-secrets thinking it might be a password
SECRETARN="arn:aws:secretsmanager:ap-southeast-2:843407916570:secret:IcaSecretsPortal"  # pragma: allowlist secret
BN="sandbox-fingerprint-please-remove" # pragma: allowlist secret

docker build --platform linux/amd64 -t fingerprint ..

docker run --rm -p 9000:8080 --platform linux/amd64  \
 --env AWS_REGION=ap-southeast-2 \
 --env AWS_ACCESS_KEY_ID \
 --env AWS_SECRET_ACCESS_KEY \
 --env AWS_SESSION_TOKEN \
 --env "SECRET_ARN=$SECRETARN" \
 --env "FINGERPRINT_BUCKET_NAME=$BN" \
 --mount "type=bind,source=$(pwd)/reference.fasta,target=/tmp/reference.fasta" \
 --mount "type=bind,source=$(pwd)/sites.vcf.gz,target=/tmp/sites.vcf.gz" \
 843407916570.dkr.ecr.ap-southeast-2.amazonaws.com/cdk-hnb659fds-container-assets-843407916570-ap-southeast-2:fe918c2eb63027859b0e5ffd33885b85f1df4f619bda11cf27ffae849cd9a108 \
 check-start.lambdaHandler

# docker run -it --entrypoint sh
