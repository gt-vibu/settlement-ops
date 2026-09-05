/**
 * The deterministic verifier.
 *
 * TERMINAL AND SINGLE-PASS. Its result NEVER returns to the model (readiness decision D6).
 * If the agent could see why it failed and try again, the verifier would stop being a gate
 * and become a scoring function the model optimises against - which is exactly how a
 * safety control becomes a rubber stamp.
 *
 * The verifier decides the EFFECTIVE disposition. The model only ever proposes one.
 *
 * It is pure: same proposal plus same unit, same verdict. It reuses the same domain
 * arithmetic as the baseline, so a claim the baseline could not substantiate cannot be
 * substantiated here either.
 */

import {
  canEverResolve,
  isDispositionPermitted,
  withinRoundingTolerance,
  ROUNDING_TOLERANCE_ABSOLUTE_CAP_MINOR,
  REFUND_NETTING_MAX_CYCLES,
  adjustmentCanExplainSettlement,
  daysBetween,
  expectedNetFromRecords,
  scheduledFeeFor,
  type CauseCode,
  type Disposition,
  type ReconciliationUnit,
} from '@settlementops/domain';

export interface Proposal {
  readonly cause: CauseCode;
  readonly disposition: Disposition;
  /** Source record ids the proposal claims as evidence. */
  readonly evidenceRecordIds: readonly string[];
  readonly rationale: string;
  /**
   * Record ids a tool ACTUALLY returned during this investigation.
   *
   * Two different checks follow from this, and both matter:
   *   - a cited id outside the case is `EVIDENCE_NOT_IN_SCOPE` - it belongs to someone
   *     else's data, or to nothing;
   *   - a cited id that is in the case but was never RETRIEVED is `EVIDENCE_NOT_RETRIEVED`
   *     - the proposal is citing something the investigation never actually looked at.
   *
   * Omit it (undefined) for a system that does not run an investigation loop, such as the
   * deterministic baseline, whose evidence is the verdict's own record set.
   */
  readonly retrievedRecordIds?: readonly string[];
}

export type VerifierFailure =
  | 'CAUSE_NOT_PERMITTED_TO_RESOLVE'
  | 'DISPOSITION_NOT_PERMITTED_FOR_CAUSE'
  | 'EVIDENCE_MISSING'
  | 'EVIDENCE_NOT_IN_SCOPE'
  | 'EVIDENCE_NOT_RETRIEVED'
  | 'ARITHMETIC_UNSUPPORTED'
  | 'CAUSE_NOT_SUPPORTED_BY_EVIDENCE'
  | 'TIMING_IMPOSSIBLE'
  | 'ROUNDING_EXCEEDS_CAP'
  | 'REFUND_OUTSIDE_WINDOW';

export interface VerificationResult {
  readonly passed: boolean;
  /** What actually happens. A failed RESOLVE is downgraded, never dropped. */
  readonly effectiveDisposition: Disposition;
  readonly failures: readonly VerifierFailure[];
  readonly detail: readonly string[];
}

const variance = (unit: ReconciliationUnit): bigint | null => {
  const observed = expectedNetFromRecords({
    gross: unit.payment.amount,
    fees: unit.fees.map((f) => f.amount),
    taxes: unit.taxes.map((t) => t.amount),
    refunds: unit.refunds.map((r) => r.amount),
    adjustments: unit.adjustments.map((a) => a.amount),
  });
  if (!observed.ok) return null;
  const settled = unit.settlementLines
    .filter((l) => l.paymentId === unit.payment.paymentId)
    .reduce((total, l) => total + l.amount.amountMinor, 0n);
  return observed.value.expectedNetMinor - settled;
};

const abs = (value: bigint): bigint => (value < 0n ? -value : value);

/**
 * Does the evidence actually support THIS cause?
 *
 * One rule per cause, each expressed as arithmetic or a lifecycle fact - never as a
 * judgement. A cause the evidence cannot substantiate is not resolvable, however
 * confident the model was.
 */
