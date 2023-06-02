# API

The service provides API entry points as AWS lambdas or AWS Steps functions.

These functions are registered into the `umccr` namespace.

Only one service instance will ever be registered in the namespace, so
do a service discovery locate for the `fingerprint`
service - and then select the one and only service instance present.
Then choose the custom attribute that matches the Lambda or Steps function Arn
to invoke.

---

## Extract

`umccr -> fingerprint -> (single service) -> extractStepsArn`

with an input of

```json lines
{
  "indexes": ["bamUrl1", ...],
  "reference": "hg38.rna"
}
```

`reference` must match references and sites that are present in the `config/` folder of the fingerprint bucket - in practice `hg38.rna` or `hg19.rna`.

`fingerprintFolder` is optional and will default to `"fingerprints/"`. It MUST have a trailing slash.

Each entry in the `indexes` array will be fingerprinted. There are some advantages to
doing multiple fingerprints sequentially in the task, so it is up to the
invoker to chose how many BAMs to process on each Task.

Fingerprinting each BAM takes approximately 15 minutes.

---

## Check

`umccr -> fingerprint -> (single service) -> checkLambdaArn`

with a lambda input matching

```typescript
{
  // EITHER the BAM urls to use as indexes in our check against the database
  indexes?: string[];
  // OR a set of BAM url regexes ANY of which need to match to be considered for checks
  regexes?: string[];

  // the slash terminated folder where the fingerprints have been sourced in S3 (i.e. the folder key + /)
  fingerprintFolder: string;

  // if present, a threshold of relatedness for somalier, or use a default
  relatednessThreshold?: number;

  // if present, impose a minimum N in somalier to be considered a positive "relation" between samples
  minimumNCount?: number;

  // if present, a regular expression to apply to all filenames to exclude them from holmes entirely
  excludeRegex?: string;

  // if present, a regular expression with single capture group that defines "related" between samples
  expectRelatedRegex?: string;

  // if present, tells the lambda to additionally send the response as an attachment to Slack in that channel
  channelId?: string;
}
```

e.g.

```json lines
{
  "indexes": ["gds://development/SBJ00123/sample1.bam"],
  "fingerprintFolder": "fingerprints/",
  "minimumNCount": 50,
  "expectRelatedRegex": "^.*SBJ(\\d\\d\\d\\d\\d).*$",
  "excludeRegex": "^.*(PTC_|NTC_).*$"
}
```

The check returns a dictionary _keyed_ by index URLs - where the index
exists in the fingerprint database. That is, if you ask for 3 indexes - but only 2 actually exist
with fingerprints - the returned dictionary will have only 2 keys.

The dictionary _value_ will be a data structure showing all other fingerprints in the
database that fall into the categories of

- self
- expected related
- unexpected related
- unexpected unrelated

---

## Relate

`umccr -> fingerprint -> (single service) -> relateLambdaArn`

with a lambda input matching

```typescript
{
  // EITHER the BAM urls to use as indexes
  indexes?: string[];
  // OR a set of BAM url regexes ANY of which matching will include the BAM in the index
  regexes?: string[];

  // the slash terminated folder where the fingerprints have been sourced in S3 (i.e. the folder key + /)
  fingerprintFolder: string;

  // if present, a regular expression to apply to all filenames to exclude them from use as indexes entirely
  excludeRegex?: string;

  // if present, tells the lambda to send the response as an attachment to Slack in that channel
  channelId?: string;
}
```

The relate command returns an object with two fields. `samplesTsv` and `pairsTsv` - which
correspond to the direct output of the `somalier` tool itself when run
over the given indexes. The only alteration is that index URLs have been
substituted into the TSV instead of sample ids.
