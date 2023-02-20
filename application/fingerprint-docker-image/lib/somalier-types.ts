export type NoMatchType = {
  file: string;

  // if present, indicates that a regex comparison succeeded for this file
  // but there was *no* relation found in somalier (well, if there was a relationship, it was below the
  // threshhold)
  unrelatedness?: string;
};

export type MatchType = {
  file: string;

  relatedness: number;
  ibs0: number;
  ibs2: number;
  hom_concordance: number;
  hets_a: number;
  hets_b: number;
  hets_ab: number;
  shared_hets: number;
  hom_alts_a: number;
  hom_alts_b: number;
  shared_hom_alts: number;
  n: number;
  // confirm these are not directional too
  x_ibs0: number;
  x_ibs2: number;
};

export type EitherMatchOrNoMatchType = MatchType | NoMatchType;
