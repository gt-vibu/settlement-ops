/**
 * The dataset generator.
 *
 * ORDER IS THE SECURITY MODEL. For every case:
 *   1. decide the hidden truth  (causes, amount, method, timing);
 *   2. render visible records FROM that decision;
 *   3. never write anything from (1) into (2).
 *
 * Splits are produced development-first, because `SEEN` is defined by what development
 * contains. The registry is then frozen and every later split is labelled by lookup.
 */

import type { CauseCode } from '@settlementops/domain';

import { GENERATOR_ROOT_SEED } from '../manifest/experiment-manifest.js';
import {
  MIN_COMPOUND_CASES_IN_SEEN,
  planFor,
  SPLIT_PLAN,
  type NoveltyStratum,
  type Split,
} from '../manifest/splits.js';
import { causeTupleKey } from './buckets.js';
import { renderCase, type CasePlan } from './case-builder.js';
import { type SingleCause } from './defects.js';
import {
  assertRegistryAdequate,
  buildRegistry,
  classifyNovelty,
  type CombinationRegistry,
} from './registry.js';
import { createRng, deriveSeed, type Rng } from './rng.js';
import type { CaseBlueprint, GeneratedCase, GeneratedSplit } from './types.js';

/**
 * Only four of the ten possible pairings appear in development.
 *
 * The remaining six are what `NOVEL_COMBINATION` is made of - pairings of causes the
 * system knows individually but has never seen interact. Fixed rather than sampled, so
 * the boundary between seen and unseen is a property of the design, not of a seed.
 */
const DEVELOPMENT_PAIRS: readonly (readonly SingleCause[])[] = [
  ['MDR_FEE', 'TIMING_LAG'],
  ['MDR_FEE', 'ROUNDING_DRIFT'],
  ['REFUND_NETTING', 'TIMING_LAG'],
  ['ROUNDING_DRIFT', 'UTR_SPLIT'],
];

const SINGLE_CAUSES: readonly SingleCause[] = [
  'MDR_FEE',
  'UTR_SPLIT',
  'REFUND_NETTING',
  'TIMING_LAG',
  'ROUNDING_DRIFT',
];

const sortedCauses = (causes: readonly string[]): CauseCode[] => [...causes].sort() as CauseCode[];

/**
 * What each novelty stratum requires of the cause selection.
 *
 * The plan is only an INTENT. The label a case actually receives comes from
 * `classifyNovelty` against the frozen registry, so a plan that fails to land where it
 * aimed produces an honest label and a reported deviation, never a relabelled case.
 */
const planForStratum = (
  stratum: NoveltyStratum,
  rng: Rng,
  registry: CombinationRegistry | null,
): CasePlan => {
  switch (stratum) {
    case 'ADVERSARIAL':
      return { causes: ['AMBIGUOUS'], adversarial: true, ambiguous: false };
    case 'AMBIGUOUS':
      return { causes: ['AMBIGUOUS'], adversarial: false, ambiguous: true };
    case 'COMPOUND_UNSEEN': {
      // Three or more interacting causes: strictly more than development ever showed.
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const triple = rng.shuffle(SINGLE_CAUSES).slice(0, 3);
        if (registry === null || !registry.tuples.has(causeTupleKey(triple))) {
          return { causes: sortedCauses(triple), adversarial: false, ambiguous: false };
        }
      }
      return {
        causes: sortedCauses(rng.shuffle(SINGLE_CAUSES).slice(0, 4)),
        adversarial: false,
        ambiguous: false,
      };
    }
    case 'NOVEL_COMBINATION': {
      // A pairing of causes development knows individually but never put together.
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const pair = rng.shuffle(SINGLE_CAUSES).slice(0, 2);
        const everySingleKnown =
          registry === null || pair.every((cause) => registry.singles.has(cause));
        if (everySingleKnown && (registry === null || !registry.tuples.has(causeTupleKey(pair)))) {
          return { causes: sortedCauses(pair), adversarial: false, ambiguous: false };
        }
      }
      return { causes: [rng.pick(SINGLE_CAUSES)], adversarial: false, ambiguous: false };
    }
    case 'NOVEL_CONFIGURATION':
    case 'SEEN':
    default: {
      // Draw a tuple the registry knows, so the only question left is the bucket.
      if (registry !== null) {
        const known = [...registry.tuples];
        if (known.length > 0) {
          const tuple = rng.pick(known);
          return {
            causes: sortedCauses(tuple.split(',')),
            adversarial: false,
            ambiguous: false,
          };
        }
      }
      // Development: singles, plus a minority drawn from the four fixed pairings, so that
      // SEEN compound cases exist and the compound/novelty confound can be broken later.
      if (rng.bool(0.25)) {
        return {
          causes: sortedCauses(rng.pick(DEVELOPMENT_PAIRS)),
          adversarial: false,
          ambiguous: false,
        };
      }
      return { causes: [rng.pick(SINGLE_CAUSES)], adversarial: false, ambiguous: false };
    }
  }
};

