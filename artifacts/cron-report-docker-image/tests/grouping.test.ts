import {
  distributedMapManifestToLambdaResults,
  getBamRelatedGraphs,
  getBamRelatedGraphsFromExistingMapRun,
  getBamRelatedGraphsFromSuccessFile,
  lambdaResultsToGraph,
} from "../lib/analyse-relatedness-of-bams";
import { findCheckLarge, getSlackWebClient } from "../lib/common";
import {
  renderGroupAsFixedFontString,
  reportCommand,
  reportRelated,
} from "../lib/report-command";
import { join } from "node:path";
import { readFile } from "fs/promises";
import { sl } from "date-fns/locale";

describe("Run grouping algorithm", () => {
  beforeAll(async () => {});
  afterAll(async () => {});

  xit("should create and return an object of ingredient details", async () => {
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
  });

  xit("test a complete report on a family", async () => {
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
  });

  it("do something", async () => {
    const web = await getSlackWebClient();

    // we are setting up to allow Slack commands - so we want the ability to alter this
    // channel per request
    // for the EventBridge cron lambda however we just do a regular Post
    const slackSend = async (slackMessage: any) => {
      slackMessage["channel"] = "U029NVAK56W";
      //await web.chat.postMessage(slackMessage);
      await web.files.upload({});
    };

    const csvUpload = async (csvContent: string) => {
      await web.files.upload({
        channels: "U029NVAK56W",
        content: csvContent,
        filetype: "text",
        title: "Fingerprint Report",
      });
    };

    const succeededContent = await readFile(
      join(__dirname, "SUCCEEDED_0.json"),
      "utf8"
    );

    const { relatedGraph, missingRelatedGraph, indexOnlyRelatedGraph } =
      await getBamRelatedGraphsFromSuccessFile(JSON.parse(succeededContent));

    const reports = reportRelated(
      relatedGraph,
      indexOnlyRelatedGraph.nodes().sort()
    );

    await csvUpload(reports.join("\n\n"));

    /*    for (const r of reports) {
      await csvUpload(r);
      break;


    } */
  });

  xit("complete report from prod", async () => {
    const web = await getSlackWebClient();

    // we are setting up to allow Slack commands - so we want the ability to alter this
    // channel per request
    // for the EventBridge cron lambda however we just do a regular Post
    const slackSend = async (slackMessage: any) => {
      slackMessage["channel"] = "U029NVAK56W";
      await web.chat.postMessage(slackMessage);
    };

    const { relatedGraph, missingRelatedGraph, indexOnlyRelatedGraph } =
      await getBamRelatedGraphsFromExistingMapRun(
        //"umccr-fingerprint-local-dev-test",
        // "check-large-result-examples/prod-march-22-2023/manifest.json"
        "umccr-fingerprint-prod",
        "temp/c71a16a3-2f31-30b2-99dc-a45303b6a671/manifest.json"
      );

    reportRelated(relatedGraph, indexOnlyRelatedGraph.nodes().sort());

    return;

    /* await slackSend({
      text: reportRelated(
        relatedGraph,
        relatedGraph.nodes().sort()
      ),
    }); */
  });

  xit("dor eal", async () => {
    const lambdaResults = await distributedMapManifestToLambdaResults(
      "umccr-fingerprint-local-dev-test",
      "check-large-result-examples/prod-april-9-2023/manifest.json"
    );

    await lambdaResultsToGraph(lambdaResults);
  });
});