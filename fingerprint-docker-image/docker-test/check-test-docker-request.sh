#!/bin/sh

curl -s -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" \
 -d '{"index":"s3://umccr-10g-data-dev/HG00096/HG00096.somalier","relatednessThreshold":0.5,"fingerprints": ["s3://umccr-10g-data-dev/HG00097/HG00097.somalier", "gds://development/analysis_data/SBJ00910/wgs_alignment_qc/202201212c374ca2/L2100746__1_dragen_somalier/MDX210176.somalier", "s3://umccr-10g-data-dev/somalier-temp/96A.somalier"]}' | jq
