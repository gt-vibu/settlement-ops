/**
 * Cause to permitted-disposition policy (specs/CAUSE_TAXONOMY.md section 5).
 *
 * The load-bearing rule here is that AMBIGUOUS can never resolve. That is not a
 * heuristic or a tuned threshold - it is a definitional property of the taxonomy, so
 * it is expressed as a table the verifier consults rather than as a condition
 * somewhere in the agent path.
 */

import type { CauseCode } from './cause-code.js';
import type { Disposition } from './disposition.js';

const ALL: readonly Disposition[] = ['RESOLVE', 'REQUEST_EVIDENCE', 'ESCALATE'];

export const CAUSE_DISPOSITION_POLICY: Readonly<Record<CauseCode, readonly Disposition[]>> = {
  MDR_FEE: ALL,
  UTR_SPLIT: ALL,
  REFUND_NETTING: ALL,
  TIMING_LAG: ALL,
  ROUNDING_DRIFT: ['RESOLVE', 'ESCALATE'],
  AMBIGUOUS: ['ESCALATE'],
  COMPOUND: ALL,
};

export const isDispositionPermitted = (cause: CauseCode, disposition: Disposition): boolean =>
  CAUSE_DISPOSITION_POLICY[cause].includes(disposition);

/** AMBIGUOUS can never resolve. Stated separately because it is a safety invariant. */
export const canEverResolve = (cause: CauseCode): boolean =>
  CAUSE_DISPOSITION_POLICY[cause].includes('RESOLVE');
