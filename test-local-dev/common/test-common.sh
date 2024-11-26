#!/bin/bash

# common setting used by the shell test scripts
# NOTE: these *should* not change, but could if a major reorg was done on dev (for instance)
# they are settings for hand created 'dev' resources

# NOTE: we would love to merge both the docker_start commands but there is enough difference
# in how the docker is run that it was too complex to attempt

# these can safely be checked into github - despite detect-secrets thinking they might be passwords
export FINGERPRINT_BUCKET_NAME="umccr-fingerprint-local-dev-test"                                  # pragma: allowlist secret
export FINGERPRINT_CONFIG_FOLDER="config/"
export DOCKER_IMAGE_NAME="fingerprint"

function check_is_dev() {
  ACCOUNT=$(aws sts get-caller-identity --query Account --output text || echo "")

  if [[ "$ACCOUNT" != "843407916570" ]]; then
    echo >&2 "Dev test scripts must be run in the UMCCR dev account"

    return 1
  fi
}

function docker_build() {
  # somalier binary is only set up for AMD64 images so we have to force that platform
  docker build --platform linux/amd64 -t $DOCKER_IMAGE_NAME "$(dirname "${BASH_SOURCE[0]}")/../../artifacts/fingerprint-docker-image"
}

function docker_start_check() {
  if [[ "X$1" = "X" ]]; then
    echo >&2 "docker_start_check requires the CMD to be passed as the first argument"

    return 1
  fi

  if [[ "X$2" = "X" ]]; then
    echo >&2 "docker_start_check requires the fingerprint folder to be passed as the second argument"

    return 1
  fi

  # somalier binary is only set up for AMD64 images so we have to force that platform
  C=$(docker run --platform linux/amd64 -d --rm -p 9000:8080 \
    --env AWS_REGION=ap-southeast-2 \
    --env AWS_ACCESS_KEY_ID \
    --env AWS_SECRET_ACCESS_KEY \
    --env AWS_SESSION_TOKEN \
    --env SECRET_ARN="$ICA_SECRET_ARN" \
    --env FINGERPRINT_BUCKET_NAME="$FINGERPRINT_BUCKET_NAME" \
    --env FINGERPRINT_CONFIG_FOLDER="$FINGERPRINT_CONFIG_FOLDER" \
    --env FINGERPRINT_FOLDER="$2" \
    $DOCKER_IMAGE_NAME "$1")

  # return the Docker PID of the container we started
  printf '%s' "$C"

  return 0
}

function docker_start_extract() {
  if [[ "X$1" = "X" ]]; then
    echo >&2 "docker_start_extract requires the extractable BAM to be passed as the first argument"

    return 1
  fi

  if [[ "X$2" = "X" ]]; then
    echo >&2 "docker_start_extract requires the destination fingerprint folder to be passed as the second argument"

    return 1
  fi

  if [[ "X$3" = "X" ]]; then
    echo >&2 "docker_start_extract requires the reference genome to be passed as the third argument"

    return 1
  fi

  # get the absolute path to the common folder
  local US_PATH="$(realpath $(dirname "${BASH_SOURCE[0]}"))"

  # somalier binary is only set up for AMD64 images so we have to force that platform
  C=$(docker run --platform linux/amd64 --rm \
    --mount type=bind,source=$US_PATH/reference.$3.fa,target=/tmp/reference.fa \
    --mount type=bind,source=$US_PATH/reference.$3.fa.fai,target=/tmp/reference.fa.fai \
    --mount type=bind,source=$US_PATH/sites.$3.vcf.gz,target=/tmp/sites.vcf.gz \
    --env AWS_REGION=ap-southeast-2 \
    --env AWS_ACCESS_KEY_ID \
    --env AWS_SECRET_ACCESS_KEY \
    --env AWS_SESSION_TOKEN \
    --env FINGERPRINT_BUCKET_NAME="$FINGERPRINT_BUCKET_NAME" \
    --env FINGERPRINT_CONFIG_FOLDER="$FINGERPRINT_CONFIG_FOLDER" \
    --entrypoint node \
    $DOCKER_IMAGE_NAME \
    "/var/task/extract.cjs" \
    "$3" "$2" "SBJ1" "LIB2" "$1")

  # return the Docker PID of the container we started
  printf '%s\n' "$C"

  return 0
}
