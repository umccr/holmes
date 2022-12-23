# CLI example of holmes

## extract and check

> extract_and_check_a_single_bam.sh

Use the `aws` cli (along with `jq`) to navigate through the extact and check step functions of holmes

### Usage

```bash
BAM_GDS_FILE_PATH="gds://production/analysis_data/SBJ00005/wgs_alignment_qc/20211201bd0ac3a3/L2101368__4_dragen/PTC_Tsqn211109.bam"
bash extract_and_check_a_single_bam.sh --bam-path "${BAM_GDS_FILE_PATH}"
```