const causeSupported = (
  cause: CauseCode,
  unit: ReconciliationUnit,
): { supported: boolean; failure?: VerifierFailure; detail: string } => {
  const delta = variance(unit);
  if (delta === null) {
    return {
      supported: false,
      failure: 'ARITHMETIC_UNSUPPORTED',
      detail: 'variance not computable',
    };
  }

  switch (cause) {
    case 'MDR_FEE': {
      // The variance must equal what the published schedule says was withheld.
      const at = unit.payment.capturedAt ?? unit.payment.authorizedAt;
      if (at === null) {
        return { supported: false, failure: 'ARITHMETIC_UNSUPPORTED', detail: 'no capture date' };
      }
      const scheduled = scheduledFeeFor(unit.payment.amount, unit.payment.paymentMethod, at);
      if (scheduled === null) {
        return {
          supported: false,
          failure: 'ARITHMETIC_UNSUPPORTED',
          detail: 'no schedule in force',
        };
      }
      const withheld = scheduled.fee.amountMinor + scheduled.tax.amountMinor;
      const observedFee = unit.fees.reduce((total, f) => total + f.amount.amountMinor, 0n);
      const observedTax = unit.taxes.reduce((total, t) => total + t.amount.amountMinor, 0n);
      const unrecorded = withheld - observedFee - observedTax;
      const matches = withinRoundingTolerance(abs(delta) - abs(unrecorded), 2);
      return matches
        ? { supported: true, detail: `variance ${delta} matches unrecorded fee+tax ${unrecorded}` }
        : {
            supported: false,
            failure: 'CAUSE_NOT_SUPPORTED_BY_EVIDENCE',
            detail: `variance ${delta} does not match unrecorded fee+tax ${unrecorded}`,
          };
    }

    case 'UTR_SPLIT': {
      // Value must be conserved across the legs and every leg must have a credit.
      const legs = new Set(unit.settlements.map((s) => s.settlementId));
      if (legs.size < 2) {
        return {
          supported: false,
          failure: 'CAUSE_NOT_SUPPORTED_BY_EVIDENCE',
          detail: 'only one settlement leg exists',
        };
      }
      const missing = unit.settlements.filter(
        (s) => s.utr !== null && !unit.bankCredits.some((b) => b.utr === s.utr),
      );
      if (missing.length > 0) {
        return {
          supported: false,
          failure: 'EVIDENCE_MISSING',
          detail: `${missing.length} settlement leg(s) have no bank credit`,
        };
      }
      return withinRoundingTolerance(delta, unit.settlementLines.length)
        ? { supported: true, detail: 'value conserved across legs and every leg is credited' }
        : {
            supported: false,
            failure: 'ARITHMETIC_UNSUPPORTED',
            detail: `legs do not conserve value: variance ${delta}`,
          };
    }

    case 'TIMING_LAG': {
      // Lateness only explains a case where the amounts already agree.
      if (!withinRoundingTolerance(delta, Math.max(1, unit.settlementLines.length))) {
        return {
          supported: false,
          failure: 'CAUSE_NOT_SUPPORTED_BY_EVIDENCE',
          detail: `amounts do not agree (variance ${delta}); lateness cannot explain money`,
        };
      }
      const capturedAt = unit.payment.capturedAt;
      if (capturedAt === null || unit.settlements.length === 0) {
        return {
          supported: false,
          failure: 'EVIDENCE_MISSING',
          detail: 'no settlement or capture',
        };
      }
      return { supported: true, detail: 'amounts agree; only the arrival time differs' };
    }

    case 'ROUNDING_DRIFT': {
      // Bounded by the absolute cap, always. This is the laundering guard.
      if (abs(delta) > ROUNDING_TOLERANCE_ABSOLUTE_CAP_MINOR) {
        return {
          supported: false,
          failure: 'ROUNDING_EXCEEDS_CAP',
          detail: `variance ${delta} exceeds the ${ROUNDING_TOLERANCE_ABSOLUTE_CAP_MINOR} cap rounding may explain`,
        };
      }
      return { supported: true, detail: `variance ${delta} is within the rounding ceiling` };
    }

    case 'REFUND_NETTING': {
      if (unit.refunds.length === 0) {
        return { supported: false, failure: 'EVIDENCE_MISSING', detail: 'no refund exists' };
      }
      const late = unit.refunds.filter((r) => {
        if (r.settledAt === null) return false;
        return daysBetween(r.settledAt, r.createdAt) / 2 > REFUND_NETTING_MAX_CYCLES;
      });
      if (late.length > 0) {
        return {
          supported: false,
          failure: 'REFUND_OUTSIDE_WINDOW',
          detail: `${late.length} refund(s) settled beyond ${REFUND_NETTING_MAX_CYCLES} cycles`,
        };
      }
      return { supported: true, detail: 'refund settles inside the netting window' };
    }

    case 'AMBIGUOUS':
      // Reaching here means the model proposed AMBIGUOUS, which is never resolvable.
      return { supported: true, detail: 'ambiguity acknowledged' };

    case 'COMPOUND':
    default:
      return {
        supported: false,
        failure: 'CAUSE_NOT_SUPPORTED_BY_EVIDENCE',
        detail: 'COMPOUND is not independently verifiable; the components must be proven',
      };
  }
};

