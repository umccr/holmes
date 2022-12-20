import { argv } from "process";
import { extract } from "./lib/extract";
import { lambdaHandler as differenceLambdaHandler } from "./lambda-entry-difference";
import { lambdaHandler as checkLambdaHandler } from "./lambda-entry-check";

(async () => {
  try {
    const lambdaChoice = argv[2];

    switch (lambdaChoice) {
      case "difference":
        const differenceResult = await differenceLambdaHandler(
          {
            devChunkSize: 2,
            devMaxGdsFiles: 100,
          },
          {}
        );
        console.log(differenceResult);
        break;
      case "extract":
        await extract([
          "gds://development/analysis_data/SBJ00006/wgs_alignment_qc/20220312be2a88ce/L2100755__1_dragen/NTC_Tsqn210707.bam",
          "gds://development/analysis_data/SBJ00020/wgs_alignment_qc/20220312151bf581/L2100754__1_dragen/PTC_Tsqn210707.bam",
        ]);
        console.log("done extract");
        break;
      case "check":
        const checkResult = await checkLambdaHandler(
          {
            BatchInput: {
              index: "gds://1kg-genomes/extra/NA20790.bam",
              relatednessThreshold: 0.5,
            },
            Items: [],
          },
          {}
        );

        console.log(checkResult);
        break;
      default:
        throw new Error(`Unknown lambda to test ${lambdaChoice}`);
    }
  } catch (e) {
    console.log(e);
  }
})();
