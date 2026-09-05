/**
 * Versioned financial policy.
 *
 * STATUS OF THESE NUMBERS — FROZEN 2026-09-05.
 *
 * Every constant in this directory comes from `EXPERIMENT_CONSTANTS.md`, resolved through
 * `D7_DECISION_TABLE.md`, `D7_SENSITIVITY_REPORT.md` and `D7_FINALIZATION_REVIEW.md`. The
 * owner authorised the freeze so that generation, baselines and evaluation could be built
 * against fixed values (`CHANGE_CONTROL.md` CC-015).
 *
 * MOST OF THESE VALUES ARE SYNTHETIC ASSUMPTIONS. Only the CARD fee rate (250 bps) and the
 * GST rate on fee (1800 bps) have real provenance, reverse-engineered from the two places
 * the specification works the same example. Everything else was invented for this project
 * and is labelled as such in `D7_FINALIZATION_REVIEW.md` section 3. None of them is a
 * Razorpay fact.
 *
 * `CONFIGURATION.md`: these are business invariants and must never become environment
 * variables. A deployment-time change to a financial rule would silently alter what
 * "correct" means.
 *
 * AFTER THE PRIMARY TEST SPLIT IS SCORED, NOTHING HERE MAY CHANGE (`EVALUATION.md` §19).
 * `frozen-policy.test.ts` pins every value so drift breaks the build rather than quietly
 * invalidating a benchmark.
 */

export const POLICY_VERSION = '1.0.0';

export const POLICY_APPROVAL_STATUS = 'APPROVED' as const;

/** UTC date the owner froze the policy. Recorded in the experiment manifest. */
export const POLICY_FROZEN_AT = '2026-09-05';
