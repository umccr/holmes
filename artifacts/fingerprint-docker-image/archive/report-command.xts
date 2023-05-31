import { findCheckLarge } from "./common";
import { getBamRelatedGraphs } from "./analyse-relatedness-of-bams";
import { alg, Edge, Graph } from "@dagrejs/graphlib";
import { table } from "table";

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
        "ABC",
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
      if (groupIndex >= 52)
        groupNames[groupNode] = String.fromCharCode(
          groupIndex - 52 + startCharacter.charCodeAt(0),
          groupIndex - 52 + startCharacter.charCodeAt(0),
          groupIndex - 52 + startCharacter.charCodeAt(0)
        );
      if (groupIndex >= 26)
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

/**
 * Confirms that all the nodes included here in a group of high
 * relatedness are indeed expected to be related.
 *
 * @param graph the underlying graph of related nodes
 * @param runGroupString run group id assigned in the table for this grouping
 * @param nodeName the starting node name
 * @param edges the rest of the edges in the group
 */
const confirmExpectedRelatedGroup = (
  graph: Graph,
  runGroupString: string,
  nodeName: string,
  edges: Edge[]
) => {
  let allRegex = true;

  // we start at 1 as we match ourselves are we are in the index
  let indexCount = 1;
  // count those that match from the db
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

  // we expect everything in the group to report matching regex, otherwise we are a fail (report elsewhere)
  if (allRegex && edges.length < 3)
    return {
      confirmed: true,
      expectedRelatedFromIndex: indexCount,
      expectedRelatedFromDb: nonIndexCount,
    };
  else {
    return {
      confirmed: false,
    };
  }
};

/**
 * Create a text report of the related graph from a somalier run.
 *
 * @param relatedGraph a graph of relations between named BAM files
 * @param indexNodeNames a list of BAM files that are index cases we are to report on
 * @returns an array of fixed font text to be printed/sent to slack
 */