/** Expand a split's novelty counts into a flat, deterministic list of strata. */
const strataFor = (split: Split, rng: Rng): NoveltyStratum[] => {
  const plan = planFor(split);
  const list: NoveltyStratum[] = [];
  for (const [stratum, count] of Object.entries(plan.novelty)) {
    for (let i = 0; i < count; i += 1) list.push(stratum as NoveltyStratum);
  }
  return rng.shuffle(list);
};

export interface GenerationResult {
  readonly splits: readonly GeneratedSplit[];
  readonly registry: CombinationRegistry;
  readonly rootSeed: number;
}

export const generateDataset = (rootSeed: number = GENERATOR_ROOT_SEED): GenerationResult => {
  // Development first: SEEN is defined by what it contains.
  const ordered: readonly Split[] = [
    'development',
    'validation',
    'showcase',
    'primary_test',
    'challenge',
  ];

  let ordinal = 1;
  let merchantIndex = 0;
  let registry: CombinationRegistry | null = null;
  const splits: GeneratedSplit[] = [];

  for (const split of ordered) {
    const plan = planFor(split);
    const seed = deriveSeed(rootSeed, split);
    const rng = createRng(seed);
    // Merchants are disjoint across splits by construction, not by later checking.
    const merchants = Array.from({ length: plan.merchants }, () => {
      merchantIndex += 1;
      return `merchant-${String(merchantIndex).padStart(3, '0')}`;
    });

    const strata = strataFor(split, rng);
    const cases: GeneratedCase[] = [];

    for (let i = 0; i < strata.length; i += 1) {
      const target = strata[i] ?? 'SEEN';
      const merchantSlug = merchants[i % merchants.length] ?? merchants[0] ?? 'merchant-001';

      // Draw until the case LANDS in the intended stratum, up to a bounded number of
      // attempts. The label is always the one the registry assigns - retrying changes
      // which case we keep, never what a case is called.
      let chosen: {
        blueprint: Omit<CaseBlueprint, 'noveltyStratum'>;
        visibleRecords: readonly Record<string, unknown>[];
        stratum: NoveltyStratum;
      } | null = null;

      for (let attempt = 0; attempt < 25; attempt += 1) {
        const casePlan = planForStratum(target, rng, registry);
        const rendered = renderCase(ordinal, split, merchantSlug, casePlan, rng);
        const actual: NoveltyStratum =
          split === 'development'
            ? 'SEEN'
            : registry === null
              ? target
              : classifyNovelty(registry, rendered.blueprint.trueCauses, rendered.bucket, {
                  adversarial: casePlan.adversarial,
                  ambiguous: casePlan.ambiguous,
                });
        chosen = { ...rendered, stratum: actual };
        if (actual === target) break;
      }

      if (chosen === null) throw new Error('case rendering produced nothing');
      ordinal += 1;
      cases.push({
        blueprint: { ...chosen.blueprint, noveltyStratum: chosen.stratum },
        visibleRecords: chosen.visibleRecords,
      });
    }

    splits.push({ split, seed, merchants, cases });

    if (split === 'development') {
      registry = buildRegistry(
        cases.map((c) => ({ causes: c.blueprint.trueCauses, bucket: c.blueprint.bucket })),
      );
      assertRegistryAdequate(registry, SINGLE_CAUSES);
    }
  }

  if (registry === null) throw new Error('registry was never built');
  return { splits, registry, rootSeed };
};

/**
 * Allocation checks that must hold before the dataset is usable.
 *
 * Deviations are reported, never silently absorbed (`NOVELTY_ALLOCATION_REVIEW.md` §5.3).
 */
export const allocationReport = (
  result: GenerationResult,
): { readonly warnings: readonly string[]; readonly compoundInSeen: number } => {
  const warnings: string[] = [];
  const primary = result.splits.find((s) => s.split === 'primary_test');
  const compoundInSeen =
    primary?.cases.filter(
      (c) => c.blueprint.noveltyStratum === 'SEEN' && c.blueprint.trueCauses.length > 1,
    ).length ?? 0;

  if (compoundInSeen < MIN_COMPOUND_CASES_IN_SEEN) {
    warnings.push(
      `compound-in-SEEN floor not met: ${compoundInSeen} < ${MIN_COMPOUND_CASES_IN_SEEN}; the ` +
        'within-class comparison that separates novelty from difficulty is not possible',
    );
  }

  for (const plan of SPLIT_PLAN) {
    const generated = result.splits.find((s) => s.split === plan.split);
    if (generated === undefined) {
      warnings.push(`split ${plan.split} was not generated`);
      continue;
    }
    if (generated.cases.length !== plan.cases) {
      warnings.push(
        `split ${plan.split}: generated ${generated.cases.length} cases, planned ${plan.cases}`,
      );
    }
  }

  const challenge = result.splits.find((s) => s.split === 'challenge');
  const seenInChallenge = challenge?.cases.filter(
    (c) => c.blueprint.noveltyStratum === 'SEEN',
  ).length;
  if (seenInChallenge !== undefined && seenInChallenge > 0) {
    warnings.push(`challenge split contains ${seenInChallenge} SEEN cases; it must contain none`);
  }

  return { warnings, compoundInSeen };
};
