# Holmes - a low cost fingerprint solution for genomic labs

WIP (this is a potential paper speaking about the design of the system)

## Fingerprinting

It is useful for a genomic lab to be able to ask the question - "have we seen
this human/specimen before"? The ability to determine which specimens are
genomically "the same" as other specimens already sequenced allows a lab to
notice a variety of problems

- DNA contamination at the web lab
- sample identifier mix ups
- fundamental patient identifier mix ups such as issuing a new patient identifier to an existing patient

For UMCCR we had two specific use cases

- the ability just after sequencing to compare the new sequences to those already sequenced (no time constraints)
- at any point in time to retrieve a report of "relatedness" for any given specimen (responsive, sub 30 seconds)

The `somalier` tool by Brent is a possible tool for this fingerprinting - but operates in an 'all-pairs' mode
where the relatedness report is the full matrix comparing all specimens to each other. Whilst useful,
the all pairs mode requires memory that squares with the number of specimens, requires file based access
to all the fingerprints (and subsequent file system speed to access all the fingerprints).

As an example we will use the 2,500 samples from the 1000 genomes project. To perform an all-pairs
fingerprint check requires

- all the fingerprints could be kept in an EFS volume - but burst access to the them might
  be a constraint
- we could permanently keep an EC2 instance with all the fingerprints, though would have to scale the
  memory of this machine as the number of specimens grew
- we could have used Dynamo tables as the fingerprints can fit within a single Dynamo (1MB) limit

We desired a solution that had more minimal costs when not being used - acknowledging that
at some point it is impossible to get around the fact that the fingerprints themselves need to
be stored and paid for. But a service that otherwise has nothing but usage costs.

## Requirements

Like most genomic labs - the volume of genomic tests is bursty - often batched
up until the sequencer run is fully utilised.
