#!/usr/bin/env bash

: '
Use the fingerprint service id to complete the following steps:
1. Extract the fingerprint from the bam file path
2. Then check the fingerprint against all other known fingerprints

Fingerprint uses the AWS Cloud Map service - https://ap-southeast-2.console.aws.amazon.com/cloudmap/home/namespaces
to enable a user to find the service/instances of a cloud formation.

We cannot hardcode our statemachine values in this script since they may update at short notice with a change to the cdk.
'

# Set to fail
set -euo pipefail

# Set globals
SERVICE_NAME="fingerprint"
BAM_GDS_FILE_PATH="gds://production/analysis_data/SBJ00005/wgs_alignment_qc/20211201bd0ac3a3/L2101368__4_dragen/PTC_Tsqn211109.bam"
EXTRACT_STEPS_ARN_KEY="extractStepsArn"
CHECK_STEPS_ARN_KEY="checkStepsArn"
RELATEDNESS_THRESHOLD="0.4"

# Sanity checks
# 1. You have all the binaries you need
if ! type aws jq sed >/dev/null 2>&1; then
  echo "Please ensure you have aws, jq and sed installed"
fi
# 2. Youre version of aws is awsv2
aws_major_version="$( \
  aws --version | {
  # Start with
  # aws-cli/2.3.0 Python/3.8.8 Linux/5.10.16.3-microsoft-standard-WSL2 exe/x86_64.ubuntu.20 prompt/off
  # Sed Part 1:
  # s% %", "%g
  # converts spaces to ", "
  # to
  # aws-cli/2.3.0", "Python/3.8.8", "Linux/5.10.16.3-microsoft-standard-WSL2", "exe/x86_64.ubuntu.20", "prompt/off
  # Sed Part 2:
  # s%.*%{"&"}%
  # wraps entire input in {" "}
  # {"aws-cli/2.3.0", "Python/3.8.8", "Linux/5.10.16.3-microsoft-standard-WSL2", "exe/x86_64.ubuntu.20", "prompt/off"}
  # Sed Part 3:
  # s%/%": "%g
  # Splits keys from values
  # {"aws-cli": "2.3.0", "Python": "3.8.8", "Linux": "5.10.16.3-microsoft-standard-WSL2", "exe": "x86_64.ubuntu.20", "prompt": "off"}
  sed 's% %", "%g;s%.*%{"&"}%;s%/%": "%g'
  } | {
  # Collect the '2' from '2.3.0'
  jq --raw-output \
   '.["aws-cli"][:1]'
})"
# Check value is 2 or higher
if [[ "${aws_major_version}" -lt "2" ]]; then
  echo "Please install the aws v2 cli" 1>&2
  exit 1
fi

# 3. Youre logged into AWS
if [[ ! "$(aws sts get-caller-identity --output json | jq '.Account != null')" == "true" ]]; then
  echo "Could not confirm user is logged into aws"
  exit 1
fi

# Get service ID from AWS Cloudmap
echo "Collecting the fingerprint service id" 1>&2
fingerprint_service_id="$( \
  aws servicediscovery list-services \
    --output json | \
  jq --raw-output \
    --arg service_name "${SERVICE_NAME}" \
    '
      .Services[] |
      select(.Name=="fingerprint") |
      .Id
    ' \
)"

# Get service instances
echo "Collecting the fingerprint service instances" 1>&2
service_attributes_json_str="$( \
  aws servicediscovery list-instances \
    --output json \
    --service-id "${fingerprint_service_id}" | \
  jq --raw-output \
     '
       .Instances[] |
       .Attributes |
       to_entries
     ' \
)"

# Get the extract step statemachine
echo "Collecting the id of the extract step function" 1>&2
extract_step_statemachine_arn="$( \
  jq --raw-output \
    --arg extract_steps_arn_key "${EXTRACT_STEPS_ARN_KEY}" \
    '
      .[] |
      select(.key==$extract_steps_arn_key) |
      .value
    ' \
    <<< "${service_attributes_json_str}" \
)"

# Generate the cli-input-json for the statemachine to have the following jsonised input
: '
{
  "needsFingerprinting": [
    [
      "gds://development/path/to/bam/file"
    ]
  ]
}
'

