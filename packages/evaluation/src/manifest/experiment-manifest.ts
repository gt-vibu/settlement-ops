/**
 * The frozen experiment manifest.
 *
 * One immutable record of everything that decides what a benchmark number means. The
 * generator, both baselines and the scorer read from here; nothing reads a loose literal.
 *
 * `EXPERIMENT_CONSTANTS.md` §11 requires a report to cite this manifest's configuration
 * hash. A report whose hash does not match the manifest is not a preregistered result.
 *
 * FROZEN 2026-09-05 (`CHANGE_CONTROL.md` CC-015). Nothing here may change after the
 * primary test split is scored.
 */

import { createHash } from 'node:crypto';

import { SPLIT_PLAN, MIN_COMPOUND_CASES_IN_SEEN } from './splits.js';

export const EXPERIMENT_VERSION = '1.0.0';
export const GENERATOR_VERSION = '1.0.0';
export const ORACLE_VERSION = '1.0.0';
export const SCHEMA_VERSION = 'v1';

/** Root seed. Per-split seeds are derived from it, so the whole dataset is one number. */
export const GENERATOR_ROOT_SEED = 20260831;

/** The simulated period spans the 2026-04-01 fee schedule change deliberately. */
export const SIMULATED_PERIOD = {
  from: '2026-01-01T00:00:00.000Z',
  to: '2026-06-30T23:59:59.999Z',
} as const;

export const DATASET_SHAPE = {
  settlementBatchesPerMerchant: 8,
  /** Fraction of payments engineered to leave a residual case. */
  targetResidualRate: 0.12,
  recordsPerCase: { min: 8, max: 15 },
} as const;

/**
 * Preregistered thresholds (`EXPERIMENT_CONSTANTS.md` §8).
 *
 * These are SYNTHETIC-BENCHMARK thresholds measured against our own generator and our own
 * oracle on 410 constructed cases. They are not production safety guarantees and license
 * no claim about real merchant data (`EVALUATION.md` §21). Any report quoting them must
 * carry that scope.
 */
export const THRESHOLDS = {
  /** X1 - owner-approved 2026-09-01. Both conditions must hold. */
  urrTargetCeiling: 0.02,
  urrCiUpperGuardrail: 0.05,
  /** X2 - ESRR improvement over the strongest baseline, CI lower bound above zero. */
  esrrMinImprovementPp: 10,
  /** X3 - fraction of the primary improvement that must survive on the challenge split. */
  challengeRetention: 0.6,
  /** X4 - deterministic property of the verifier, so the correct target is exactly zero. */
  ambiguousFalseResolveCeiling: 0,
  confidenceLevel: 0.95,
  bootstrapIterations: 10_000,
  /** X7 - settlement batch primary, merchant as a sensitivity check. */
  bootstrapUnit: 'settlement_batch',
  bootstrapSensitivityUnit: 'merchant',
  /** X8 - identical effective disposition across three temperature-0 re-runs. */
  reproducibilityTarget: 0.95,
} as const;

/** Leakage audit ceilings (`EXPERIMENT_CONSTANTS.md` §9). Any breach stops generation. */
export const LEAKAGE_THRESHOLDS = {
  maxSingleFeatureBalancedAccuracy: 0.3,
  maxDepth2TreeBalancedAccuracy: 0.35,
  maxPerCauseSingleFeatureAuc: 0.7,
  maxPairwiseCombinationBalancedAccuracy: 0.35,
  /** Six novelty strata, so chance is ~0.167. */
  maxNoveltyBalancedAccuracy: 0.3,
} as const;

/** Agent execution budget (`EXPERIMENT_CONSTANTS.md` §5). */
export const AGENT_BUDGET = {
  maxToolCalls: 8,
  maxSteps: 8,
  maxWallclockSeconds: 120,
  temperature: 0,
  requestTimeoutSeconds: 60,
  maxRetries: 2,
  maxOutputTokens: 4096,
  /** A repeated identical tool call counts against budget and trips loop detection. */
  identicalToolCallLimit: 1,
  maxHypotheses: 4,
  maxEvidenceRecordsPerToolResult: 50,
} as const;

/**
 * Configuration hash over everything that changes what a number means.
 *
 * Deliberately excludes wall-clock and machine facts so the same experiment hashes
 * identically on a re-run.
 */
export const configurationHash = (modelIdentity: {
  provider: string;
  model: string;
  digest: string;
}): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        EXPERIMENT_VERSION,
        GENERATOR_VERSION,
        ORACLE_VERSION,
        SCHEMA_VERSION,
        GENERATOR_ROOT_SEED,
        SIMULATED_PERIOD,
        DATASET_SHAPE,
        THRESHOLDS,
        LEAKAGE_THRESHOLDS,
        AGENT_BUDGET,
        MIN_COMPOUND_CASES_IN_SEEN,
        SPLIT_PLAN,
        modelIdentity,
      }),
    )
    .digest('hex');
