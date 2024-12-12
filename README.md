# holmes

A set of functionality for performing large-scale bioinformatics fingerprint checks.

This is a CDK project that deploys lambdas and step functions to perform various
tasks.

## Overview

The `somalier` tool is a useful tool for generating genomics fingerprint files -
taking a BAM file and producing a much smaller representation
of variance at set locations throughout.

These files can then be compared to each other and rated with a 'relatedness' score. Where
genomics files are samples from the sample human, or close relatives - this score
is high, and therefore the `relatedness` score can help guard against
sample mix-ups - by uncovering where unexpected relationships exist between
samples.

Holmes is a low-cost (activity only costing - almost no cost as rest) tool that can be interacted
with via AWS API (Lambda and Steps) OR via Slack commands. It will perform a variety
of `somalier` calls over a large database of fingerprints.

## Developers

Before doing any development work - please see [here](docs/DEV.md) for dev setup instructions.

## Service (as API)

See [here](docs/API.md)

## Service (as Slack command)

See [here](docs/SLACK.md)

## Deployment

The stack _does not_ create the fingerprint bucket. Instead this should be created
manually before installing Holmes.

(in the past this bucket was created in the Holmes stack but that prevented deleting
the CDK entirely - so instead now the Holmes stack is entirely stateless and the bucket
needs to be made separately)

Below is the previous definition. The only main thing of note is the two lifecycle rules
that clean up data. To be honest, it doesn't particularly matter if they are not present, just
the bucket will fill unnecessarily.

```typescript
new Bucket(this, "FingerprintBucket", {
  bucketName: props.fingerprintBucketName,
  objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
  lifecycleRules: [
    // we give the test suites the ability to create folders like fingerprints-test-01231432/
    // and we will auto delete them later
    {
      prefix: "fingerprints-test",
      expiration: Duration.days(1),
    },
    // space for us to make temp file results from the DistributedMap
    {
      prefix: "temp",
      expiration: Duration.days(1),
    },
  ],
  removalPolicy: RemovalPolicy.RETAIN,
});
```

## Admin CLI

A CLI tool has been written for administrators that is a parking spot for
various functionality. For instance, when we renamed the format of the fingerprints in S3 -
we wrote a Python tool to do that. The current NodeJs version is the best
spot for putting this functionality now. See [here](admin-cli).

Easiest entry point is to `cd` into `admin-cli` and type

```shell
./.holmes-admin-cli.ts list
```

which will print a list of all fingerprints in TSV format. Command line flags
control the bucket and folder.

## Costing

Estimates are available [here](docs/COSTS.md). They have been shown in
practice to be roughly correct.

## Design

The service maintains an S3 bucket that stores fingerprint files (~200k per BAM) and then
provides AWS Steps/Lambda functions that operate to run `somalier` over these files.

```mermaid
  graph TD;
      subgraph bams living externally in any location readable by the service
          bam1("gds://spot/bam1.bam")
          bam2("gds://otherspot/bam2.bam")
          bam3("s3://bucket/bam3.bam")
      end
      subgraph S3 fingerprints bucket
        subgraph S3 folder ABCDEF/
          f1("ABCDEF/encoded URL of BAM1")
          f2("ABCDEF/encoded URL of BAM2")
        end
      end
      bam1-->f1
      bam2-->f2
      bam2-->f3
```

The operations provided by the service are focussed around
a) producing new fingerprints
b) checking fingerprints against others

There is no other data store for the service - the existence of a fingerprint
in S3 with a path matching the sites checksum and BAM URL (encoded) is
the canonical definition that a BAM has been fingerprinted.

The check operation will always operate against all fingerprints that
exist in the designated fingerprint folder.

## Algorithm

The details of how `somalier` scores are used is documented [here](docs/ALGORITHM.md).
