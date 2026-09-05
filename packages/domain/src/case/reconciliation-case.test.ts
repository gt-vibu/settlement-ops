import { describe, it, expect } from 'vitest';
import { asId, isErr, unwrap, type CaseId, type MerchantId } from '@settlementops/shared';
import { trustedMerchantScope } from '../lineage/merchant-scope.js';
import { money } from '../money/money.js';
import {
  applyTransition,
  invalidateProposal,
  type ReconciliationCase,
} from './reconciliation-case.js';
import type { CaseState } from './case-state.js';

const AT = new Date('2026-08-31T10:00:00Z');

const caseIn = (state: CaseState, version = 1): ReconciliationCase => ({
  id: asId<CaseId>('c0000000-0000-4000-8000-000000000001'),
  scope: trustedMerchantScope(asId<MerchantId>('11111111-1111-4111-8111-111111111111')),
  caseNumber: 'CASE-1',
  state,
  priority: 0,
  discrepancy: money(29_500n, 'INR'),
  deterministicReason: 'net mismatch',
  caseVersion: version,
  openedAt: AT,
  closedAt: null,
});

describe('case transitions', () => {
  it('increments the case version on every transition', () => {
    const before = caseIn('EXCEPTION', 4);
    const after = unwrap(
      applyTransition(before, {
        to: 'INVESTIGATING',
        actor: 'OPERATOR',
        expectedVersion: 4,
        at: AT,
      }),
    );
    expect(after.caseVersion).toBe(5);
    expect(after.state).toBe('INVESTIGATING');
    expect(before.state).toBe('EXCEPTION'); // input untouched
  });

  it('rejects a stale version with VERSION_CONFLICT and changes nothing', () => {
    // specs/SECURITY.md T4: yesterday's approval must not overwrite a newer investigation.
    const current = caseIn('APPROVAL_PENDING', 7);
    const r = applyTransition(current, {
      to: 'APPROVED',
      actor: 'APPROVER',
      expectedVersion: 6,
      at: AT,
    });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe('VERSION_CONFLICT');
  });

  it('rejects an illegal transition even when the actor is privileged', () => {
    const r = applyTransition(caseIn('EXCEPTION'), {
      to: 'STAGED',
      actor: 'ADMIN',
      expectedVersion: 1,
      at: AT,
    });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe('ILLEGAL_TRANSITION');
  });

  it('rejects an unauthorized actor on a legal transition', () => {
    const r = applyTransition(caseIn('APPROVAL_PENDING'), {
      to: 'APPROVED',
      actor: 'OPERATOR',
      expectedVersion: 1,
      at: AT,
    });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe('ACTOR_NOT_PERMITTED');
  });

  it('refuses to close without an outcome record', () => {
    const r = applyTransition(caseIn('OUTCOME_LOGGED'), {
      to: 'CLOSED',
      actor: 'SYSTEM',
      expectedVersion: 1,
      at: AT,
    });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe('OUTCOME_REQUIRED');
  });

  it('closes when the outcome is recorded, and stamps closedAt', () => {
    const closed = unwrap(
      applyTransition(caseIn('OUTCOME_LOGGED'), {
        to: 'CLOSED',
        actor: 'SYSTEM',
        expectedVersion: 1,
        outcomeRecorded: true,
        at: AT,
      }),
    );
    expect(closed.state).toBe('CLOSED');
    expect(closed.closedAt).toEqual(AT);
  });

  it('APPROVED -> CLOSED (action NONE) needs an outcome in the same transaction', () => {
    const withOutcome = unwrap(
      applyTransition(caseIn('APPROVED'), {
        to: 'CLOSED',
        actor: 'SYSTEM',
        expectedVersion: 1,
        outcomeRecorded: true,
        at: AT,
      }),
    );
    expect(withOutcome.state).toBe('CLOSED');
  });

  it('late-evidence invalidation bumps the version so in-flight approvals conflict', () => {
    const pending = caseIn('APPROVAL_PENDING', 3);
    const invalidated = unwrap(invalidateProposal(pending, AT));
    expect(invalidated.state).toBe('INVESTIGATING');
    expect(invalidated.caseVersion).toBe(4);

    const staleApproval = applyTransition(invalidated, {
      to: 'APPROVED',
      actor: 'APPROVER',
      expectedVersion: 3,
      at: AT,
    });
    expect(isErr(staleApproval)).toBe(true);
  });
});
