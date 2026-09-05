/**
 * Duplicate detection (specs/BASELINES.md, FAILURE_TAXONOMY.md).
 *
 * Two independent checks:
 *   1. exact  - the same (merchant, source system, source record id) delivered twice;
 *   2. near   - the same payment, amount and type within a short window, which is what
 *               a redelivered webhook looks like.
 *
 * Duplicates must never double-count into a financial total, so this runs before the
 * matcher rather than as a later cleanup.
 */

import { duplicateKey, type SourceRecordIdentity } from '../lineage/source-record.js';
import { NEAR_DUPLICATE_WINDOW_SECONDS } from '../policy/tolerances.js';
import type { FinancialRecord } from '../records/financial-records.js';

export interface DuplicateGroup {
  readonly key: string;
  readonly ids: readonly string[];
  readonly detection: 'EXACT_SOURCE_ID' | 'NEAR_DUPLICATE';
}

const identityOf = (record: FinancialRecord): SourceRecordIdentity => ({
  id: record.id,
  scope: record.scope,
  lineage: record.lineage,
});

export const findExactDuplicates = (
  records: readonly FinancialRecord[],
): readonly DuplicateGroup[] => {
  const byKey = new Map<string, string[]>();
  for (const record of records) {
    const key = duplicateKey(identityOf(record));
    const existing = byKey.get(key);
    if (existing === undefined) byKey.set(key, [record.id]);
    else existing.push(record.id);
  }
  return [...byKey.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key, ids, detection: 'EXACT_SOURCE_ID' as const }));
};

const nearKey = (record: FinancialRecord): string | null => {
  if (record.kind === 'REFUND') {
    return `REFUND::${record.paymentId}::${record.amount.amountMinor}`;
  }
  if (record.kind === 'PAYMENT') {
    return `PAYMENT::${record.paymentId}::${record.amount.amountMinor}`;
  }
  return null;
};

export const findNearDuplicates = (
  records: readonly FinancialRecord[],
): readonly DuplicateGroup[] => {
  const byKey = new Map<string, FinancialRecord[]>();
  for (const record of records) {
    const key = nearKey(record);
    if (key === null) continue;
    const existing = byKey.get(key);
    if (existing === undefined) byKey.set(key, [record]);
    else existing.push(record);
  }

  const groups: DuplicateGroup[] = [];
  const windowMs = NEAR_DUPLICATE_WINDOW_SECONDS * 1000;

  for (const [key, candidates] of byKey.entries()) {
    if (candidates.length < 2) continue;
    const sorted = [...candidates].sort(
      (a, b) => a.lineage.observedAt.getTime() - b.lineage.observedAt.getTime(),
    );
    const cluster: string[] = [];
    let anchor: number | null = null;
    for (const record of sorted) {
      const t = record.lineage.observedAt.getTime();
      if (anchor === null) {
        anchor = t;
        cluster.push(record.id);
      } else if (t - anchor <= windowMs) {
        cluster.push(record.id);
      }
    }
    if (cluster.length > 1) {
      groups.push({ key, ids: cluster, detection: 'NEAR_DUPLICATE' });
    }
  }
  return groups;
};

export const detectDuplicates = (
  records: readonly FinancialRecord[],
): readonly DuplicateGroup[] => [...findExactDuplicates(records), ...findNearDuplicates(records)];
