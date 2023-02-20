# Local Dev/Test

When doing development, it is useful to be able to launch these tasks locally - using AWS though. These
scripts help to avoid a slow CI/deploy/CDK cycle.

## Setup

Copy the `reference.hg38.rna.fa` and `reference.hg38.rna.fa.fai` and `sites.hg38.rna.vcf.gz` files (and equivalent
`hg19.rna` as well if you want) from any
source (the `config/` folders in a fingerprint bucket) into the `common` folder.

If you don't do this - the extract will still run fine - it just will start with a 10GB file download
which is unnecessarily slow.

They are ignored by git so will not ever be checked in.

## Dev

Do any dev work you want on the code (inside the `fingerprint-docker-image`). Note that _no_ CDK construct
code is in any way exercised by these scripts so any changes you make to them will need
to be tested with an actual CDK deploy.

## Execute

You will need to be in the dev AWS account (i.e assumed a role into the ENV variables).

Then execute `extract-test.sh` or `check-test.sh`. See each individual script for various
scenarios that you can select. Note that these scripts are not proper regression test
suites - so they basically just print output that you hand check. It does however allow
for the 'real' code to be executed in a 'real' AWS environment, with a relatively quick
turnaround (i.e. seconds rather than minutes). So that is why it is useful.
