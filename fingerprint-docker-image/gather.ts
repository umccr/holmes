import axios from "axios";

type EventInput = {
  portalUrl: string;
  portalBearer: string;
  index: string;
  relatednessThreshold: number;
  chunkSize: number;
};

const chunk = (arr: any[], size: number) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_: any, i: number) =>
    arr.slice(i * size, i * size + size)
  );

export const lambdaHandler = async (ev: EventInput, context: any) => {
  // do a (portal) search for all the files in the GDS that are somalier files
  const d = await axios
    .get(`${ev.portalUrl}/gds?rowsPerPage=1000&search=.bam`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ev.portalBearer}`,
      },
    })
    .then((res) => {
      const headerDate =
        res.headers && res.headers.date ? res.headers.date : "no response date";
      console.log("Status Code:", res.status);
      console.log("Date in Response header:", headerDate);

      return res.data;
    });

  // make a set of all the files in GDS as GDS urls
  const allSet = new Set<string>();

  for (const item of d?.results || []) {
    const gdsPath = `gds://${item.volume_name}${item.path}`;

    // the results *should* be unique paths but let's make sure of that
    allSet.add(gdsPath);
  }

  const allArray = Array.from(allSet.values());

  // chunk these files up into blocks suitable for lambdas and send onto next stage
  return {
    index: ev.index,
    relatednessThreshold: ev.relatednessThreshold,
    fingerprintTasks: chunk(allArray, ev.chunkSize),
  };
};
