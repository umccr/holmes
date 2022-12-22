# Dev testing of the check step

When doing development, it is useful to be able to launch these tasks locally - at the
minimum to avoid having to do a full check in to run the code.

## Setup

The full check step uses a Steps machine deployed to AWS - so we need to do this in
order to usefully test.

In the root of this project - whenever you make dev changes you will need to

`npx cdk deploy HolmesLocalDevTestStack`

to send the updated state machine to AWS.

## Test

Then execute

```shell
extract-test.sh
```
