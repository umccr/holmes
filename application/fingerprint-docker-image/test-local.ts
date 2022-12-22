import { argv } from "process";
import { extract } from "./lib/extract";
import { lambdaHandler as checkLambdaHandler } from "./lambda-entry-check";
import { lambdaHandler as pairsLambdaHandler } from "./lambda-entry-pairs";

const sampleItems = [
  {
    Key: "fingerprints-1kg-small/6764733a2f2f316b672d67656e6f6d65732f65787472612f484730313737372e62616d",
    Size: 0,
    LastModified: 0,
  },
  {
    Key: "fingerprints-1kg-small/6764733a2f2f316b672d67656e6f6d65732f65787472612f484730313737392e62616d",
    Size: 0,
    LastModified: 0,
  },
  {
    Key: "fingerprints-1kg-small/6764733a2f2f316b672d67656e6f6d65732f65787472612f484730313738312e62616d",
    Size: 0,
    LastModified: 0,
  },
  {
    Key: "fingerprints-1kg-small/6764733a2f2f316b672d67656e6f6d65732f65787472612f484730313738392e62616d",
    Size: 0,
    LastModified: 0,
  },
  {
    Key: "fingerprints-1kg-small/6764733a2f2f316b672d67656e6f6d65732f65787472612f484730313739302e62616d",
    Size: 0,
    LastModified: 0,
  },
  {
    Key: "fingerprints-1kg-small/6764733a2f2f316b672d67656e6f6d65732f65787472612f484730313739312e62616d",
    Size: 0,
    LastModified: 0,
  },
  {
    Key: "fingerprints-1kg-small/6764733a2f2f316b672d67656e6f6d65732f65787472612f484730313830352e62616d",
    Size: 0,
    LastModified: 0,
  },
];

(async () => {
  try {
    const lambdaChoice = argv[2];

    switch (lambdaChoice) {
      case "extract":
        await extract("hg19.rna", "fingerprints-temp", [
          "gds://development/analysis_data/SBJ00006/wgs_alignment_qc/20220312be2a88ce/L2100755__1_dragen/NTC_Tsqn210707.bam",
          "gds://development/analysis_data/SBJ00020/wgs_alignment_qc/20220312151bf581/L2100754__1_dragen/PTC_Tsqn210707.bam",
        ]);
        console.log("done extract");
        break;
      case "check":
        const checkResult = await checkLambdaHandler(
          {
            BatchInput: {
              fingerprintFolder: "fingerprints-1kg",
              indexes: [
                "gds://1kg-genomes/extra/NA20790.bam",
                "gds://1kg-genomes/extra/NA20790.bam",
              ],
              relatednessThreshold: 0.5,
            },
            Items: sampleItems,
          },
          {}
        );

        console.log(checkResult);
        break;
      case "pairs":
        const pairsResult = await pairsLambdaHandler(
          {
            fingerprintFolder: "fingerprints-1kg",
            indexes: [
              "gds://1kg-genomes/extra/NA20790.bam",
              "gds://1kg-genomes/extra/NA20790.bam",
            ],
          },
          {}
        );

        console.log(pairsResult);
        break;
      default:
        throw new Error(`Unknown lambda to test ${lambdaChoice}`);
    }
  } catch (e) {
    console.log(e);
  }
})();
