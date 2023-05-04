import { findCheckLarge } from "./common";
import { getBamRelatedGraphs } from "./analyse-relatedness-of-bams";
import { alg, Edge, Graph } from "@dagrejs/graphlib";
import { AsciiTable3, AlignmentEnum } from "ascii-table3";

/**
 * A command to print to slack *all* relationship information about a set of BAMs.
 *
 * @param fingerprintFolder the folder (key with trailing slash) that has the actual fingerprints
 * @param slackSend a method for sending messages to Slack
 * @param urls
 */
export async function reportCommand(
  fingerprintFolder: string,
  slackSend: (slackMessage: any) => Promise<void>,
  urls: string[]
) {
  // any error that we experience from here will be logged to Slack
  try {
    // service discover the steps bits of holmes
    const checkLargeStepsArn = await findCheckLarge();

    const { relatedGraph } = await getBamRelatedGraphs(
      checkLargeStepsArn,
      fingerprintFolder,
      urls,
      -100000,
      new RegExp(/^\\b$/)
    );

    await slackSend({
      text: renderGroupAsFixedFontString(
        relatedGraph,
        relatedGraph.nodes().sort()
      ),
    });
  } catch (error: any) {
    // log to cloudwatch too
    console.log(error);

    await slackSend({
      text: error.toString(),
    });
  }
}

function createGroupNames(
  components: string[][],
  startCharacter: string
): Record<string, string> {
  const groupNames: Record<string, string> = {};
  let groupIndex = 0;

  for (const group of components) {
    for (const groupNode of group) {
      if (groupIndex > 25)
        groupNames[groupNode] = String.fromCharCode(
          groupIndex - 26 + startCharacter.charCodeAt(0),
          groupIndex - 26 + startCharacter.charCodeAt(0)
        );
      else
        groupNames[groupNode] = String.fromCharCode(
          groupIndex + startCharacter.charCodeAt(0)
        );
    }

    groupIndex++;
  }

  return groupNames;
}

export function reportRelated(
  relatedGraph: Graph,
  unrelatedGraph: Graph,
  indexGraph: Graph
) {
  const rowNames = indexGraph.nodes().sort();

  const relatedComponents = alg.components(relatedGraph);

  const rowRelatedGroups = createGroupNames(relatedComponents, "A");

  const unrelatedComponents = alg.components(unrelatedGraph);

  const rowUnrelatedGroups = createGroupNames(unrelatedComponents, "a");

  const confirmSubjectGroup = (
    graph: Graph,
    nodeName: string,
    edges: Edge[]
  ) => {
    let allRegex = true;

    let indexCount = 0;
    let nonIndexCount = 0;

    for (const e of edges || []) {
      let otherNode;
      // find the node at the other end of the edge
      if (e.v === nodeName) otherNode = graph.node(e.w);
      else if (e.w === nodeName) otherNode = graph.node(e.v);
      else
        throw new Error(
          "Ended in state where one of the edge nodes was not in the graph"
        );

      if (otherNode === "index") indexCount++;
      else nonIndexCount++;

      const edgeData = graph.edge(e);
      if (!(edgeData as any).regexRelated) allRegex = false;
    }
    if (allRegex) return `✅ ${indexCount}/${nonIndexCount}`;
    else return `❌`;
  };

  {
    let table = new AsciiTable3()
      .setTitle("Fingerprint Base Report")
      .setStyle("unicode-single")
      .setHeading("RG", "UG", "URL", "Related", "Unrelated");

    for (const r of rowNames) {
      const relatedEdgeCount = relatedGraph.nodeEdges(r);
      const unrelatedEdgeCount = unrelatedGraph.nodeEdges(r);

      let betterUrl = r.startsWith("gds://production/analysis_data/")
        ? ".. " + r.substring(31)
        : r;
      if (betterUrl.endsWith(".bam")) betterUrl = betterUrl.slice(0, -4);

      if (!relatedEdgeCount || !unrelatedEdgeCount) {
        table.addRow(betterUrl, "Error", "Error");
        continue;
      }

      table.addRow(
        rowRelatedGroups[r],
        rowUnrelatedGroups[r],
        betterUrl,
        confirmSubjectGroup(relatedGraph, r, relatedEdgeCount),
        (unrelatedEdgeCount || []).length === 0 ? "✅" : "❌"
      );
    }

    console.log(table.toString());
  }

  /* for (const ur of missingSomalierConnected) {
    if (ur.length > 1) {
      for (const r of ur.slice(1)) {
        const edge = unrelatedGraph.edge(ur[0], r);
        console.log(edge);
        console.log({
          from: ur[0],
          to: r,
        });
      }
    }
  } */

  const expectedUnrelatedSubjectIds: string[] = [];

  for (const ur of alg.components(relatedGraph)) {
    if (ur.length === 0) {
      throw new Error("Wierd..");
    }
    if (ur.length === 1) {
      expectedUnrelatedSubjectIds.push(ur[0]);
    }
    if (ur.length > 1) {
      let allRegex = true;
      for (const r of ur.slice(1)) {
        const edge = relatedGraph.edge(ur[0], r);
        if (!edge.regexRelated) allRegex = false;
      }

      if (allRegex)
        console.log(`Group ${ur[0]} was all good with size ${ur.length}`);
      else {
        console.log(JSON.stringify(ur));
      }
    }
  }

  console.log(JSON.stringify(expectedUnrelatedSubjectIds));
}

