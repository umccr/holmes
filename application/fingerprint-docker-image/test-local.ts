import { argv } from "process";
import { extract } from "./extract";
import { lambdaHandler as differenceLambdaHandler } from "./lambda-entry-difference";
import { lambdaHandler as checkLambdaHandler } from "./lambda-entry-check";
import { lambdaHandler as checkStartLambdaHandler } from "./lambda-entry-check-start";
import { lambdaHandler as checkEndLambdaHandler } from "./lambda-entry-check-end";
import { start } from "repl";

(async () => {
  try {
    const lambdaChoice = argv[2];

    if (lambdaChoice == "difference") {
      const r = await differenceLambdaHandler(
        {
          gdsVolumes: ["development"],
          gdsFileWildcard: "*.bam",
          chunkSize: 3,
          // devMaxGdsFiles: 10
        },
        {}
      );
      console.log(r);
    } else if (lambdaChoice == "extract") {
      await extract([
        "gds://development/analysis_data/SBJ00006/wgs_alignment_qc/20220312be2a88ce/L2100755__1_dragen/NTC_Tsqn210707.bam",
        "gds://development/analysis_data/SBJ00020/wgs_alignment_qc/20220312151bf581/L2100754__1_dragen/PTC_Tsqn210707.bam",
      ]);
      console.log("done extract");
    } else if (lambdaChoice == "check") {
      const r = await checkLambdaHandler(
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
    } else if (lambdaChoice == "check-start") {
      const r = await checkStartLambdaHandler(
        {
          index:
            "gds://development/analysis_data/SBJ00006/wgs_alignment_qc/20220312be2a88ce/L2100755__1_dragen/NTC_Tsqn210707.bam",
          relatednessThreshold: 0.5,
          chunkSize: 5,
        },
        {}
      );

      console.log(r);
    } else if (lambdaChoice == "check-end") {
      const r = await checkEndLambdaHandler(
        {
          index:
            "gds://development/analysis_data/SBJ00006/wgs_alignment_qc/20220312be2a88ce/L2100755__1_dragen/NTC_Tsqn210707.bam",
          relatednessThreshold: 0.5,
          chunkSize: 5,
        },
        {}
      );

      console.log(r);
    } else if (lambdaChoice == "check-steps") {
      // simulate the flow through multiple steps (ala Steps)
      const startResult = await checkStartLambdaHandler(
        {
          index:
            "gds://development/analysis_data/SBJ00006/wgs_alignment_qc/20220312be2a88ce/L2100755__1_dragen/NTC_Tsqn210707.bam",
          relatednessThreshold: 0.5,
          chunkSize: 5,
        },
        {}
      );
      const checkResult = await checkLambdaHandler(
        {
          index: startResult.index,
          relatednessThreshold: startResult.relatednessThreshold,
          fingerprints: startResult.fingerprintTasks[0],
        },
        {}
      );
      console.log(checkResult);
      const endResult = await checkEndLambdaHandler(
        {
          index:
            "gds://development/analysis_data/SBJ00006/wgs_alignment_qc/20220312be2a88ce/L2100755__1_dragen/NTC_Tsqn210707.bam",
          relatednessThreshold: 0.5,
          chunkSize: 5,
        },
        {}
      );
    } else throw new Error(`Unknown lambda to test ${lambdaChoice}`);
  } catch (e) {
    console.log(e);
  }
})();
