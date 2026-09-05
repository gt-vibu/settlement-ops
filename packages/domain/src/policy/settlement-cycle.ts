/**
 * Settlement timing windows (EXPERIMENT_CONSTANTS.md section 4 - PROPOSED).
 *
 * A synthetic model of T+2 business-day settlement with an evening cutoff. Labelled a
 * synthetic assumption, not a claim about any provider's internal engine
 * (`START_HERE.md` section 8). No holiday calendar in the MVP - a stated limitation.
 */

export const SETTLEMENT_CYCLE_BUSINESS_DAYS = 2;
export const SETTLEMENT_CUTOFF_HOUR_IST = 18;
export const IST_OFFSET_MINUTES = 330; // UTC+05:30
export const REFUND_NETTING_MAX_CYCLES = 2;
export const BANK_CREDIT_EXPECTED_LAG_HOURS = 24;

export const BANK_CREDIT_LATENESS_TOLERANCE_HOURS = 72;

/**
 * Adjustment plausibility is CYCLE-RELATIVE, not a fixed number of hours.
 *
 * The previous `ADJUSTMENT_SETTLEMENT_MAX_HOURS = 72` had two problems, and the value was
 * the lesser one:
 *
 *  1. It was SYMMETRIC. `hoursBetween` takes an absolute value, so an adjustment 100h
 *     BEFORE a settlement and one 100h AFTER were treated identically. In the domain they
 *     are not remotely equivalent - see the causality rule below.
 *  2. The 72 was inherited from bank-credit lateness, an unrelated quantity, and had no
 *     derivation of its own.
 *
 * The replacement asks the domain question instead: what relationship makes an adjustment
 * capable of having affected THIS settlement's net?
 *
 * There is no new invented number here. The window is one settlement cycle, which the
 * model already defines.
 */
export const ADJUSTMENT_ACCRUAL_WINDOW_BUSINESS_DAYS = SETTLEMENT_CYCLE_BUSINESS_DAYS;

/**
 * How long an evidence request stays open before expiring to ESCALATED
 * (specs/STATE_MACHINE.md, REQUESTING_EVIDENCE).
 *
 * Canonical location. This value previously lived as a hardcoded literal in the API
 * layer, which `CONFIGURATION.md` forbids: policy belongs in versioned domain code, not
 * at a transport edge where a deployment could quietly diverge from it.
 */
export const EVIDENCE_REQUEST_EXPIRY_DAYS = 7;

/**
 * Bound on how late a source record may arrive and still attach to an existing case
 * (specs/PRD.md section 20).
 *
 * NOT YET WIRED - late-evidence handling is a later phase. Recorded here as the intended
 * canonical home so the value does not get reinvented at a call site. Flagged in
 * D7_DECISION_TABLE.md rather than left as a silent dead constant.
 */
export const LATE_RECORD_ARRIVAL_MAX_DAYS = 7;

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

const toIst = (at: Date): Date => new Date(at.getTime() + IST_OFFSET_MINUTES * 60_000);

/** Saturday and Sunday are non-business days. No holiday calendar (documented limitation). */
export const isBusinessDay = (istDate: Date): boolean => {
  const day = istDate.getUTCDay();
  return day !== 0 && day !== 6;
};

/**
 * The settlement date for a capture: T+2 business days, where a capture after the
 * 18:00 IST cutoff counts as the next day.
 */
export const expectedSettlementDate = (capturedAt: Date): Date => {
  const ist = toIst(capturedAt);
  let cursor = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
  if (ist.getUTCHours() >= SETTLEMENT_CUTOFF_HOUR_IST) {
    cursor = new Date(cursor.getTime() + MS_PER_DAY);
  }
  let advanced = 0;
  while (advanced < SETTLEMENT_CYCLE_BUSINESS_DAYS) {
    cursor = new Date(cursor.getTime() + MS_PER_DAY);
    if (isBusinessDay(cursor)) advanced += 1;
  }
  return cursor;
};

export const daysBetween = (a: Date, b: Date): number =>
  Math.abs(Math.floor((a.getTime() - b.getTime()) / MS_PER_DAY));

export const hoursBetween = (a: Date, b: Date): number =>
  Math.abs((a.getTime() - b.getTime()) / MS_PER_HOUR);

/** Whether a bank credit landed within the modeled lag of its settlement. */
export const bankCreditWithinExpectedLag = (settlementAt: Date, creditedAt: Date): boolean => {
  const delta = (creditedAt.getTime() - settlementAt.getTime()) / MS_PER_HOUR;
  return delta >= 0 && delta <= BANK_CREDIT_EXPECTED_LAG_HOURS;
};

/** Beyond this, a late bank credit stops being an explanation and becomes an exception. */
export const withinBankCreditLatenessTolerance = (expected: Date, observed: Date): boolean =>
  hoursBetween(expected, observed) <= BANK_CREDIT_LATENESS_TOLERANCE_HOURS;

/**
 * Whether an adjustment is close enough to a settlement to be a possible explanation for
 * it. Amount agreement is not evidence when the lifecycle makes the relationship
 * impossible.
 */
/** n business days before a date, skipping weekends. */
export const businessDaysBefore = (from: Date, days: number): Date => {
  let cursor = new Date(from.getTime());
  let remaining = days;
  while (remaining > 0) {
    cursor = new Date(cursor.getTime() - MS_PER_DAY);
    if (isBusinessDay(cursor)) remaining -= 1;
  }
  return cursor;
};

/**
 * Can this adjustment have affected this settlement's net?
 *
 * Two conditions, in order of strength:
 *
 * CAUSALITY (hard, zero parameters, not tunable)
 *   A settlement's net is struck at `settlementAt`. An adjustment that becomes effective
 *   AFTER that instant cannot have been included in it - it belongs to a later
 *   settlement. This is a lifecycle impossibility, not a tolerance, so there is no value
 *   to choose and nothing to tune. It is what actually catches the "amount matches
 *   exactly but the date makes it impossible" adversarial case.
 *
 * RECENCY (cycle-relative, derived - not invented)
 *   An adjustment effective more than one settlement cycle before this settlement should
 *   already have been carried by an earlier one. Without this bound, any adjustment from
 *   any point in the past could be claimed as an explanation, which is exactly the
 *   unfalsifiable-explanation failure `CAUSE_TAXONOMY.md` guards against.
 *
 * The window is one settlement cycle - a quantity the domain model already defines -
 * rather than a fresh number chosen to produce a convenient residual.
 */
export const adjustmentCanExplainSettlement = (adjustmentAt: Date, settlementAt: Date): boolean => {
  if (adjustmentAt.getTime() > settlementAt.getTime()) return false; // causality
  const windowStart = businessDaysBefore(settlementAt, ADJUSTMENT_ACCRUAL_WINDOW_BUSINESS_DAYS);
  return adjustmentAt.getTime() >= windowStart.getTime(); // recency
};
