import { describe, it, expect } from 'vitest';
import { asId, isErr, unwrap, type MerchantId } from '@settlementops/shared';
import { buildLineage, duplicateKey } from './source-record.js';
import { sameScope, trustedMerchantScope } from './merchant-scope.js';

const base = {
  sourceSystem: 'gateway',
  sourceRecordId: 'pay_123',
  observedAt: new Date('2026-03-01T10:00:00Z'),
  ingestedAt: new Date('2026-03-01T10:05:00Z'),
  schemaVersion: 'v1',
};

describe('source lineage', () => {
  it('accepts a well-formed lineage', () => {
    expect(unwrap(buildLineage(base)).sourceRecordId).toBe('pay_123');
  });

  it.each(['sourceSystem', 'sourceRecordId', 'schemaVersion'] as const)(
    'rejects a missing %s',
    (field) => {
      const r = buildLineage({ ...base, [field]: '  ' });
      expect(isErr(r)).toBe(true);
      if (isErr(r)) expect(r.error.kind).toBe('MISSING_FIELD');
    },
  );

  it('rejects ingestion before observation', () => {
    const r = buildLineage({ ...base, ingestedAt: new Date('2026-02-01T00:00:00Z') });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe('IMPOSSIBLE_TIMESTAMP');
  });

  it('rejects an invalid date', () => {
    expect(isErr(buildLineage({ ...base, observedAt: new Date('not-a-date') }))).toBe(true);
  });
});

describe('merchant scope', () => {
  const a = trustedMerchantScope(asId<MerchantId>('m-1'));
  const b = trustedMerchantScope(asId<MerchantId>('m-2'));

  it('compares scopes', () => {
    expect(sameScope(a, a)).toBe(true);
    expect(sameScope(a, b)).toBe(false);
  });

  it('builds a duplicate key that includes the merchant', () => {
    const key = duplicateKey({ id: 'x', scope: a, lineage: base });
    expect(key).toBe('m-1::gateway::pay_123');
    // Two merchants with the same source id must not collide.
    expect(duplicateKey({ id: 'y', scope: b, lineage: base })).not.toBe(key);
  });
});