/**
 * Verify a proposal. Single pass, terminal.
 *
 * A failure never becomes an error the caller can retry - it becomes a SAFE outcome.
 * `ESCALATE` is the floor: the case goes to a human rather than nowhere.
 */
export const verify = (proposal: Proposal, unit: ReconciliationUnit): VerificationResult => {
  const failures: VerifierFailure[] = [];
  const detail: string[] = [];

  if (proposal.disposition !== 'RESOLVE') {
    // Nothing to substantiate: not resolving is always admissible.
    return {
      passed: true,
      effectiveDisposition: proposal.disposition,
      failures: [],
      detail: ['no resolution claimed; nothing to substantiate'],
    };
  }

  if (!canEverResolve(proposal.cause)) {
    failures.push('CAUSE_NOT_PERMITTED_TO_RESOLVE');
    detail.push(`${proposal.cause} can never resolve; this is definitional, not a threshold`);
  }
  if (!isDispositionPermitted(proposal.cause, proposal.disposition)) {
    failures.push('DISPOSITION_NOT_PERMITTED_FOR_CAUSE');
  }

  // Provenance: every claimed record must exist in THIS unit. A proposal citing an id
  // the case does not contain is citing something it never saw.
  const known = new Set<string>([
    unit.payment.id,
    ...unit.fees.map((f) => f.id),
    ...unit.taxes.map((t) => t.id),
    ...unit.refunds.map((r) => r.id),
    ...unit.adjustments.map((a) => a.id),
    ...unit.settlements.map((s) => s.id),
    ...unit.settlementLines.map((l) => l.id),
    ...unit.bankCredits.map((b) => b.id),
  ]);
  if (proposal.evidenceRecordIds.length === 0) {
    failures.push('EVIDENCE_MISSING');
    detail.push('a resolution must cite the records that support it');
  }
  const foreign = proposal.evidenceRecordIds.filter((id) => !known.has(id));
  if (foreign.length > 0) {
    failures.push('EVIDENCE_NOT_IN_SCOPE');
    detail.push(`${foreign.length} cited record(s) are not part of this case`);
  }

  // Provenance: a proposal may only rest on evidence a tool actually returned. Without
  // this, a model could cite any record id it saw in a briefing - or invent one that
  // happens to exist - and the citation would look substantiated because the record is
  // real. Being real is not the same as having been retrieved.
  if (proposal.retrievedRecordIds !== undefined) {
    const retrieved = new Set(proposal.retrievedRecordIds);
    const unretrieved = proposal.evidenceRecordIds.filter(
      (id) => known.has(id) && !retrieved.has(id),
    );
    if (unretrieved.length > 0) {
      failures.push('EVIDENCE_NOT_RETRIEVED');
      detail.push(
        `${unretrieved.length} cited record(s) exist but were never returned by a tool in ` +
          'this investigation',
      );
    }
  }

  // An adjustment that could not have affected this settlement is never support.
  const impossible = unit.adjustments.filter((adjustment) =>
    unit.settlements.every(
      (settlement) =>
        !adjustmentCanExplainSettlement(adjustment.effectiveAt, settlement.settlementAt),
    ),
  );
  if (impossible.length > 0 && unit.settlements.length > 0) {
    failures.push('TIMING_IMPOSSIBLE');
    detail.push(
      `${impossible.length} adjustment(s) take effect after the settlement they would explain`,
    );
  }

  const support = causeSupported(proposal.cause, unit);
  detail.push(support.detail);
  if (!support.supported && support.failure !== undefined) failures.push(support.failure);

  const passed = failures.length === 0;
  return {
    passed,
    // Downgrade to the safe outcome. A rejected resolution is an escalation, never a
    // silent closure and never an error the agent gets to see and work around.
    effectiveDisposition: passed ? 'RESOLVE' : 'ESCALATE',
    failures,
    detail,
  };
};
