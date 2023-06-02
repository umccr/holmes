import { alg, Graph } from "@dagrejs/graphlib";

export async function lambdaResultsToGraph(
  lambdaResults: Record<string, any[]>[]
) {
  if (false) {
    for (const o of lambdaResults) {
      for (const [p, a] of Object.entries(o)) {
        if (a.length > 0)
          for (const m of a) {
            if (p !== m.file) console.debug(JSON.stringify(a));
          }
      }
    }
  }

  // a graph of all the BAMs - and their relationships
  let somalierRelationshipGraph = new Graph({
    directed: false,
    multigraph: false,
    compound: false,
  });

  let missingSomalierRelationshipGraph = new Graph({
    directed: false,
    multigraph: false,
    compound: false,
  });

  let combinedRelationshipGraph = new Graph({
    directed: false,
    multigraph: false,
    compound: false,
  });

  let indexOnlyRelationshipGraph = new Graph({
    directed: false,
    multigraph: false,
    compound: false,
  });

  // first step is to construct all the index nodes - we want to make sure these all
  // exist as "index" nodes before we start trying to join things up
  for (const lambdaJson of lambdaResults) {
    for (const [indexBamUrl, relatedArray] of Object.entries(lambdaJson)) {
      if (!somalierRelationshipGraph.hasNode(indexBamUrl)) {
        somalierRelationshipGraph.setNode(indexBamUrl, "index");
      }
      if (!missingSomalierRelationshipGraph.hasNode(indexBamUrl)) {
        missingSomalierRelationshipGraph.setNode(indexBamUrl, "index");
      }
      if (!combinedRelationshipGraph.hasNode(indexBamUrl)) {
        combinedRelationshipGraph.setNode(indexBamUrl, "index");
      }
      if (!indexOnlyRelationshipGraph.hasNode(indexBamUrl)) {
        indexOnlyRelationshipGraph.setNode(indexBamUrl, "index");
      }
    }
  }

  // now we join up all the nodes
  for (const lambdaJson of lambdaResults) {
    for (const [indexBamUrl, relatedArray] of Object.entries(lambdaJson)) {
      for (const relatedBam of relatedArray || []) {
        // we now have an assertion of a relation between the index BAM and the related BAM
        const relatedBamUrl = relatedBam.file;

        // there is no need for us to add in our assertions of relation to self
        // (these were just generated in the lambda so we know the base somalier is working)
        if (indexBamUrl == relatedBamUrl) continue;

        // make sure the related BAM exists as a node - as we are making these on demand
        if (!somalierRelationshipGraph.hasNode(relatedBamUrl)) {
          somalierRelationshipGraph.setNode(relatedBamUrl, "not-index");
        }
        if (!somalierRelationshipGraph.hasNode(relatedBamUrl)) {
          missingSomalierRelationshipGraph.setNode(relatedBamUrl, "not-index");
        }
        if (!combinedRelationshipGraph.hasNode(relatedBamUrl)) {
          combinedRelationshipGraph.setNode(relatedBamUrl, "not-index");
        }

        const relatedData: any = { ...relatedBam };
        delete relatedData.file;

        if (relatedData.type === "ExpectedRelated") {
          somalierRelationshipGraph.setEdge(
            indexBamUrl,
            relatedBamUrl,
            relatedData
          );
          combinedRelationshipGraph.setEdge(
            indexBamUrl,
            relatedBamUrl,
            relatedData
          );
        } else if (relatedData.type == "ExpectedUnrelated") {
          missingSomalierRelationshipGraph.setEdge(
            indexBamUrl,
            relatedBamUrl,
            relatedData
          );
          combinedRelationshipGraph.setEdge(
            indexBamUrl,
            relatedBamUrl,
            relatedData
          );
        } else {
          console.error(
            "Received a Holmes result that was neither related not unrelated"
          );
          console.error(JSON.stringify(relatedData, null, 2));
        }

        // if the destination node doesn't exist - that means it is not an index node
        // so we continue
        if (!indexOnlyRelationshipGraph.hasNode(relatedBamUrl)) continue;

        // this graph only has index nodes - but it should contain all types of relationships
        indexOnlyRelationshipGraph.setEdge(
          indexBamUrl,
          relatedBamUrl,
          relatedData
        );
      }
    }
  }

  return {
    relatedGraph: somalierRelationshipGraph,
    missingRelatedGraph: missingSomalierRelationshipGraph,
    combinedRelatedGraph: combinedRelationshipGraph,
    indexOnlyRelatedGraph: indexOnlyRelationshipGraph,
  };
}
