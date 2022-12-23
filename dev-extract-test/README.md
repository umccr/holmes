# Dev testing of the extraction step

When doing development, it is useful to be able to launch these tasks locally - at the
minimum to avoid having to deploy to AWS before even executing the code.

## Setup

Copy the `reference.hg38.rna.fa` and `reference.hg38.rna.fa.fai` files from any
source into this folder. They are ignored by git so will not ever be checked in.

## Test

Do any dev work you want on the extract code (inside the docker image).

Then execute

```shell
extract-test.sh
```
