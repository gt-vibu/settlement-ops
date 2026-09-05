import { describe, it, expect } from 'vitest';
import { asId, type MerchantId, type UserId } from '@settlementops/shared';
import { isAuthError, type Membership, type UserDirectory } from '@settlementops/application';
import { createDemoAuthAdapter } from './demo-adapter.js';

const MERCHANT_A = asId<MerchantId>('11111111-1111-4111-8111-111111111111');
const MERCHANT_B = asId<MerchantId>('22222222-2222-4222-8222-222222222222');
const USER = asId<UserId>('aaaaaaaa-0000-4000-8000-000000000001');

const directory = (
  users: Record<string, UserId>,
  memberships: Record<string, readonly Membership[]>,
): UserDirectory => ({
  findActiveUser: async (subject) =>
    users[subject] === undefined ? null : { userId: users[subject] as UserId },
  membershipsOf: async (userId) => memberships[userId] ?? [],
});

const singleTenant = createDemoAuthAdapter(
  directory({ 'demo-operator': USER }, { [USER]: [{ merchantId: MERCHANT_A, role: 'OPERATOR' }] }),
);

const multiTenant = createDemoAuthAdapter(
  directory(
    { 'demo-approver': USER },
    {
      [USER]: [
        { merchantId: MERCHANT_A, role: 'APPROVER' },
        { merchantId: MERCHANT_B, role: 'OPERATOR' },
      ],
    },
  ),
);

const credential = (subject?: string, requestedTenant?: string) => ({
  subject,
  requestedTenant,
  requestId: 'req-1',
  correlationId: 'corr-1',
});

describe('demo authentication', () => {
  it('resolves a seeded subject to a server-built context', async () => {
    const result = await singleTenant.authenticate(credential('demo-operator'));
    expect(isAuthError(result)).toBe(false);
    if (!isAuthError(result)) {
      expect(result.userId).toBe(USER);
      expect(result.tenantId).toBe(MERCHANT_A);
      expect(result.roles).toEqual(['OPERATOR']);
    }
  });

  it('rejects a missing subject', async () => {
    const result = await singleTenant.authenticate(credential(undefined));
    expect(isAuthError(result) && result.kind).toBe('UNAUTHENTICATED');
  });

  it('rejects an unknown or inactive subject', async () => {
    const result = await singleTenant.authenticate(credential('nobody'));
    expect(isAuthError(result) && result.kind).toBe('UNAUTHENTICATED');
  });

  it('rejects a user with no membership', async () => {
    const adapter = createDemoAuthAdapter(directory({ x: USER }, {}));
    const result = await adapter.authenticate(credential('x'));
    expect(isAuthError(result) && result.kind).toBe('FORBIDDEN');
  });
});

/**
 * These are the tests that protect readiness decision D3-R1.
 *
 * If X-Demo-Tenant-ID were trusted as supplied, any caller could name a merchant and
 * read its data. Tenant must always be resolved from stored membership.
 */
describe('tenant selector is never a grant (D3-R1)', () => {
  it('IGNORES a tenant header naming a merchant the user does not belong to', async () => {
    const result = await singleTenant.authenticate(credential('demo-operator', MERCHANT_B));
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) expect(result.kind).toBe('FORBIDDEN');
  });

  it('never returns a tenant that is absent from stored membership', async () => {
    const forged = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const result = await multiTenant.authenticate(credential('demo-approver', forged));
    expect(isAuthError(result)).toBe(true);
  });

  it('honours the header only to CHOOSE among memberships the user already has', async () => {
    const asA = await multiTenant.authenticate(credential('demo-approver', MERCHANT_A));
    const asB = await multiTenant.authenticate(credential('demo-approver', MERCHANT_B));
    expect(!isAuthError(asA) && asA.tenantId).toBe(MERCHANT_A);
    expect(!isAuthError(asA) && asA.roles).toEqual(['APPROVER']);
    expect(!isAuthError(asB) && asB.tenantId).toBe(MERCHANT_B);
    // Role is per-membership: the same user is not an APPROVER in merchant B.
    expect(!isAuthError(asB) && asB.roles).toEqual(['OPERATOR']);
  });

  it('ignores the header entirely when the user has exactly one membership', async () => {
    const result = await singleTenant.authenticate(credential('demo-operator', MERCHANT_A));
    expect(!isAuthError(result) && result.tenantId).toBe(MERCHANT_A);
  });

  it('refuses to guess when a user has several memberships and names none', async () => {
    const result = await multiTenant.authenticate(credential('demo-approver'));
    expect(isAuthError(result) && result.kind).toBe('FORBIDDEN');
  });

  it('grants only the roles held in the resolved tenant', async () => {
    const result = await multiTenant.authenticate(credential('demo-approver', MERCHANT_B));
    expect(!isAuthError(result) && result.roles).not.toContain('APPROVER');
  });
});
