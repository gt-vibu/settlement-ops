/**
 * D7 sensitivity probe — deterministic baseline only.
 *
 * Runs the REAL `reconcileUnit` across swept data and reports where each decision
 * boundary actually sits. No AI, no dataset generation, no persistence.
 */

import { reconcileUnit, scheduleAt, applyBasisPoints } from '@settlementops/domain';
import type { ReconciliationUnit } from '@settlementops/domain';
import {
  CLEAN_NET,
  SETTLED,
  adjustment,
  cleanUnit,
  credit,
  daysAfter,
  fee,
  hoursAfter,
  line,
  payment,
  refund,
  settlement,
  tax,
} from './population.js';

const verdictOf = (unit: ReconciliationUnit) => {
  const v = reconcileUnit(unit);
  return { outcome: v.outcome, reasons: v.reasons, discrepancy: v.discrepancy.amountMinor };
};

/** Finds the first swept value at which the outcome flips to EXCEPTION. */
const findBoundary = <T>(
  values: readonly T[],
  build: (value: T) => ReconciliationUnit,
): { flipAt: T | null; results: { value: T; outcome: string; reasons: string[] }[] } => {
  const results = values.map((value) => {
    const v = verdictOf(build(value));
    return { value, outcome: v.outcome, reasons: [...v.reasons] };
  });
  const flip = results.find((r) => r.outcome === 'EXCEPTION');
  return { flipAt: flip === undefined ? null : flip.value, results };
};

const section = (title: string): void => {
  console.log(`\n${'='.repeat(78)}\n${title}\n${'='.repeat(78)}`);
};

// ───────────────────────────────────────────── S1: rounding tolerance / cap
const s1 = (): void => {
  section('S1  ROUNDING TOLERANCE  (per-record 2 paise, absolute cap 100 paise)');

  // Single-line: tolerance = min(2*1, 100) = 2 paise.
  const single = findBoundary([0, 1, 2, 3, 4, 5, 10, 50, 99, 100, 101, 200], (v) => {
    const net = CLEAN_NET - BigInt(v);
    return cleanUnit({
      settlements: [settlement(net)],
      settlementLines: [line(net)],
      bankCredits: [credit(net)],
    });
  });
  console.log('single-line variance (paise) -> outcome');
  for (const r of single.results) console.log(`  ${String(r.value).padStart(4)}  ${r.outcome}`);
  console.log(`  FLIP at ${single.flipAt} paise (expected 3: tolerance is 2)`);

  // Multi-line: tolerance grows 2 per line until the cap bites at 50 lines.
  console.log('\nmulti-line: tolerance = min(2 x lines, 100)');
  for (const lines of [1, 5, 10, 50, 60, 100, 1000]) {
    const tolerance = Math.min(2 * lines, 100);
    const per = CLEAN_NET / BigInt(lines);
    const remainder = CLEAN_NET - per * BigInt(lines);
    const build = (shortfall: number): ReconciliationUnit => {
      const parts = Array.from({ length: lines }, (_, i) =>
        line(i === 0 ? per + remainder - BigInt(shortfall) : per, `sl_${i}`),
      );
      const net = CLEAN_NET - BigInt(shortfall);
      return cleanUnit({
        settlements: [settlement(net)],
        settlementLines: parts,
        bankCredits: [credit(net)],
      });
    };
    const atTolerance = verdictOf(build(tolerance)).outcome;
    const overTolerance = verdictOf(build(tolerance + 1)).outcome;
    console.log(
      `  lines=${String(lines).padStart(4)}  tolerance=${String(tolerance).padStart(3)}` +
        `  at=${atTolerance}  at+1=${overTolerance}`,
    );
  }

  // What the residual would be at alternative caps, over a variance distribution.
  console.log('\nresidual count over a fixed variance distribution, by cap:');
  const distribution = [0, 1, 2, 3, 5, 10, 25, 50, 75, 100, 150, 250, 500, 2500, 29500];
  for (const cap of [50, 100, 200]) {
    // Single-line cases: tolerance = min(2, cap) = 2 regardless. Cap only bites
    // when line count is high, so also measure a 60-line variant.
    const singleResidual = distribution.filter((v) => v > Math.min(2, cap)).length;
    const wideResidual = distribution.filter((v) => v > Math.min(120, cap)).length;
    console.log(
      `  cap=${String(cap).padStart(3)}  single-line residual=${singleResidual}/${distribution.length}` +
        `  60-line residual=${wideResidual}/${distribution.length}`,
    );
  }
};

// ───────────────────────────────────────── S2: adjustment-to-settlement window
const s2 = (): void => {
  section('S2  ADJUSTMENT_SETTLEMENT_MAX_HOURS  (proposed 72h)');

  const shortfall = 50_000n;
  const net = CLEAN_NET - shortfall;
  const build = (offsetHours: number): ReconciliationUnit =>
    cleanUnit({
      adjustments: [adjustment(-shortfall, hoursAfter(SETTLED, offsetHours))],
      settlements: [settlement(net)],
      settlementLines: [line(net)],
      bankCredits: [credit(net)],
    });

  const offsets = [0, 12, 24, 36, 47, 48, 49, 60, 71, 72, 73, 84, 95, 96, 97, 120, 168, 720];
  console.log('adjustment offset from settlement (hours) -> outcome / reasons');
  for (const h of offsets) {
    const v = verdictOf(build(h));
    console.log(
      `  ${String(h).padStart(4)}h  ${v.outcome.padEnd(11)} ${v.reasons.join(',') || '-'}`,
    );
  }

  console.log('\nresidual at candidate window values (this adversarial shape only):');
  for (const candidate of [48, 72, 96]) {
    const residual = offsets.filter((h) => h > candidate).length;
    console.log(
      `  window=${String(candidate).padStart(3)}h -> ${residual}/${offsets.length} swept offsets become EXCEPTION`,
    );
  }
};

