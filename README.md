# holmes

A CDK stack for deploying a steps/lambda that does bioinformatics fingerprint
checks.

## Overview

The `somalier` tool is a useful tool for generating genomics fingerprint files, where
these files can then be compared to each and rated with a 'relatedness' score. Where
genomics files are samples from the sample human, or close relatives - this score
is high.

To help guard against sample mix ups - the relatedness score of any one sample versus
all other samples in the lab - can be used to uncover unexpected cross-overs between
subjects or sample mislabelling.

This stack presumes that a collection of `somalier` fingerprint files have been
created and are located next to their respective BAM files in an object store.

It creates a step function, with accompanying lambdas - that compares an 'index'
fingerprint file against all other fingerprints detected in the object store, and
returns those with similarity above a threshold.

## Lambdas

A single Docker lambda image is created that contains all code executed via Steps.

This lambda image has the `somalier` tool compiled directly into the Docker image.

`somalier` cannot source fingerprints via network - so each lambda must download
the subset of fingerprints it is working on to the lambda /tmp directory - call
somalier and then return the results.

The lambdas are distributed concurrently using Steps Map - which means that no
one lambda is required to spend too much time downloading files, nor can the files
overflow its /tmp directory.

THe lambda _could_ be taught to source somalier files from any
source - currently supported are S3 and GDS.

## Step

The step function can be executed with the equivalent of

```
aws stepfunctions start-execution \
 --state-machine-arn arn:aws:states:ap-southeast-2:843407916570:stateMachine:StateMachine2E01A3A5-mOp8QLUdyXFQ \
 --cli-input-yaml file://adhoc-test-invoke-input.yaml
```

where the test input is

```yaml
input: >
  {
    "portalBearer": "eyJraWQiOiJU...",
    "portalUrl": "https://api.data.dev.umccr.org",
    "index": "gds://development/analysis_data/SBJ00480/wgs_alignment_qc/20211128e4a69bdb/L2000966__1_dragen_somalier/PTC_Tsqn201109MB.somalier",
    "relatednessThreshold": 0.5,
    "chunkSize": 15
  }
```

and where the portal bearer token is required to be a JWT for the portal.
(this will change once we integrate the steps into the backend services).

The step function constructed is registered into the `umccr` namespace.

## Useful commands

- `cdk deploy` deploy this stack to your default AWS account/region
- `cdk diff` compare deployed stack with current state
- `cdk synth` emits the synthesized CloudFormation template

See `fingerprint-docker-image` for dev/test scripts.

```
{
  "fasta": "s3://umccr-refdata-prod/genomes/hg38/hg38.fa",
  "sites": "s3://umccr-refdata-prod/somalier/sites.hg38.rna.vcf.gz",
  "fileGroups": [
    [
      "gds://production/analysis_data/SBJ00005/wgs_alignment_qc/20211201bd0ac3a3/L2101368__4_dragen/PTC_Tsqn211109.bam",
      "b",
      "c"
    ]
  ]
}
```
