#!/bin/sh

if [ -z "$1" ]; then
  echo "Needs to specify which lambda you want to test"
  exit 1
fi

# clean up any previous runs (only check phase)
rm -f /tmp/*.somalier

SOMALIER=somalier \
   FINGERPRINT_BUCKET_NAME=sandbox-fingerprint-please-remove \
   SITES_BUCKET_NAME=umccr-refdata-prod \
   SITES_BUCKET_KEY=somalier/sites.hg38.rna.vcf.gz \
   FASTA_BUCKET_NAME=umccr-refdata-prod \
   FASTA_BUCKET_KEY=genomes/hg38/hg38.fa \
   SECRET_ARN="arn:aws:secretsmanager:ap-southeast-2:843407916570:secret:IcaSecretsPortal" \  # pragma: allowlist secret
   npx ts-node test-local.ts "$1"
