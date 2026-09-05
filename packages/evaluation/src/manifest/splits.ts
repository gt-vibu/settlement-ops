/**
 * Frozen split and novelty allocation.
 *
 * Source: `EXPERIMENT_CONSTANTS.md` §7 (split sizes, cause distribution) and
 * `NOVELTY_ALLOCATION_REVIEW.md` §2 (novelty strata). Both resolved at the freeze
 * recorded in `CHANGE_CONTROL.md` CC-015.
 *
 * These numbers decide what the experiment can conclude, so they are code the generator
 * reads - not prose a human re-types. Changing one after the primary split is scored
 * invalidates the run (`EVALUATION.md` §19).
 */

export const SPLITS = [
  'development',
  'validation',
  'showcase',
  'primary_test',
  'challenge',
] as const;
export type Split = (typeof SPLITS)[number];

export const NOVELTY_STRATA = [
  'SEEN',
  'NOVEL_COMBINATION',
  'NOVEL_CONFIGURATION',
  'COMPOUND_UNSEEN',
  'AMBIGUOUS',
  'ADVERSARIAL',
] as const;
export type NoveltyStratum = (typeof NOVELTY_STRATA)[number];

export const CAUSE_CLASSES = [
  'MDR_FEE',
  'UTR_SPLIT',
  'REFUND_NETTING',
  'TIMING_LAG',
  'ROUNDING_DRIFT',
  'AMBIGUOUS',
  'COMPOUND',
] as const;
export type CauseClass = (typeof CAUSE_CLASSES)[number];

export interface SplitPlan {
  readonly split: Split;
  /** Residual cases the split must contain. */
  readonly cases: number;
  /** Merchants are DISJOINT across splits: a shared merchant invalidates every CI. */
  readonly merchants: number;
  readonly scored: boolean;
  readonly novelty: Readonly<Record<NoveltyStratum, number>>;
}

/** Total 410 residual cases over 41 disjoint merchants (`EXPERIMENT_CONSTANTS.md` D1/D2). */
export const SPLIT_PLAN: readonly SplitPlan[] = [
  {
    split: 'development',
    cases: 120,
    merchants: 12,
    scored: false,
    // 100% SEEN by definition - development is what defines the term.
    novelty: {
      SEEN: 120,
      NOVEL_COMBINATION: 0,
      NOVEL_CONFIGURATION: 0,
      COMPOUND_UNSEEN: 0,
      AMBIGUOUS: 0,
      ADVERSARIAL: 0,
    },
  },
  {
    split: 'validation',
    cases: 60,
    merchants: 6,
    scored: false,
    novelty: {
      SEEN: 42,
      NOVEL_COMBINATION: 12,
      NOVEL_CONFIGURATION: 6,
      COMPOUND_UNSEEN: 0,
      AMBIGUOUS: 0,
      ADVERSARIAL: 0,
    },
  },
  {
    split: 'showcase',
    cases: 50,
    merchants: 5,
    scored: false,
    novelty: {
      SEEN: 20,
      NOVEL_COMBINATION: 12,
      NOVEL_CONFIGURATION: 6,
      COMPOUND_UNSEEN: 6,
      AMBIGUOUS: 4,
      ADVERSARIAL: 2,
    },
  },
  {
    split: 'primary_test',
    cases: 120,
    merchants: 12,
    scored: true,
    novelty: {
      SEEN: 48,
      NOVEL_COMBINATION: 30,
      NOVEL_CONFIGURATION: 12,
      COMPOUND_UNSEEN: 12,
      AMBIGUOUS: 12,
      ADVERSARIAL: 6,
    },
  },
  {
    split: 'challenge',
    cases: 60,
    merchants: 6,
    scored: true,
    // No SEEN cases at all. That is the split's entire purpose.
    novelty: {
      SEEN: 0,
      NOVEL_COMBINATION: 21,
      NOVEL_CONFIGURATION: 6,
      COMPOUND_UNSEEN: 21,
      AMBIGUOUS: 9,
      ADVERSARIAL: 3,
    },
  },
];

/**
 * The powered comparison: SEEN (48) versus NOVEL (54) within the primary test split.
 * Everything else in the primary split is descriptive (`NOVELTY_ALLOCATION_REVIEW.md` §3).
 */
export const POWERED_NOVEL_STRATA: readonly NoveltyStratum[] = [
  'NOVEL_COMBINATION',
  'NOVEL_CONFIGURATION',
  'COMPOUND_UNSEEN',
];

export const DESCRIPTIVE_STRATA: readonly NoveltyStratum[] = ['AMBIGUOUS', 'ADVERSARIAL'];

/**
 * Compound-cause floor inside SEEN.
 *
 * COMPOUND_UNSEEN is necessarily correlated with the COMPOUND cause class - no allocation
 * can break that. The confound is handled by comparing WITHIN the compound class, which
 * requires compound cases in both strata.
 */
export const MIN_COMPOUND_CASES_IN_SEEN = 8;

export const planFor = (split: Split): SplitPlan => {
  const found = SPLIT_PLAN.find((p) => p.split === split);
  if (found === undefined) throw new Error(`unknown split: ${split}`);
  return found;
};
