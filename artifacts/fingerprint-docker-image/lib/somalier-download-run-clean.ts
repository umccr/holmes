import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { fingerprintBucketName, somalierBinary, somalierWork } from "./env";
import { streamToBuffer } from "./misc";
import { createWriteStream } from "fs";
import { pipeline as pipelineCallback, Readable } from "stream";
import { promisify } from "util";
import { readdir, readFile, unlink } from "fs/promises";
import { exec as execCallback } from "child_process";

// get this functionality as promise compatible function
const pipeline = promisify(pipelineCallback);
const exec = promisify(execCallback);

/**
 * Fetches a fingerprint (somalier) object from an object store and saves it to local
 * working directory. Along the way fixes the file so its somalier id is the left padded
 * 'count' (up to the previous sample id size).
 *
 * @param fingerprintKey the key in our fingerprint bucket of the fingerprint file to download
 * @param count the count used to generate a new id
 * @return the sample id we generated matching the count
 *
 * NOTE so somalier itself relies too heavily on the sample ids *inside* the fingerprint
 * files. This has two problems
 * (1) they might be wrong/set incorrectly on creation and we can't fix
 * (2) where they are identical - the output of somalier won't let us distinguish between two samples
 *     with the same id (i.e. we can't tell which BAM was which)
 * Which when the job of this is to detect incorrectly labelled samples - is a problem. So we
 * do some magic here to replace the inbuilt fingerprint sample ids with our own 'per run'
 * sample ids - and then match back to the original BAM.
 */
export async function downloadAndCorrectFingerprint(
  fingerprintKey: string,
  count: number
): Promise<string> {
  const s3Client = new S3Client({});

  let fileBuffer: Buffer | null = null;

  const data = await s3Client.send(
    new GetObjectCommand({
      Bucket: fingerprintBucketName,
      Key: fingerprintKey,
    })
  );

  fileBuffer = await streamToBuffer(data.Body);

  // check the file version matches what we expect
  const ver = fileBuffer.readInt8(0);
  if (ver !== 2)
    throw new Error(
      "Our fingerprint service is designed to only work with Somalier V2 fingerprint files"
    );

  // find out how much sample id space we have for our replacement sample ids
  const sampleIdLength = fileBuffer.readInt8(1);

  if (sampleIdLength < 2)
    throw new Error(
      "Due to the way we replace sample ids in Somalier we require all sample ids to be at least 2 characters for fingerprinting"
    );

  const newSampleId = count.toString().padStart(sampleIdLength, "0");
  fileBuffer.fill(newSampleId, 2, 2 + sampleIdLength);

  // now stream the buffer we have edited out to disk
  let writeStream = createWriteStream(
    `${somalierWork}/${newSampleId}.somalier`
  );
  await pipeline(Readable.from(fileBuffer), writeStream);

  // let the caller know what sample id we ended up generating for matching back to the original BAM
  return newSampleId;
}

/**
 * Runs somalier relate on all .somalier files in the current directory
 * and return all the somalier artifacts as text
 * (either TSV or HTML).
 * Also outputs them to stdout and stderr output for debug purposes.
 */
export async function runSomalierRelate() {
  // do a somalier relate run on everything we have downloaded
  const { stdout, stderr } = await exec(`${somalierBinary} relate *.somalier`, {
    env: {
      // somalier will keep pairs of very low relatedness out of the output - but for our use cases we mind as well
      // always include all output and use our own thresholds
      SOMALIER_REPORT_ALL_PAIRS: "1",
    },
  });

  if (stdout) {
    stdout.split("\n").forEach((l) => console.log(`stdout ${l}`));
  }
  if (stderr) {
    stderr.split("\n").forEach((l) => console.log(`stderr ${l}`));
  }

  const samples = await readFile("somalier.samples.tsv", "utf8");
  const pairs = await readFile("somalier.pairs.tsv", "utf8");

  // not useful
  //const groups = await readFile("somalier.groups.tsv");
  //if (groups) {
  //  groups
  //      .toString()
  //      .split("\n")
  //      .forEach((l) => console.log(`groups ${l}`));
  //}

  // this is some pure debug that ends up in cloudwatch - for if we do want to actually investigate more
  if (samples) {
    samples.split("\n").forEach((l) => console.log(`samples ${l}`));
  }
  if (pairs) {
    pairs.split("\n").forEach((l) => console.log(`pairs ${l}`));
  }

  return {
    samplesTsv: samples,
    pairsTsv: pairs,
    html: await readFile("somalier.html", "utf-8"),
  };
}

