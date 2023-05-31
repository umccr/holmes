import { join } from "node:path";
import { readFile } from "fs/promises";
import { distributedMapSuccessJsonToLambdaResults } from "../lib/distributed-map";
import { reportCheck } from "../lib/report-check";

describe("Run grouping algorithm", () => {
  beforeAll(async () => {});
  afterAll(async () => {});

  /*  xit("should create and return an object of ingredient details", async () => {
    await getBamRelatedGraphs(
      await findCheckLarge(),
      "fingerprints-test-0738ddc42faaae1073499221c8f629649c6ae76a/",
      [
        "gds://development/test-data/holmes-test-data/individual/HG00099.bam",
        "gds://development/test-data/holmes-test-data/family/giab_exome_trio/HG003-ready.bam",
        "gds://development/test-data/holmes-test-data/ctdna/PTC_ctTSO220404_L2200417.bam",
      ],
      0.4,
      new RegExp("^.*(family).*$")
    );
  });

  xit("test a complete report on a family", async () => {
    const { relatedGraph, missingRelatedGraph } = await getBamRelatedGraphs(
      await findCheckLarge(),
      "fingerprints-test-0738ddc42faaae1073499221c8f629649c6ae76a/",
      [
        "gds://development/test-data/holmes-test-data/family/giab_exome_trio/HG002-ready.bam",
        "gds://development/test-data/holmes-test-data/family/giab_exome_trio/HG003-ready.bam",
        "gds://development/test-data/holmes-test-data/family/giab_exome_trio/HG004-ready.bam",
      ],
      0.4,
      new RegExp("^\\b$")
    );
  }); */

  /*xit("test a complete report on a family", async () => {
    const web = await getSlackWebClient();

    // we are setting up to allow Slack commands - so we want the ability to alter this
    // channel per request
    // for the EventBridge cron lambda however we just do a regular Post
    const slackSend = async (slackMessage: any) => {
      slackMessage["channel"] = "U029NVAK56W";
      await web.chat.postMessage(slackMessage);
    };

    await reportCommand(
      "fingerprints-test-0738ddc42faaae1073499221c8f629649c6ae76a/",
      slackSend,
      [
        "gds://development/test-data/holmes-test-data/family/giab_exome_trio/HG002-ready.bam",
        "gds://development/test-data/holmes-test-data/family/giab_exome_trio/HG003-ready.bam",
        "gds://development/test-data/holmes-test-data/family/giab_exome_trio/HG004-ready.bam",
        "gds://development/test-data/holmes-test-data/individual/HG00099.bam",
      ]
    );
  }); */

  xit("do something", async () => {
    const succeededContent = JSON.parse(
      await readFile(
        join(__dirname, "UNEXPECTED_RELATED_SUCCEEDED_0.json"),
        "utf8"
      )
    );

    const r = distributedMapSuccessJsonToLambdaResults(succeededContent);

    const report = await reportCheck(r);

    console.debug(report);

    //const { relatedGraph, missingRelatedGraph, indexOnlyRelatedGraph } =
    //  await getBamRelatedGraphsFromSuccessFile(JSON.parse(succeededContent));

    //const reports = reportRelated(
    //  relatedGraph,
    //  indexOnlyRelatedGraph.nodes().sort()
    //);
  });
});
