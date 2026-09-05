/**
 * The combination registry.
 *
 * `SEEN` has no meaning until the development split exists, so the registry is built from
 * development and then FROZEN. Every later split gets its novelty label by lookup, never
 * by hand - which is what stops the experimental variable from being decided case by case
 * after the fact.
 *
 * `NOVELTY_ALLOCATION_REVIEW.md` §4.
 *
 * DEVIATION FROM THE REVIEW'S LITERAL RULES (recorded in `CHANGE_CONTROL.md` CC-016).
 * As written, §4.2 orders `COMPOUND_UNSEEN` (">=2 causes and tuple not in registry")
 * BEFORE `NOVEL_COMBINATION` ("all singles known, tuple not in registry"). Given the
 * adequacy precondition - every cause appears as a single in development - those two
 * conditions describe the same set, and the earlier rule makes the later one unreachable:
 * `NOVEL_COMBINATION` could never be assigned to any case, which would delete the primary
 * experimental stratum.
 *
 * Resolved by separating them on ARITY, which is what the prose plainly intends:
 *   NOVEL_COMBINATION  exactly two known causes in a pairing development never showed
 *   COMPOUND_UNSEEN    three or more interacting causes, more than development ever showed
 * Both are now reachable and the ordering is preserved.
 */

import type { CauseCode } from '@settlementops/domain';

import type { NoveltyStratum } from '../manifest/splits.js';
import { bucketKey, causeTupleKey, type ConfigurationBucket } from './buckets.js';

export interface RegistryEntry {
  readonly causeTuple: string;
  readonly bucket: ConfigurationBucket;
}

export interface CombinationRegistry {
  /** Cause tuples that appeared in development. */
  readonly tuples: ReadonlySet<string>;
  /** Individual causes that appeared as SINGLE-cause cases. */
  readonly singles: ReadonlySet<string>;
  /** tuple -> set of configuration buckets seen with it. */
  readonly buckets: ReadonlyMap<string, ReadonlySet<string>>;
  readonly entries: readonly RegistryEntry[];
}

export const buildRegistry = (
  observed: readonly { causes: readonly CauseCode[]; bucket: ConfigurationBucket }[],
): CombinationRegistry => {
  const tuples = new Set<string>();
  const singles = new Set<string>();
  const buckets = new Map<string, Set<string>>();
  const entries: RegistryEntry[] = [];

  for (const item of observed) {
    const tuple = causeTupleKey(item.causes);
    tuples.add(tuple);
    if (item.causes.length === 1 && item.causes[0] !== undefined) singles.add(item.causes[0]);
    const key = bucketKey(item.bucket);
    const existing = buckets.get(tuple);
    if (existing === undefined) buckets.set(tuple, new Set([key]));
    else existing.add(key);
    entries.push({ causeTuple: tuple, bucket: item.bucket });
  }

  return { tuples, singles, buckets, entries };
};

/**
 * Registry adequacy precondition (`NOVELTY_ALLOCATION_REVIEW.md` §4.4).
 *
 * `NOVEL_COMBINATION` only means anything if every individual cause was seen ALONE in
 * development. Otherwise a "novel combination" is really an unseen cause - a different
 * and much easier claim. Failure blocks generation rather than being noted.
 */
export const assertRegistryAdequate = (
  registry: CombinationRegistry,
  requiredSingles: readonly CauseCode[],
): void => {
  const missing = requiredSingles.filter((cause) => !registry.singles.has(cause));
  if (missing.length > 0) {
    throw new Error(
      `registry inadequate: ${missing.join(', ')} never appeared as a single-cause case in ` +
        'development, so NOVEL_COMBINATION would be measuring unseen causes instead',
    );
  }
  const pairs = [...registry.tuples].filter((t) => t.split(',').length === 2);
  if (pairs.length === 0) {
    throw new Error(
      'registry inadequate: development contains no multi-cause tuple, so no SEEN case can ' +
        'carry a compound combination and the compound/novelty confound cannot be broken',
    );
  }
};

/**
 * Novelty classification, applied strictly in order.
 *
 * Order matters: a case that is both compound-unseen and ambiguous is `AMBIGUOUS`,
 * because what is measured there is abstention, not generalisation.
 */
export const classifyNovelty = (
  registry: CombinationRegistry,
  causes: readonly CauseCode[],
  bucket: ConfigurationBucket,
  flags: { readonly adversarial: boolean; readonly ambiguous: boolean },
): NoveltyStratum => {
  if (flags.adversarial) return 'ADVERSARIAL';
  if (flags.ambiguous) return 'AMBIGUOUS';

  const tuple = causeTupleKey(causes);
  const knownTuple = registry.tuples.has(tuple);

  // Three or more interacting causes in a pairing development never showed.
  if (causes.length >= 3 && !knownTuple) return 'COMPOUND_UNSEEN';
  // A pairing of known causes that development never put together.
  if (!knownTuple) return 'NOVEL_COMBINATION';

  const seenBuckets = registry.buckets.get(tuple);
  if (seenBuckets === undefined || !seenBuckets.has(bucketKey(bucket))) {
    return 'NOVEL_CONFIGURATION';
  }
  return 'SEEN';
};