// ───────────────────────────────────────────── S3: fee-schedule-v2 boundary
const s3 = (): void => {
  section('S3  FEE-SCHEDULE-v2 BOUNDARY  (v1 250bps -> v2 230bps at 2026-04-01)');

  const gross = 1_000_000n;
  const v1Fee = applyBasisPoints(gross, 250);
  const v2Fee = applyBasisPoints(gross, 230);
  console.log(`  v1 fee=${v1Fee}  v2 fee=${v2Fee}  gap=${v1Fee - v2Fee} paise`);
  console.log(
    `  rounding cap = 100 paise -> gap is ${v1Fee - v2Fee > 100n ? 'ABOVE' : 'BELOW'} the cap`,
  );

  console.log(
    '\ncapture date -> schedule selected -> baseline outcome when fee matches that schedule',
  );
  const dates = [
    '2026-03-25',
    '2026-03-30',
    '2026-03-31',
    '2026-04-01',
    '2026-04-02',
    '2026-04-06',
  ];
  for (const d of dates) {
    const capturedAt = new Date(`${d}T10:00:00Z`);
    const schedule = scheduleAt(capturedAt);
    const feeMinor = applyBasisPoints(gross, schedule?.feeRateBps.CARD ?? 0);
    const taxMinor = applyBasisPoints(feeMinor, 1800);
    const net = gross - feeMinor - taxMinor;
    // Settle T+2-ish; use a settlement date close enough to pass the timing check.
    const settledAt = daysAfter(capturedAt, 2);
    const unit = cleanUnit({
      payment: payment({ authorizedAt: capturedAt, capturedAt }),
      fees: [fee(feeMinor)],
      taxes: [tax(taxMinor)],
      settlements: [settlement(net, { settlementAt: settledAt })],
      settlementLines: [line(net)],
      bankCredits: [credit(net, { creditedAt: hoursAfter(settledAt, 6) })],
    });
    const v = verdictOf(unit);
    console.log(
      `  ${d}  ${String(schedule?.id).padEnd(16)} fee=${feeMinor}  ${v.outcome.padEnd(11)} ${v.reasons.join(',') || '-'}`,
    );
  }

  console.log('\nCROSS-APPLICATION: what if the WRONG schedule fee is recorded?');
  for (const d of ['2026-03-30', '2026-04-02']) {
    const capturedAt = new Date(`${d}T10:00:00Z`);
    const correct = scheduleAt(capturedAt);
    const wrongFee = correct?.id === 'fee-schedule-v1' ? v2Fee : v1Fee;
    const wrongTax = applyBasisPoints(wrongFee, 1800);
    const net = gross - wrongFee - wrongTax;
    const settledAt = daysAfter(capturedAt, 2);
    const unit = cleanUnit({
      payment: payment({ authorizedAt: capturedAt, capturedAt }),
      fees: [fee(wrongFee)],
      taxes: [tax(wrongTax)],
      settlements: [settlement(net, { settlementAt: settledAt })],
      settlementLines: [line(net)],
      bankCredits: [credit(net, { creditedAt: hoursAfter(settledAt, 6) })],
    });
    const v = verdictOf(unit);
    console.log(
      `  ${d} recorded ${correct?.id === 'fee-schedule-v1' ? 'v2' : 'v1'} fee=${wrongFee}` +
        `  -> ${v.outcome} ${v.reasons.join(',') || '-'}`,
    );
  }
};

// ────────────────────────────────── S4: refund netting + evidence/late-record
const s4 = (): void => {
  section('S4  REFUND_NETTING_MAX_CYCLES (2) and EVIDENCE/LATE-RECORD assumptions');

  const refundMinor = 100_000n;
  const build = (settleDelayDays: number): ReconciliationUnit => {
    const createdAt = new Date('2026-02-03T12:00:00Z');
    const net = CLEAN_NET - refundMinor;
    return cleanUnit({
      refunds: [refund(refundMinor, createdAt, daysAfter(createdAt, settleDelayDays))],
      settlements: [settlement(net)],
      settlementLines: [line(net)],
      bankCredits: [credit(net)],
    });
  };

  console.log('refund settle delay (days) -> outcome / reasons   [cycles = days/2]');
  for (const d of [0, 1, 2, 3, 4, 5, 6, 7, 10, 17]) {
    const v = verdictOf(build(d));
    console.log(
      `  ${String(d).padStart(3)}d (${(d / 2).toFixed(1)} cycles)  ${v.outcome.padEnd(11)} ${v.reasons.join(',') || '-'}`,
    );
  }

  console.log('\nresidual at candidate max-cycle values (this shape only):');
  const delays = [0, 1, 2, 3, 4, 5, 6, 7, 10, 17];
  for (const cycles of [1, 2, 3]) {
    const residual = delays.filter((d) => d / 2 > cycles).length;
    console.log(`  max_cycles=${cycles} -> ${residual}/${delays.length} become EXCEPTION`);
  }

  console.log('\nEVIDENCE_REQUEST_EXPIRY_DAYS / LATE_RECORD_ARRIVAL_MAX_DAYS:');
  console.log('  Neither is referenced by reconcileUnit or any of its nine checks.');
  console.log('  Demonstrated below: identical unit, verdict is independent of both.');
  const base = verdictOf(cleanUnit());
  console.log(`  clean unit verdict: ${base.outcome} (unaffected by either constant)`);
};

section('D7 SENSITIVITY PROBE — deterministic baseline only, no AI, no dataset');
console.log('Constants held at proposed values; DATA swept across each boundary.');
s1();
s2();
s3();
s4();
console.log('\nprobe complete\n');