export function renderGroupAsFixedFontString(g: Graph, nodes: string[]) {
  let text = "```\n";

  for (let row = 0; row < nodes.length; row++)
    text += `${row} = ${nodes[row]}\n`;

  text += "\n";

  const nodesAsHeaders = nodes.map((n, i) => i.toString());

  let table = new AsciiTable3()
    .setTitle("Fingerprint Report")
    .setStyle("unicode-single")
    .setHeading("", ...nodesAsHeaders);

  for (let row = 0; row < nodes.length; row++) {
    const rowVals: string[] = [];

    rowVals.push(row.toString());

    for (let col = 0; col < nodes.length; col++) {
      if (row === col) {
        rowVals.push("-");
        continue;
      }

      const edge = g.edge(nodes[row], nodes[col]);

      if (!edge) continue;

      if (edge.relatedness && edge.unrelatedness) rowVals.push("!!!");
      else if (edge.relatedness)
        rowVals.push(`n=${edge.n}/r=${edge.relatedness}`);
      else if (edge.unrelatedness)
        rowVals.push(`n=${edge.n}/r=${edge.unrelatedness}`);
      else rowVals.push("");
    }

    table = table.addRow(...rowVals);
  }

  text += table.toString();

  text += "```\n";

  return text;
}

export function renderGroupAsMarkdown(g: Graph, nodes: string[]) {
  const vals: string[][] = [];

  for (let i = 0; i < nodes.length; i++) {
    vals[i] = Array.from("".repeat(nodes.length));

    for (let j = 0; j < nodes.length; j++) {
      if (i == j) {
        vals[i][j] = "-";
        continue;
      }

      const edge = g.edge(nodes[i], nodes[j]);

      if (edge.relatedness && edge.unrelatedness) vals[i][j] = "!!!";
      else if (edge.relatedness)
        vals[i][j] = `n=${edge.n}/r=${edge.relatedness}`;
      else if (edge.unrelatedness)
        vals[i][j] = `n=${edge.n}/r=${edge.unrelatedness}❗`;
      else vals[i][j] = " ";
    }
  }

  let md = "";

  for (let i = 0; i < nodes.length; i++) {
    md += `${i} = \`${nodes[i]}\`\n\n`;
  }

  // column headers
  md += "|  | ";
  for (let col = 0; col < nodes.length; col++) {
    md += ` ${col} |`;
  }
  md += "\n";

  // markdown header/body separator
  md += "| ---  | ";
  for (let col = 0; col < nodes.length; col++) {
    md += ` --- |`;
  }
  md += "\n";

  for (let row = 0; row < nodes.length; row++) {
    md += `| ${row} | `;
    for (let col = 0; col < nodes.length; col++) {
      md += ` ${vals[row][col]} |`;
    }
    md += "\n";
  }

  return md;
}
