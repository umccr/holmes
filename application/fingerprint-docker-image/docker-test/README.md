# Local testing of Docker images

We often want to test the structure of the Docker builds (missing libraries etc)
as part of the dev cycle.

This set of scripts helps do that testing.

NOTE: whilst this runs the code in the same Docker environment as it will eventually
be run in Fargate/Lambda - we cannot _exactly_ recreate the AWS environment.
For instance - when running in the real Lambda environment - the directory `/var/task`
is read-only - yet when run here it is read/write. So don't be surprised if
occasionally you need to fully deploy things into AWS to discover issues like that.

```
{
  "fileGroups": [
    [
      "gds://development/analysis_data/SBJ00006/wgs_alignment_qc/20220312be2a88ce/L2100755__1_dragen/NTC_Tsqn210707.bam",
      "gds://development/analysis_data/SBJ00020/wgs_alignment_qc/20220312151bf581/L2100754__1_dragen/PTC_Tsqn210707.bam",
      "gds://development/analysis_data/SBJ00716/wgs_alignment_qc/20220312b5ddae4f/L2100751__4_dragen/PRJ210678.bam"
    ],
    [
      "gds://development/analysis_data/SBJ00851/wgs_alignment_qc/20220312335a89bf/L2100744__3_dragen/MDX210149.bam"
    ],
    [
      "gds://development/analysis_data/SBJ00851/wgs_alignment_qc/202203124c79d6f9/L2100743__2_dragen/MDX210148.bam"
    ],
    [
    "gds://development/analysis_data/SBJ00869/wgs_alignment_qc/20220312645610a7/L2100610__4_dragen/PRJ210452.bam",
    "gds://development/analysis_data/SBJ00872/wgs_alignment_qc/20220312717a141c/L2100613__4_dragen/PRJ210455.bam",
    "gds://development/analysis_data/SBJ00873/wgs_alignment_qc/20220312bce0ee69/L2100614__4_dragen/PRJ210456.bam",
    "gds://development/analysis_data/SBJ00880/wgs_alignment_qc/20220312c22b0567/L2100621__4_dragen/PRJ210463.bam"
    ],
    [
    "gds://development/analysis_data/SBJ00910/wgs_alignment_qc/2022031261a19d95/L2100746__1_dragen/MDX210176.bam",
    "gds://development/analysis_data/SBJ00910/wgs_alignment_qc/202203126ab22621/L2100745__1_dragen/MDX210175.bam",
    "gds://development/analysis_data/SBJ00912/wgs_alignment_qc/202203127f7611b2/L2100752__4_dragen/PRJ210680.bam",
    "gds://development/analysis_data/SBJ00912/wgs_alignment_qc/20220312ed73bf79/L2100753__4_dragen/PRJ210681.bam",
    "gds://development/analysis_data/SBJ00913/wgs_alignment_qc/20220312c26574d6/L2100747__2_dragen/MDX210178.bam",
    "gds://development/analysis_data/SBJ00913/wgs_alignment_qc/20220312dfcd9d05/L2100748__2_dragen/MDX210179.bam",
    "gds://development/analysis_data/SBJ00915/wgs_alignment_qc/20220312076df8de/L2100741__2_dragen/MDX210100.bam",
    "gds://development/analysis_data/SBJ00915/wgs_alignment_qc/20220312aa5b3fd7/L2100742__3_dragen/MDX210173.bam"
    ]
  ]
}
```
