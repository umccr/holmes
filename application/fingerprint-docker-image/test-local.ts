import { argv } from "process";
import { extract } from "./lib/extract";
import { lambdaHandler as differenceLambdaHandler } from "./lambda-entry-difference";
import { lambdaHandler as checkLambdaHandler } from "./lambda-entry-check";
import { lambdaHandler as checkStartLambdaHandler } from "./lambda-entry-check-start";

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
      case "check-start":
        const checkStartResult = await checkStartLambdaHandler(
          {
            index:
              "gds://development/test-data/holmes-test-data/family/giab_exome_trio/HG002-ready.bam",
            excludeRegex: ".*HG.*",
          },
          {}
        );

        console.log(checkStartResult);
        break;
      case "check":
        const checkResult = await checkLambdaHandler(
          {
            index:
              "gds://development/analysis_data/SBJ00913/wgs_tumor_normal/2022031260ecc964/L2100748_L2100747_dragen/MDX210178_normal.bam",
            sitesChecksum: "ad0e523b19164b9af4dda86c90462f6a", // pragma: allowlist secret
            relatednessThreshold: 0.5,
            fingerprints: [
              "ad0e523b19164b9af4dda86c90462f6a/6764733a2f2f646576656c6f706d656e742f616e616c797369735f646174612f53424a30303030362f7767735f616c69676e6d656e745f71632f323032323033313262653261383863652f4c323130303735355f5f315f64726167656e2f4e54435f5473716e3231303730372e62616d",
              "ad0e523b19164b9af4dda86c90462f6a/6764733a2f2f646576656c6f706d656e742f616e616c797369735f646174612f53424a30303032302f7767735f616c69676e6d656e745f71632f323032323033313231353162663538312f4c323130303735345f5f315f64726167656e2f5054435f5473716e3231303730372e62616d",
              "ad0e523b19164b9af4dda86c90462f6a/6764733a2f2f646576656c6f706d656e742f616e616c797369735f646174612f53424a30303437392f7774735f74756d6f725f6f6e6c792f323032323033313237613266663731332f4c323130303733365f64726167656e2f5054435f4e6562524e413231303730362e62616d",
              "ad0e523b19164b9af4dda86c90462f6a/6764733a2f2f646576656c6f706d656e742f616e616c797369735f646174612f53424a30303731362f756d6363726973652f323032323033313339383862663038632f4c323130303735315f5f4c323130303231392f776f726b2f53424a30303731365f5f50524a3231303637382f6f6e636f766972757365732f776f726b2f6465746563745f766972616c5f7265666572656e63652f686f73745f756e6d61707065645f6f725f6d6174655f756e6d61707065645f746f5f6764632e62616d",
              "ad0e523b19164b9af4dda86c90462f6a/6764733a2f2f646576656c6f706d656e742f616e616c797369735f646174612f53424a30303731362f7767735f616c69676e6d656e745f71632f323032323033313262356464616534662f4c323130303735315f5f345f64726167656e2f50524a3231303637382e62616d",
            ],
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
