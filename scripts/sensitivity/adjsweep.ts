import { reconcileUnit } from '@settlementops/domain';
import type { ReconciliationUnit } from '@settlementops/domain';
import {
  CLEAN_NET,
  SETTLED,
  adjustment,
  cleanUnit,
  credit,
  hoursAfter,
  line,
  settlement,
} from './population.js';

const shortfall = 50_000n;
const net = CLEAN_NET - shortfall;
const build = (h: number): ReconciliationUnit =>
  cleanUnit({
    adjustments: [adjustment(-shortfall, hoursAfter(SETTLED, h))],
    settlements: [settlement(net)],
    settlementLines: [line(net)],
    bankCredits: [credit(net)],
  });

console.log('offset from settlement -> OLD(sym 72h) vs NEW(causal+cycle)');
console.log('  settlement is Wed 2026-02-04; accrual window opens Mon 2026-02-02\n');
const offsets = [-720, -168, -96, -72, -48, -24, -1, 0, 1, 24, 72, 73, 96, 168, 720];
for (const h of offsets) {
  const v = reconcileUnit(build(h));
  const oldRule = Math.abs(h) <= 72 ? 'RECONCILED' : 'EXCEPTION';
  const flag = oldRule !== v.outcome ? '   <-- CHANGED' : '';
  console.log(
    `  ${String(h).padStart(5)}h  old=${oldRule.padEnd(11)} new=${v.outcome.padEnd(11)}` +
      ` ${(v.reasons.join(',') || '-').padEnd(24)}${flag}`,
  );
}
