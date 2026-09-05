import { describe, it, expect } from 'vitest';
import {
  asId,
  type CorrelationId,
  type MerchantId,
  type RequestId,
  type UserId,
} from '@settlementops/shared';
import { hasAtLeast, hasRole, scopeOf, type RequestContext } from './request-context.js';

const ctx = (roles: RequestContext['roles']): RequestContext => ({
  userId: asId<UserId>('u-1'),
  tenantId: asId<MerchantId>('m-1'),
  roles,
  requestId: asId<RequestId>('r-1'),
  correlationId: asId<CorrelationId>('c-1'),
});

describe('RequestContext', () => {
  it('derives a merchant scope from the context, not from a request value', () => {
    expect(scopeOf(ctx(['OPERATOR'])).merchantId).toBe('m-1');
  });

  it('checks an exact role', () => {
    expect(hasRole(ctx(['APPROVER']), 'APPROVER')).toBe(true);
    expect(hasRole(ctx(['OPERATOR']), 'APPROVER')).toBe(false);
  });

  it('treats ADMIN as satisfying APPROVER and OPERATOR', () => {
    expect(hasAtLeast(ctx(['ADMIN']), 'APPROVER')).toBe(true);
    expect(hasAtLeast(ctx(['ADMIN']), 'OPERATOR')).toBe(true);
  });

  it('does not let an OPERATOR satisfy APPROVER', () => {
    // Separation of duty: starting an investigation is not authority to approve it.
    expect(hasAtLeast(ctx(['OPERATOR']), 'APPROVER')).toBe(false);
  });
});
