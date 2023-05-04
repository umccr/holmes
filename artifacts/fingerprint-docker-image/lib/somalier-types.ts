/**
 * The values returned/defined by somalier itself in its report back between two samples
 */
export type SomalierCommonType = {
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

/**
 * Our custom fields we add in for match that is unexpectedly unrelated
 */
export type NoMatchType = {
  // the file URL
  file: string;

  // whether our regex of expected related matched (this will always be true for NoMatch)
  regexRelated: boolean;

  // the degree of unrelatedness between the samples
  unrelatedness: number;
} & SomalierCommonType;

/**
 * Our custom fields we add in for a match that is unexpectedly related
 */
export type MatchType = {
  // the file URL
  file: string;

  // whether our regex of expected related matched
  regexRelated: boolean;

  // the degree of relatedness between the samples
  relatedness: number;
} & SomalierCommonType;

export type EitherMatchOrNoMatchType = MatchType | NoMatchType;
