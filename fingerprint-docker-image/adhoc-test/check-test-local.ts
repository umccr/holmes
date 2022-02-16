import { lambdaHandler } from "../check";

// this is a simulation of a single invocation of the lambda i.e
// a comparison of the index case against a "small" subset of files
(async () => {
  const r = await lambdaHandler(
    {
      index: "s3://umccr-10g-data-dev/HG00096/HG00096.somalier",
      relatednessThreshold: 0.5,
      fingerprints: [
        "s3://umccr-10g-data-dev/HG00097/HG00097.somalier",
        "s3://umccr-10g-data-dev/HG00099/HG00099.somalier",
        "s3://umccr-10g-data-dev/somalier-temp/96A.somalier",
        "s3://umccr-10g-data-dev/somalier-temp/96B.somalier",
        "gds://development/analysis_data/SBJ00910/wgs_alignment_qc/202201212c374ca2/L2100746__1_dragen_somalier/MDX210176.somalier",
        // "gds://umccr-primary-data-dev/analysis_data/SBJ01556/wgs_alignment_qc/202202061a82005a/L2200097__1_dragen_somalier/MDX220015.somalier"
      ],
    },
    {}
  );

  console.log(r);
})();