echo "Generate the cli input for the extract step" 1>&2
extract_cli_input_json_str="$( \
  jq --raw-output --null-input --compact-output \
    --arg input_bam_file "${BAM_GDS_FILE_PATH}" \
    '
      {
        "input": {
          "needsFingerprinting": [
            [
              $input_bam_file
            ]
          ]
        } | tojson
      }
    '
)"

# Call the extraction step function
echo "Call the extraction step" 1>&2
extraction_run_instance_arn="$( \
 aws stepfunctions start-execution \
   --output json \
   --state-machine-arn "${extract_step_statemachine_arn}" \
   --cli-input-json "${extract_cli_input_json_str}" | \
 jq --raw-output \
   '.executionArn'
)"

# Wait for the extraction step to complete
default_status="RUNNING"
while :; do
  # Get status
  current_execution_status="$( \
    aws stepfunctions describe-execution \
      --output json \
      --execution-arn "${extraction_run_instance_arn}" | \
    jq --raw-output \
      '.status' \
  )"

  # If still running then just sleep for a bit
  if [[ "${current_execution_status}" == "${default_status}" ]]; then
    sleep 60
    continue
  fi

  # Oooh, our status has changed...
  echo "Our extract status has changed to ${current_execution_status}"
  break
done

if [[ "${current_execution_status}" != "SUCCEEDED" ]]; then
  echo "Extraction arn '${extraction_run_instance_arn}' failed with status '${current_execution_status}'" 1>&2
  exit 1
fi

# Check the fingerprint against other existing finger prints
echo "Get the fingerprint statemachine arn" 1>&2
check_step_statemachine_arn="$( \
  jq --raw-output \
    --arg check_steps_arn_key "${CHECK_STEPS_ARN_KEY}" \
    '
      .[] |
      select(.key==$check_steps_arn_key) |
      .value
    ' \
    <<< "${service_attributes_json_str}" \
)"

# Generate the input for the the check stepfunction
# Should look something
: '
{
  "index": "gds://path/to/bam/path",
  "relatednessThreshold": 0.4
}
'
echo "Generate check stepfunction input" 1>&2
check_step_cli_input_json_str="$( \
  jq --raw-output --null-input --compact-output \
    --arg input_bam_file "${BAM_GDS_FILE_PATH}" \
    --arg relatedness_threshold "${RELATEDNESS_THRESHOLD}" \
    '
      {
        "input": {
          "index": $input_bam_file,
          "relatednessThreshold": $relatedness_threshold | tonumber
        } | tojson
      }
    '
)"

# Now run the check function
check_step_run_instance_arn="$( \
  aws stepfunctions start-execution \
   --output json \
   --state-machine-arn "${check_step_statemachine_arn}" \
   --cli-input-json "${check_step_cli_input_json_str}" |
  jq --raw-output \
    '.executionArn'
)"

echo "${check_step_run_instance_arn}"

# Wait for check step to complete
# This should take around only 20 seconds
default_status="RUNNING"
while :; do
  # Get status
  current_execution_status="$( \
    aws stepfunctions describe-execution \
      --output json \
      --execution-arn "${check_step_run_instance_arn}" | \
    jq --raw-output \
      '.status' \
  )"

  # If still running then just sleep for a bit
  if [[ "${current_execution_status}" == "${default_status}" ]]; then
    sleep 10
    continue
  fi

  # Oooh, our status has changed...
  echo "Our check status has changed to ${current_execution_status}"
  break
done

if [[ "${current_execution_status}" != "SUCCEEDED" ]]; then
  echo "Extraction arn '${check_step_run_instance_arn}' failed with status '${current_execution_status}'" 1>&2
  exit 1
fi

# Show relatedness
aws stepfunctions describe-execution \
  --execution-arn "${check_step_run_instance_arn}" \
  --output json |
jq --raw-output \
  --arg input_bam_file "${BAM_GDS_FILE_PATH}" \
  '
    def get_subject: .file | split("/")[4];
    [
      .output | fromjson[] |
      select(
        .file != $input_bam_file
      ) |
      {
        "subject": get_subject,
        "relatedness": .relatedness,
      }
    ] |
    sort_by(.relatedness) | reverse |
    unique_by(.subject)
  '

