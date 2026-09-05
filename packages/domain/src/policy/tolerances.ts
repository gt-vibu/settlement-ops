/**
 * Reconciliation tolerances (EXPERIMENT_CONSTANTS.md section 3 - PROPOSED).
 *
 * Rounding drift is the ONLY modeled amount tolerance. Everything else must match
 * exactly or become an exception (`BASELINES.md`: "amount tolerance only where
 * explicitly modeled").
 */

/** Maximum honest drift from one rounding operation, per contributing record. */
export const ROUNDING_TOLERANCE_PER_RECORD_MINOR = 2n;

/**
 * Absolute ceiling on the total variance rounding may ever explain.
 *
 * This is the safety-critical one. Without it a large multi-line settlement accumulates
 * an arbitrarily large "rounding" allowance, which is exactly how a tolerance quietly
 * becomes a laundering channel for real errors.
 */
export const ROUNDING_TOLERANCE_ABSOLUTE_CAP_MINOR = 100n;

/** Non-rounding amount comparisons are exact. Deliberately zero. */
export const AMOUNT_MATCH_TOLERANCE_MINOR = 0n;

/**
 * Exact amount agreement, outside the rounding path.
 *
 * Deliberately a named predicate rather than a bare `===`. Previously the "exact match"
 * rule was an emergent property of simply not applying a tolerance, so the constant was
 * declared and never read - you could change it and nothing would happen. Routing the
 * comparison through here means the rule has one definition that tests can pin.
 *
 * `BASELINES.md`: amount tolerance exists ONLY where explicitly modeled. Rounding drift
 * is the only such place; everything else compares exactly.
 */
export const withinAmountMatchTolerance = (varianceMinor: bigint): boolean => {
  const magnitude = varianceMinor < 0n ? -varianceMinor : varianceMinor;
  return magnitude <= AMOUNT_MATCH_TOLERANCE_MINOR;
};

export const SETTLEMENT_DATE_MATCH_TOLERANCE_DAYS = 1;

export const NEAR_DUPLICATE_WINDOW_SECONDS = 60;

/** Aggregate allowance, capped. lineCount is the number of contributing records. */
export const roundingToleranceFor = (lineCount: number): bigint => {
  const scaled = ROUNDING_TOLERANCE_PER_RECORD_MINOR * BigInt(Math.max(1, lineCount));
  return scaled > ROUNDING_TOLERANCE_ABSOLUTE_CAP_MINOR
    ? ROUNDING_TOLERANCE_ABSOLUTE_CAP_MINOR
    : scaled;
};

/** True when a variance is small enough to be explained by rounding alone. */
export const withinRoundingTolerance = (varianceMinor: bigint, lineCount: number): boolean => {
  const magnitude = varianceMinor < 0n ? -varianceMinor : varianceMinor;
  return magnitude <= roundingToleranceFor(lineCount);
};
