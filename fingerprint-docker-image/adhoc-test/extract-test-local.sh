
# invoke in dev (assuming a local setup that has a working somalier binary in path)
SECRET_ARN="arn:aws:secretsmanager:ap-southeast-2:843407916570:secret:IcaSecretsPortal" \
  SOMALIER=somalier \
  AWS_REGION=ap-southeast-2 \
  npx ts-node extract-test-local.ts