export function reportRelated(
  relatedGraph: Graph,
  indexNodeNames: string[]
): string[] {
  const indexNodeSet = new Set<string>(indexNodeNames);

  // group everything that is connected (by genomic relatedness)
  const relatedComponents = alg.components(relatedGraph);

  // assign each group a string id (A,B,C... AA, BB, CC... AAA, BBB..)
  const relatedComponentsGroupNames = createGroupNames(relatedComponents, "A");

  // once we've done a group we mark it done
  const relatedComponentGroupChecked = new Array<boolean>(
    relatedComponents.length
  ).fill(false);

  const problemReports: string[] = [];

  let tableData: string[][] = [];

  tableData.push(["Group", "BAM", "ER\n(from run)", "ER\n(from db)"]);

  const spanningCells: {
    col: number;
    row: number;
    colSpan?: number;
    rowSpan?: number;
  }[] = [];

  // display the rows in the table ordered by group
  for (
    let relatedGroupCount = 0;
    relatedGroupCount < relatedComponents.length;
    relatedGroupCount++
  ) {
    // these have the rowspan calculated during the loop (if the group ends up > 1)

    // a spanning cell to make our group names a spanning cell group
    const relatedGroupNameSpanningCell = {
      col: 0,
      row: tableData.length,
      rowSpan: 0,
      colSpan: 1,
    };
    // a spanning cell to make our "expected in index" column a spanning cell group
    const relatedGroupInIndexSpanningCell = {
      col: 2,
      row: tableData.length,
      rowSpan: 0,
      colSpan: 1,
    };
    // a spanning cell to make our "expected in db" column a spanning cell group
    const relatedGroupInDbSpanningCell = {
      col: 3,
      row: tableData.length,
      rowSpan: 0,
      colSpan: 1,
    };

    // loop through everything in the related group, though not all are made into rows in the table
    for (const nodeInRelatedGroup of relatedComponents[relatedGroupCount]) {
      // skip reporting in this table anything not from the index set
      // (they will be reported on in separately if they cause an issue)
      if (!indexNodeSet.has(nodeInRelatedGroup)) continue;

      const relatedGroupName = relatedComponentsGroupNames[nodeInRelatedGroup];

      const relatedEdges = relatedGraph.nodeEdges(nodeInRelatedGroup);

      // our related graph always returns an edge array - albeit possibly an empty one!
      if (!relatedEdges) {
        throw new Error("Invalid related graph");
      }

      let betterUrl = nodeInRelatedGroup;

      /*nodeInRelatedGroup.startsWith(
        "gds://production/analysis_data/"
      )
        ? ".. " + nodeInRelatedGroup.substring(31)
        : nodeInRelatedGroup;
      if (betterUrl.endsWith(".bam")) betterUrl = betterUrl.slice(0, -4); */

      relatedGroupNameSpanningCell.rowSpan++;
      relatedGroupInIndexSpanningCell.rowSpan++;
      relatedGroupInDbSpanningCell.rowSpan++;

      if (!relatedComponentGroupChecked[relatedGroupCount]) {
        // check the status of the group
        const confirmation = confirmExpectedRelatedGroup(
          relatedGraph,
          relatedGroupName,
          nodeInRelatedGroup,
          relatedEdges
        );

        relatedComponentGroupChecked[relatedGroupCount] = true;

        if (confirmation.confirmed) {
          tableData.push([
            relatedGroupName,
            betterUrl,
            `${confirmation.expectedRelatedFromIndex}`,
            `${confirmation.expectedRelatedFromDb}`,
          ]);
        } else {
          tableData.push([
            relatedGroupName,
            betterUrl,
            `x (see group\nreport ${relatedGroupName}`,
            "",
          ]);
          relatedGroupInIndexSpanningCell.colSpan = 2;

          problemReports.push(
            renderGroupAsFixedFontString(
              relatedGraph,
              relatedGroupName,
              relatedComponents[relatedGroupCount]
            )
          );
        }
      } else {
        tableData.push([relatedGroupName, betterUrl, "", ""]);
      }
    }

    if (relatedGroupNameSpanningCell.rowSpan > 1)
      spanningCells.push(relatedGroupNameSpanningCell);

    if (relatedGroupInIndexSpanningCell.rowSpan > 1)
      spanningCells.push(relatedGroupInIndexSpanningCell);

    // we only need to put the "in db" spanning cell in *if the row is not reporting an error*
    // (otherwise we will have made a two column spanning "in index" cell)
    if (
      relatedGroupInDbSpanningCell.rowSpan > 1 &&
      relatedGroupInIndexSpanningCell.colSpan === 1
    )
      spanningCells.push(relatedGroupInDbSpanningCell);
  }

  return [
    table(tableData, {
      header: {
        alignment: "center",
        content: "Fingerprint Expected Related Report",
      },
      columns: [
        { alignment: "left" },
        { alignment: "left", width: 120 },
        { alignment: "center" },
        { alignment: "center" },
      ],
      spanningCells: spanningCells,
    }),
    ...problemReports,
  ];

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

  /*const expectedUnrelatedSubjectIds: string[] = [];

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

  console.log(JSON.stringify(expectedUnrelatedSubjectIds)); */
}

export function renderGroupAsFixedFontString(
  g: Graph,
  groupNamePrefix: string,
  nodes: string[]
) {
  let text = "";

  const nodesAsHeaders = nodes.map((n, i) => `${groupNamePrefix}${i}`);

  const tableData: string[][] = [];

  for (let row = 0; row < nodes.length; row++) {
    const rowVals: string[] = [];

    rowVals.push(`${groupNamePrefix}${row}`);

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

    tableData.push(rowVals);
  }

  text += table(tableData);

  for (let row = 0; row < nodes.length; row++)
    text += `  ${groupNamePrefix}${row} = ${nodes[row]}\n`;

  text += "\n";

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