/**
 * Remove (our broad guess) at any files that were used for input/output of the
 * somalier process. This is a ultra cautious step in case our Lambda is re-used
 * many many times and /tmp fills (possibly overly cautious!). Also we like to
 * use *.somalier for our actual exec of somalier - and we don't want it picking
 * up extraneous left over files from previous runs.
 */
export async function cleanSomalierFiles() {
  const allTmpFiles = await readdir(".", { withFileTypes: true });

  let somalierFingerprintRegex = /[.]somalier$/;
  let somalierOutputRegex = /somalier.*tsv$/;

  for (const d of allTmpFiles) {
    if (
      somalierFingerprintRegex.test(d.name) ||
      somalierOutputRegex.test(d.name)
    ) {
      console.log(`Removing ${d.name} from working directory`);

      await unlink(d.name);
    }
  }
}

// 2022-12-20T05:34:07.103Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	stderr OpenBLAS WARNING - could not determine the L2 cache size on this system, assuming 256k
// 2022-12-20T05:34:07.103Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	stderr somalier version: 0.2.16
// 2022-12-20T05:34:07.103Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	stderr [somalier] starting read of 12 samples
// 2022-12-20T05:34:07.103Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	stderr [somalier] time to read files and get per-sample stats for 12 samples: 0.01
// 2022-12-20T05:34:07.103Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	stderr [somalier] time to get expected relatedness from pedigree graph: 0.00
// 2022-12-20T05:34:07.103Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	stderr [somalier] time to calculate all vs all relatedness for all 66 combinations: 0.00
// 2022-12-20T05:34:07.103Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	stderr [somalier] wrote interactive HTML output for 66 pairs to: somalier.html
// 2022-12-20T05:34:07.103Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	stderr [somalier] wrote groups to: somalier.groups.tsv (look at this for cancer samples)
// 2022-12-20T05:34:07.103Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	stderr [somalier] wrote samples to: somalier.samples.tsv
// 2022-12-20T05:34:07.103Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	stderr [somalier] wrote pair-wise relatedness metrics to: somalier.pairs.tsv
// 2022-12-20T05:34:07.103Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	stderr
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	samples #family_id	sample_id	paternal_id	maternal_id	sex	phenotype	original_pedigree_sex	gt_depth_mean	gt_depth_sd	depth_mean	depth_sd	ab_mean	ab_std	n_hom_ref	n_het	n_hom_alt	n_unknown	p_middling_ab	X_depth_mean	X_n	X_hom_ref	X_het	X_hom_alt	Y_depth_mean	Y_n
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	samples 0000000	0000000	-9	-9	-9	-9	-9	35.0	6.6	33.3	9.9	0.53	0.39	4444	6583	5376	981	0.001	27.55	297	93	93	111	0.00	0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	samples 0000001	0000001	-9	-9	-9	-9	-9	35.1	7.1	33.4	10.2	0.53	0.39	4443	6433	5507	1001	0.001	17.38	333	154	0	179	0.00	0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	samples 0000002	0000002	-9	-9	-9	-9	-9	33.9	6.5	32.3	9.6	0.53	0.39	4549	6290	5455	1090	0.007	16.96	330	160	0	170	0.00	0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	samples 0000003	0000003	-9	-9	-9	-9	-9	30.7	6.0	29.2	8.8	0.53	0.40	4566	6184	5548	1086	0.003	15.38	333	164	0	169	0.00	0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	samples 0000004	0000004	-9	-9	-9	-9	-9	33.9	6.3	32.3	9.5	0.53	0.40	4511	6157	5664	1052	0.005	32.33	328	95	115	118	0.00	0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	samples 0000005	0000005	-9	-9	-9	-9	-9	35.3	6.2	33.7	9.7	0.53	0.39	4471	6333	5568	1012	0.003	33.56	331	93	105	133	0.00	0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	samples 0000006	0000006	-9	-9	-9	-9	-9	36.2	7.0	34.5	10.3	0.53	0.39	4416	6442	5525	1001	0.003	33.91	331	93	124	114	0.00	0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	samples 0000007	0000007	-9	-9	-9	-9	-9	34.1	6.3	32.5	9.5	0.53	0.40	4525	6130	5664	1065	0.006	32.38	330	82	129	119	0.00	0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	samples 0000008	0000008	-9	-9	-9	-9	-9	33.2	6.5	31.7	9.5	0.53	0.39	4500	6327	5551	1006	0.001	16.13	330	163	0	167	0.00	0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	samples 0000009	0000009	-9	-9	-9	-9	-9	30.6	6.1	29.2	8.9	0.53	0.39	4417	6393	5490	1084	0.003	28.83	329	100	115	114	0.00	0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	samples 0000010	0000010	-9	-9	-9	-9	-9	28.5	5.8	27.1	8.3	0.53	0.39	4393	6240	5523	1228	0.007	13.96	319	143	0	176	0.00	0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	samples 0000011	0000011	-9	-9	-9	-9	-9	33.5	6.0	32.0	9.2	0.53	0.40	4687	5946	5723	1028	0.003	31.99	328	97	107	124	0.00	0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	samples
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs #sample_a	sample_b	relatedness	ibs0	ibs2	hom_concordance	hets_a	hets_b	hets_ab	shared_hets	hom_alts_a	hom_alts_b	shared_hom_alts	n	x_ibs0	x_ibs2	expected_relatedness
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000000	0000001	-0.008	1364	7328	-0.000	6583	6433	12893	2678	5376	5507	2727	16229	59	144	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000000	0000002	-0.115	1699	7068	-0.162	6583	6290	12707	2666	5376	5455	2526	16142	78	124	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000000	0000003	-0.111	1598	6942	-0.120	6583	6184	12597	2497	5376	5548	2550	16143	59	145	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000000	0000004	-0.132	1687	6980	-0.145	6583	6157	12596	2542	5376	5664	2594	16179	32	136	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000000	0000005	-0.107	1651	7019	-0.137	6583	6333	12781	2616	5376	5568	2563	16219	35	138	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000000	0000006	-0.080	1583	7056	-0.116	6583	6442	12884	2648	5376	5525	2542	16227	34	137	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000000	0000007	-0.104	1601	7090	-0.102	6583	6130	12572	2548	5376	5664	2654	16167	30	127	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000000	0000008	-0.104	1606	6944	-0.129	6583	6327	12773	2550	5376	5551	2519	16223	62	141	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000000	0000009	-0.082	1623	7161	-0.127	6583	6393	12805	2722	5376	5490	2561	16145	46	122	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000000	0000010	-0.097	1586	6934	-0.120	6583	6240	12604	2559	5376	5523	2525	16006	65	130	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000000	0000011	-0.169	1720	6888	-0.161	6583	5946	12378	2392	5376	5723	2576	16202	27	136	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000001	0000002	-0.133	1655	6867	-0.147	6433	6290	12547	2473	5507	5455	2510	16123	125	204	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000001	0000003	-0.127	1616	6932	-0.119	6433	6184	12460	2441	5507	5548	2576	16126	134	198	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000001	0000004	-0.168	1754	6922	-0.167	6433	6157	12418	2466	5507	5664	2586	16162	81	131	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000001	0000005	-0.143	1720	6924	-0.162	6433	6333	12636	2538	5507	5568	2549	16204	75	150	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000001	0000006	-0.099	1621	7060	-0.119	6433	6442	12755	2613	5507	5525	2588	16210	78	128	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000001	0000007	-0.132	1651	7056	-0.122	6433	6130	12399	2481	5507	5664	2630	16144	76	125	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000001	0000008	-0.105	1598	7060	-0.111	6433	6327	12614	2533	5507	5551	2584	16206	142	187	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000001	0000009	-0.117	1646	6935	-0.136	6433	6393	12652	2551	5507	5490	2545	16131	93	120	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000001	0000010	-0.117	1613	6915	-0.122	6433	6240	12450	2497	5507	5523	2553	15984	141	177	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000001	0000011	-0.198	1783	6882	-0.175	6433	5946	12228	2354	5507	5723	2601	16185	90	130	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000002	0000003	-0.037	1380	7451	0.006	6290	6184	12272	2531	5455	5548	2791	16041	117	212	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000002	0000004	-0.046	1393	7454	0.013	6290	6157	12231	2502	5455	5664	2855	16074	55	155	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000002	0000005	-0.022	1353	7438	0.012	6290	6333	12450	2566	5455	5568	2769	16109	75	149	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000002	0000006	-0.004	1305	7425	0.032	6290	6442	12555	2582	5455	5525	2786	16121	51	153	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000002	0000007	-0.036	1362	7488	0.017	6290	6130	12218	2505	5455	5664	2819	16058	64	135	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000002	0000008	-0.028	1413	7570	-0.004	6290	6327	12440	2653	5455	5551	2805	16117	116	210	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000002	0000009	-0.032	1402	7387	-0.014	6290	6393	12461	2606	5455	5490	2725	16038	63	148	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000002	0000010	-0.041	1414	7373	-0.014	6290	6240	12260	2574	5455	5523	2752	15899	122	193	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000002	0000011	-0.071	1435	7500	-0.002	6290	5946	12047	2442	5455	5723	2857	16098	79	138	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000003	0000004	-0.086	1512	7434	-0.038	6184	6157	12136	2502	5548	5664	2813	16078	60	152	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000003	0000005	-0.074	1481	7295	-0.043	6184	6333	12350	2506	5548	5568	2724	16114	66	159	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000003	0000006	-0.017	1355	7529	0.019	6184	6442	12448	2603	5548	5525	2813	16126	45	162	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000003	0000007	-0.066	1427	7438	0.004	6184	6130	12112	2456	5548	5664	2874	16065	45	156	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000003	0000008	-0.027	1334	7467	0.030	6184	6327	12323	2501	5548	5551	2835	16122	113	216	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000003	0000009	-0.049	1425	7338	-0.022	6184	6393	12369	2544	5548	5490	2727	16044	54	160	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000003	0000010	-0.053	1390	7251	-0.004	6184	6240	12178	2457	5548	5523	2760	15905	119	200	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000003	0000011	-0.117	1535	7366	-0.041	6184	5946	11945	2372	5548	5723	2842	16102	59	162	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000004	0000005	-0.047	1429	7533	0.004	6157	6333	12328	2570	5664	5568	2879	16150	39	154	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000004	0000006	-0.040	1406	7452	0.005	6157	6442	12429	2565	5664	5525	2842	16157	20	164	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000004	0000007	-0.100	1500	7279	-0.023	6157	6130	12104	2395	5664	5664	2871	16093	30	160	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000004	0000008	-0.056	1469	7547	-0.011	6157	6327	12324	2592	5664	5551	2877	16156	66	145	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000004	0000009	-0.031	1378	7449	0.019	6157	6393	12383	2566	5664	5490	2861	16078	36	158	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000004	0000010	-0.061	1421	7309	-0.002	6157	6240	12146	2469	5664	5523	2831	15938	60	145	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000004	0000011	-0.130	1559	7334	-0.043	6157	5946	11932	2345	5664	5723	2872	16135	35	144	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000005	0000006	-0.015	1357	7455	0.021	6333	6442	12624	2619	5568	5525	2828	16198	34	181	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000005	0000007	-0.087	1485	7232	-0.034	6333	6130	12286	2434	5568	5664	2779	16135	31	170	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000005	0000008	-0.021	1356	7487	0.023	6333	6327	12512	2580	5568	5551	2837	16195	70	154	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000005	0000009	-0.036	1434	7425	-0.015	6333	6393	12540	2641	5568	5490	2784	16117	39	145	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000005	0000010	-0.049	1407	7258	-0.009	6333	6240	12331	2512	5568	5523	2764	15972	67	151	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000005	0000011	-0.102	1554	7471	-0.042	6333	5946	12129	2490	5568	5723	2872	16174	40	151	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000006	0000007	-0.041	1427	7531	0.006	6442	6130	12392	2601	5525	5664	2889	16148	18	174	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000006	0000008	-0.013	1374	7536	0.014	6442	6327	12627	2667	5525	5551	2823	16203	65	140	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000006	0000009	-0.002	1355	7502	0.013	6442	6393	12660	2695	5525	5490	2781	16127	28	153	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000006	0000010	-0.043	1429	7328	-0.018	6442	6240	12417	2594	5525	5523	2759	15986	52	149	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000006	0000011	-0.082	1500	7447	-0.028	6442	5946	12236	2501	5525	5723	2847	16181	32	171	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000007	0000008	-0.037	1385	7572	0.024	6130	6327	12271	2543	5664	5551	2904	16142	60	140	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000007	0000009	-0.038	1391	7451	0.011	6130	6393	12319	2549	5664	5490	2843	16063	30	175	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000007	0000010	-0.038	1357	7430	0.030	6130	6240	12100	2482	5664	5523	2879	15923	40	154	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000007	0000011	-0.122	1599	7578	-0.049	6130	5946	11890	2473	5664	5723	2919	16121	22	152	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000008	0000009	-0.022	1390	7473	0.000	6327	6393	12546	2641	5551	5490	2782	16127	59	152	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000008	0000010	-0.027	1371	7419	0.011	6327	6240	12348	2577	5551	5523	2802	15984	125	190	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000008	0000011	-0.081	1476	7500	-0.012	6327	5946	12124	2461	5551	5723	2886	16178	69	149	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000009	0000010	-0.029	1398	7382	-0.005	6393	6240	12358	2617	5490	5523	2767	15904	70	134	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000009	0000011	-0.094	1477	7242	-0.024	6393	5946	12152	2385	5490	5723	2822	16101	31	144	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs 0000010	0000011	-0.096	1466	7283	-0.017	6240	5946	11930	2361	5523	5723	2837	15957	58	153	-1.0
// 2022-12-20T05:34:07.104Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	pairs
// 2022-12-20T05:34:07.127Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	Did A/B swap for sample 0000001
// 2022-12-20T05:34:07.128Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	Removing 0000000.somalier from working directory
// 2022-12-20T05:34:07.128Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	Removing 0000001.somalier from working directory
// 2022-12-20T05:34:07.128Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	Removing 0000002.somalier from working directory
// 2022-12-20T05:34:07.128Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	Removing 0000003.somalier from working directory
// 2022-12-20T05:34:07.128Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	Removing 0000004.somalier from working directory
// 2022-12-20T05:34:07.128Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	Removing 0000005.somalier from working directory
// 2022-12-20T05:34:07.128Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	Removing 0000006.somalier from working directory
// 2022-12-20T05:34:07.128Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	Removing 0000007.somalier from working directory
// 2022-12-20T05:34:07.128Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	Removing 0000008.somalier from working directory
// 2022-12-20T05:34:07.128Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	Removing 0000009.somalier from working directory
// 2022-12-20T05:34:07.128Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	Removing 0000010.somalier from working directory
// 2022-12-20T05:34:07.128Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	Removing 0000011.somalier from working directory
// 2022-12-20T05:34:07.129Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	Removing somalier.pairs.tsv from working directory
// 2022-12-20T05:34:07.129Z	30199470-9648-49fd-a66a-3e04c7c8ed69	INFO	Removing somalier.samples.tsv from working directory
