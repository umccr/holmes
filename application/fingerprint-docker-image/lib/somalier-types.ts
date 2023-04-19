// a direct type of the somalier values
export type SomalierType = {
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
  x_ibs0: number;
  x_ibs2: number;
};

export type NoMatchType = {
  file: string;
  regexRelated: boolean;
  unrelatedness: number;
} & SomalierType;

export type MatchType = {
  file: string;
  regexRelated: boolean;
  relatedness: number;
} & SomalierType;

export type EitherMatchOrNoMatchType = MatchType | NoMatchType;
