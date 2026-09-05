/**
 * Verifier tests.
 *
 * These are the safety tests. Each one asserts that a plausible-looking but unsupported
 * resolution is REFUSED, and that refusal always lands on the safe outcome rather than an
 * error someone could handle by retrying.
 */

import { describe, expect, it } from 'vitest';
import { money, trustedMerchantScope, type ReconciliationUnit } from '@settlementops/domain';
import { asId, type MerchantId, type PaymentId } from '@settlementops/shared';

import { verify, type Proposal } from './verifier.js';

const scope = trustedMerchantScope(asId<MerchantId>('11111111-1111-4111-8111-111111111111'));

const lineage = {
  sourceSystem: 'gw',
  sourceRecordId: 'src',
  observedAt: new Date(0),
  ingestedAt: new Date(0),
  schemaVersion: 'v1',
};

const base = { scope, lineage };

const unitWith = (overrides: Partial<ReconciliationUnit> = {}): ReconciliationUnit =>
  ({
    payment: {
      ...base,
      id: 'p1',
      kind: 'PAYMENT',
      paymentId: asId('pay_1'),
      orderId: null,
      amount: money(1_000_000n, 'INR'),
      paymentMethod: 'CARD',
      status: 'CAPTURED',
      authorizedAt: new Date('2026-02-02T09:00:00Z'),
      capturedAt: new Date('2026-02-02T10:00:00Z'),
    },
    fees: [],
    taxes: [],
    refunds: [],
    adjustments: [],
    settlements: [],
    settlementLines: [],
    bankCredits: [],
    duplicates: [],
    ...overrides,
  }) as ReconciliationUnit;

const proposal = (over: Partial<Proposal> = {}): Proposal => ({
  cause: 'MDR_FEE',
  disposition: 'RESOLVE',
  evidenceRecordIds: ['p1'],
  rationale: 'test',
  ...over,
});

describe('verifier', () => {
  it('never lets AMBIGUOUS resolve, whatever the evidence', () => {
    const result = verify(proposal({ cause: 'AMBIGUOUS' }), unitWith());
    expect(result.passed).toBe(false);
    expect(result.failures).toContain('CAUSE_NOT_PERMITTED_TO_RESOLVE');
    expect(result.effectiveDisposition).toBe('ESCALATE');
  });

  it('refuses a resolution that cites no evidence', () => {
    const result = verify(proposal({ evidenceRecordIds: [] }), unitWith());
    expect(result.failures).toContain('EVIDENCE_MISSING');
    expect(result.effectiveDisposition).toBe('ESCALATE');
  });

  it('refuses a resolution citing records outside the case', () => {
    const result = verify(
      proposal({ evidenceRecordIds: ['p1', 'somebody-elses-record'] }),
      unitWith(),
    );
    expect(result.failures).toContain('EVIDENCE_NOT_IN_SCOPE');
  });

  it('downgrades rather than erroring, so a rejected proposal still reaches a human', () => {
    const result = verify(proposal({ cause: 'COMPOUND' }), unitWith());
    expect(result.passed).toBe(false);
    expect(result.effectiveDisposition).toBe('ESCALATE');
  });

  it('passes a non-RESOLVE proposal through untouched: there is nothing to substantiate', () => {
    const result = verify(proposal({ disposition: 'ESCALATE' }), unitWith());
    expect(result.passed).toBe(true);
    expect(result.effectiveDisposition).toBe('ESCALATE');
  });

  it('refuses ROUNDING_DRIFT beyond the absolute cap, however small it looks relatively', () => {
    const unit = unitWith({
      settlements: [
        {
          ...base,
          id: 's1',
          kind: 'SETTLEMENT',
          settlementId: asId('set_1'),
          settlementBatchId: null,
          grossAmount: money(1_000_000n, 'INR'),
          netAmount: money(999_000n, 'INR'),
          settlementAt: new Date('2026-02-04T00:00:00Z'),
          status: 'PROCESSED',
          utr: 'UTR1',
        },
      ],
      settlementLines: [
        {
          ...base,
          id: 'l1',
          kind: 'SETTLEMENT_LINE',
          settlementId: asId('set_1'),
          paymentId: asId<PaymentId>('pay_1'),
          refundId: null,
          lineType: 'PAYMENT',
          amount: money(999_000n, 'INR'),
        },
      ],
    });
    // 1,000 minor units of variance: ten times the ceiling rounding may ever explain.
    const result = verify(
      proposal({ cause: 'ROUNDING_DRIFT', evidenceRecordIds: ['p1', 'l1'] }),
      unit,
    );
    expect(result.failures).toContain('ROUNDING_EXCEEDS_CAP');
    expect(result.effectiveDisposition).toBe('ESCALATE');
  });

  it('refuses UTR_SPLIT when only one settlement leg exists', () => {
    const result = verify(proposal({ cause: 'UTR_SPLIT' }), unitWith());
    expect(result.failures).toContain('CAUSE_NOT_SUPPORTED_BY_EVIDENCE');
  });

  it('refuses REFUND_NETTING when no refund exists at all', () => {
    const result = verify(proposal({ cause: 'REFUND_NETTING' }), unitWith());
    expect(result.failures).toContain('EVIDENCE_MISSING');
  });
});

describe('evidence provenance', () => {
  it('rejects a citation to a record that exists but was never retrieved', () => {
    const result = verify(
      proposal({
        evidenceRecordIds: ['p1'],
        // The investigation retrieved nothing, so citing a real record is still a
        // fabricated citation.
        retrievedRecordIds: [],
      }),
      unitWith(),
    );
    expect(result.failures).toContain('EVIDENCE_NOT_RETRIEVED');
    expect(result.effectiveDisposition).toBe('ESCALATE');
  });

  it('rejects a fabricated record id even when retrieval is claimed', () => {
    const result = verify(
      proposal({
        evidenceRecordIds: ['does-not-exist'],
        retrievedRecordIds: ['does-not-exist'],
      }),
      unitWith(),
    );
    expect(result.failures).toContain('EVIDENCE_NOT_IN_SCOPE');
  });

  it('accepts a citation that was genuinely retrieved', () => {
    const result = verify(
      proposal({ evidenceRecordIds: ['p1'], retrievedRecordIds: ['p1'], cause: 'ROUNDING_DRIFT' }),
      unitWith(),
    );
    expect(result.failures).not.toContain('EVIDENCE_NOT_RETRIEVED');
  });

  it('skips the check for systems that run no investigation loop', () => {
    // The deterministic baseline cites the verdict's own record set; there is no
    // retrieval step to compare against, and inventing one would be theatre.
    const result = verify(proposal({ cause: 'ROUNDING_DRIFT' }), unitWith());
    expect(result.failures).not.toContain('EVIDENCE_NOT_RETRIEVED');
  });
});
