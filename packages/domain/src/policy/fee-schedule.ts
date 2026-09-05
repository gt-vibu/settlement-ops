/**
 * Fee and tax schedule (EXPERIMENT_CONSTANTS.md section 2 - PROPOSED).
 *
 * The rates are reverse-engineered from the specification's own worked example, which
 * appears twice and agrees with itself:
 *   DEMO_SCENARIOS.md scenario 1  : 10,000.00 payment -> 250.00 fee, 45.00 tax
 *   ARCHITECTURE.md section 16    : 1_000_000 -> 25_000 -> 4_500
 * 250/10_000 = 2.50%; 45/250 = 18.00%.
 *
 * Two effective-dated versions exist so that `get_fee_schedule` has real work to do and
 * a payment near the boundary is genuinely ambiguous. That difficulty is deliberate and
 * observable to a real operator, so it is not label leakage.
 */

export const PAYMENT_METHODS = ['CARD', 'NETBANKING', 'UPI', 'WALLET'] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const isPaymentMethod = (value: string): value is PaymentMethod =>
  (PAYMENT_METHODS as readonly string[]).includes(value);

export interface FeeScheduleVersion {
  readonly id: string;
  readonly effectiveFrom: Date;
  readonly feeRateBps: Readonly<Record<PaymentMethod, number>>;
  readonly taxOnFeeBps: number;
}

/** 18% GST applied to the fee amount, not to gross. */
const GST_BPS = 1_800;

export const FEE_SCHEDULES: readonly FeeScheduleVersion[] = [
  {
    id: 'fee-schedule-v1',
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    feeRateBps: { CARD: 250, NETBANKING: 190, UPI: 0, WALLET: 200 },
    taxOnFeeBps: GST_BPS,
  },
  {
    id: 'fee-schedule-v2',
    effectiveFrom: new Date('2026-04-01T00:00:00Z'),
    feeRateBps: { CARD: 230, NETBANKING: 190, UPI: 0, WALLET: 200 },
    taxOnFeeBps: GST_BPS,
  },
];

/** The schedule in force at a point in time, or null if the date predates all schedules. */
export const scheduleAt = (at: Date): FeeScheduleVersion | null => {
  let selected: FeeScheduleVersion | null = null;
  for (const schedule of FEE_SCHEDULES) {
    if (schedule.effectiveFrom.getTime() <= at.getTime()) {
      if (
        selected === null ||
        schedule.effectiveFrom.getTime() > selected.effectiveFrom.getTime()
      ) {
        selected = schedule;
      }
    }
  }
  return selected;
};

export const scheduleById = (id: string): FeeScheduleVersion | null =>
  FEE_SCHEDULES.find((s) => s.id === id) ?? null;
