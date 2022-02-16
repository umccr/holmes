import { lambdaHandler } from "../extract";

// this is a simulation of a single invocation of the lambda to generate a fingerprint
(async () => {
  const r = await lambdaHandler(
    {
      index: "gds://development/analysis_data/SBJ00851/wgs_alignment_qc/2022012161923896/L2100743__2_dragen/MDX210148.bam"
    },
    {}
  );

  console.log(r);
})();
