import { lambdaHandler } from "../gather";

(async () => {
  const r = await lambdaHandler(
    {
        portalBearer: process.env.PORTAL_TOKEN || "goingtofail",
        portalUrl: "https://api.data.dev.umccr.org",
        index: "gds://development/analysis_data/SBJ00910/wgs_alignment_qc/202201212c374ca2/L2100746__1_dragen_somalier/MDX210176.somalier",
        relatednessThreshold: 0.5,
        chunkSize: 5
    },
    {}
  );

  console.log("The return result from collecting all the fingerprint files");
  console.log(r);
})();
