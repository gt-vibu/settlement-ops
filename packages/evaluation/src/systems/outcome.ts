/**
 * What every treatment returns.
 *
 * One shape for all three systems, so the scorer cannot accidentally treat them
 * differently. `effectiveDisposition` is always the VERIFIER's answer, never the
 * system's own claim - that distinction is the whole safety argument.
 */

import type { CauseCode, Disposition } from '@settlementops/domain';

export type SystemId = 'A' | 'B' | 'C';

export interface SystemOutcome {
  readonly system: SystemId;
  readonly proposedCause: CauseCode | null;
  readonly proposedDisposition: Disposition;
  /** Decided by the verifier. A rejected RESOLVE lands here as ESCALATE. */
  readonly effectiveDisposition: Disposition;
  readonly verifierPassed: boolean;
  readonly verifierFailures: readonly string[];
  readonly toolCallCount: number;
  readonly stepCount: number;
  readonly latencyMs: number;
  readonly stopReason: string;
  readonly rationale: string;
  readonly evidenceRecordIds: readonly string[];
}
