/**
 * The freeze pin.
 *
 * These assertions exist so that a later edit to a financial constant breaks the build
 * instead of silently invalidating an already-scored benchmark (`EVALUATION.md` §19).
 * If one of these fails, the correct response is a `CHANGE_CONTROL.md` record and a new
 * experiment version - never an edit to this file.
 */

import { describe, expect, it } from 'vitest';
import {
  AMOUNT_MATCH_TOLERANCE_MINOR,
  ADJUSTMENT_ACCRUAL_WINDOW_BUSINESS_DAYS,
  BANK_CREDIT_EXPECTED_LAG_HOURS,
  EVIDENCE_REQUEST_EXPIRY_DAYS,
  FEE_SCHEDULES,
  NEAR_DUPLICATE_WINDOW_SECONDS,
  POLICY_APPROVAL_STATUS,
  POLICY_VERSION,
  REFUND_NETTING_MAX_CYCLES,
  ROUNDING_TOLERANCE_ABSOLUTE_CAP_MINOR,
  ROUNDING_TOLERANCE_PER_RECORD_MINOR,
  SETTLEMENT_CUTOFF_HOUR_IST,
  SETTLEMENT_CYCLE_BUSINESS_DAYS,
  SETTLEMENT_DATE_MATCH_TOLERANCE_DAYS,
} from './index.js';

describe('frozen policy', () => {
  it('is approved at version 1.0.0', () => {
    expect(POLICY_VERSION).toBe('1.0.0');
    expect(POLICY_APPROVAL_STATUS).toBe('APPROVED');
  });

  it('pins the tolerances', () => {
    expect(ROUNDING_TOLERANCE_PER_RECORD_MINOR).toBe(2n);
    expect(ROUNDING_TOLERANCE_ABSOLUTE_CAP_MINOR).toBe(100n);
    expect(AMOUNT_MATCH_TOLERANCE_MINOR).toBe(0n);
    expect(SETTLEMENT_DATE_MATCH_TOLERANCE_DAYS).toBe(1);
    expect(NEAR_DUPLICATE_WINDOW_SECONDS).toBe(60);
  });

  it('pins the timing windows', () => {
    expect(SETTLEMENT_CYCLE_BUSINESS_DAYS).toBe(2);
    expect(SETTLEMENT_CUTOFF_HOUR_IST).toBe(18);
    expect(REFUND_NETTING_MAX_CYCLES).toBe(2);
    expect(BANK_CREDIT_EXPECTED_LAG_HOURS).toBe(24);
    expect(EVIDENCE_REQUEST_EXPIRY_DAYS).toBe(7);
    // Derived, not independently invented: the accrual window IS one settlement cycle.
    expect(ADJUSTMENT_ACCRUAL_WINDOW_BUSINESS_DAYS).toBe(SETTLEMENT_CYCLE_BUSINESS_DAYS);
  });

  it('pins both fee schedule versions', () => {
    expect(FEE_SCHEDULES).toHaveLength(2);
    const [v1, v2] = FEE_SCHEDULES;
    expect(v1?.id).toBe('fee-schedule-v1');
    expect(v1?.effectiveFrom.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(v1?.feeRateBps).toEqual({ CARD: 250, NETBANKING: 190, UPI: 0, WALLET: 200 });
    expect(v1?.taxOnFeeBps).toBe(1800);

    expect(v2?.id).toBe('fee-schedule-v2');
    expect(v2?.effectiveFrom.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(v2?.feeRateBps).toEqual({ CARD: 230, NETBANKING: 190, UPI: 0, WALLET: 200 });
    expect(v2?.taxOnFeeBps).toBe(1800);
  });
});
