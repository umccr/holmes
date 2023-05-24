/**
 * The values returned/defined by somalier itself in its report back between two samples
 */
export type SomalierCommonType = {
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
  x_ibs0: number;
  x_ibs2: number;
};

export type HolmesCommonType = {
  // the file URL
  file: string;

  // the JSONify dump of the regex match
  regexJson: string;
};

export type SelfType = HolmesCommonType &
  SomalierCommonType & {
    type: "Self";
  };

export type ExpectedRelatedType = HolmesCommonType &
  SomalierCommonType & {
    type: "ExpectedRelated";
  };

export type ExpectedUnrelatedType = HolmesCommonType &
  SomalierCommonType & {
    type: "ExpectedUnrelated";
  };

export type UnexpectedUnrelatedType = HolmesCommonType &
  SomalierCommonType & {
    type: "UnexpectedUnrelated";
  };

export type UnexpectedRelatedType = HolmesCommonType &
  SomalierCommonType & {
    type: "UnexpectedRelated";
  };

export type HolmesReturnType =
  | SelfType
  | ExpectedRelatedType
  | UnexpectedUnrelatedType
  | UnexpectedRelatedType;
