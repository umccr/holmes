# holmes

An AWS Steps based service that does bioinformatics fingerprint checks,
deployed as a CDK pipeline project.

## Overview

The `somalier` tool is a useful tool for generating genomics fingerprint files -
taking a BAM file and producing a much smaller representation
of variance at set locations throughout.

These files can then be compared to each other and rated with a 'relatedness' score. Where
genomics files are samples from the sample human, or close relatives - this score
is high, and therefore the `relatedness` score can help guard against
sample mix-ups - by uncovering where unexpected relationships exist between
samples.

## Service

### Abstract

This service provides a variety of stages - sometimes standalone but
also sometimes joined together (such that one stages output feeds into another
stage). The stages broadly speaking are:

- Difference - searches for BAM files in a set of source folders and then determines
  which of them does not have a corresponding up to date fingerpint
  recorded
- Extract - for a given list of BAM files generates fingerprints and records them
  in the system
- Check - for any index fingerprint (already in the system), compares that to all other
  fingerprints and returns those which are closely related

The current joined stages are:

- Difference Then Extract - finds all the BAM files that need fingerprinting and then
  creates the fingerprints for them

Considering adding

- Extract Then Check - generate fingerprints for a given set of files and then return a report
  where they have all been checked against the entire database

### Invoke

The service providers all entry points as AWS Steps functions.

These functions are registered into the `umccr` namespace.

Only one service instance will ever be registered in the namespace, so
the technique for service discovery is to locate the `fingerprint`
service - and then select the one and only service instance present.
Then choose the custom attribute that matches the Steps function Arn
to invoke.

---

#### Difference

`umccr -> fingerprint -> (single service) -> differenceStepsArn`

with an input of

```json
{}
```

and produces output of the form

```json
{
  "needsFingerprinting": [
    ["gds://development/sample1.bam", "gds://development/sample2.bam"],
    ["gds://development/sample3.bam"]
  ],
  "hasFingerprinting": [
    "gds://development/sample4.bam",
    "gds://development/sample5.bam"
  ]
}
```

Note that the output `needsFingerprinting` is an array of arrays
with a fan out controlled by some default settings. This is because
choosing the parallelisation level is useful for controlling the
extraction (and we want this output to feed directly in as an input to
that stage).

---

#### Extract

`umccr -> fingerprint -> (single service) -> extractStepsArn`

with an input of

```json
{
  "needsFingerprinting": [
    [
      "gds://development/sample1.bam",
      "gds://development/sample2.bam"
    ],
    [
      "gds://development/sample3.bam"
    ]
  ],
  "...": ...
}
```

and produces output of the form

```json
{}
```

Each entry in the `needsFingerprinting` array will cause a new ECS Task
to be invoked for performing the fingerprinting. There are some advantages to
doing multiple fingerprints sequentially in the task, so it is up to the
invoker to chose how many BAMs to process on each Task.

Fingerprinting each BAM takes approximately 15 minutes.

---

#### Check

`umccr -> fingerprint -> (single service) -> checkStepsArn`

with an input of

```json
{
  "index": "gds://development/sample1.bam",
  "relatednessThreshold": 0.4
}
```

`relatednessThreshold` is optional.

produces output of the form

```json
[
  {
    "file": "gds://development/sample1.bam",
    "relatedness": 1,
    "ibs0": 0,
    "ibs2": 16146,
    "hom_concordance": 1,
    "hets_a": 6163,
    "hets_b": 6163,
    "hets_ab": 12326,
    "shared_hets": 6163,
    "hom_alts_a": 5389,
    "hom_alts_b": 5389,
    "shared_hom_alts": 5389,
    "n": 16146,
    "x_ibs0": 0,
    "x_ibs2": 769
  }
]
```

The index BAM should _always_ be returned with a relatedness of 1 - confirming that
the service is working. Any other BAMs that have a relatedness above the threshold
will also be returned.

This service takes approximately 15 seconds to run.

---

#### Difference Then Extract

`umccr -> fingerprint -> (single service) -> differenceThenExtractStepsArn`

This operation takes empty input and returns empty output.

## Costing

Estimates are available [here](COSTS.md). They have been shown in
practice to be roughly correct.

## Design

The service maintains an S3 bucket that stores fingerprint files (~200k per BAM).

Because fingerprints must be produced using the same `sites.vcf.gz` file to
be compatible in `somalier` for the checking operation - we use the MD5 checksum of the
sites file to partition the fingerprints. All fingerprints for an
identical sites file will live in the same folder in our fingerprint store.

Any change to the sites file content _will result in needing to recreate all
existing fingerprints_ - though this is an operation that does not happen
very often.

We can see this in a hypothetical world where one sites files has
checksum `ABCDEF`, and another has checksum `GHIJKL`. We can see that
in this scenario the `bam3.bam` has not been fingerprinted at all, where
`bam1.bam` has only been fingerprinted with one sites file. `bam2.bam`
has a fingerprint for both sites files.

```mermaid
  graph TD;
      subgraph bams living externally in any location readable by the service
          bam1("gds://spot/bam1.bam")
          bam2("gds://otherspot/bam2.bam")
          bam3("s3://bucket/bam3.bam")
      end
      subgraph S3 fingerprints bucket
        subgraph S3 folder ABCDEF/
          f1("ABCDEF/hex encoded URL of BAM1")
          f2("ABCDEF/hex encoded URL of BAM2")
        end
        subgraph S3 folder GHIJKL/
          f3("GHIJKL/hex encoded URL of BAM2")
        end
      end
      bam1-->f1
      bam2-->f2
      bam2-->f3
```

The operations provided by the service are focussed around
a) determining which fingerprints are missing
b) producing new fingerprints
c) checking fingerprints against others

There is no other data store for the service - the existence of a fingerprint
in S3 with a path matching the sites checksum and BAM URL (hex encoded) is
the canonical definition that a BAM has been fingerprinted.

The check operation will always operate against all fingerprints that
exist (albeit only those matching the current sites file checksum).

### Lambdas

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
    "index": "gds://development/analysis_data/SBJ00480/wgs_alignment_qc/20211128e4a69bdb/L2000966__1_dragen_somalier/PTC_Tsqn201109MB.somalier",
  }
```

## Deployment

- `cdk deploy` deploy this stack to your default AWS account/region
- `cdk diff` compare deployed stack with current state
- `cdk synth` emits the synthesized CloudFormation template
