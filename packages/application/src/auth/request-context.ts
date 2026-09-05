/**
 * RequestContext - the single trusted authorization value in the system
 * (specs/AUTHORIZATION_MODEL.md v2.0.0 section 2).
 *
 * Only the authentication adapter may construct one. It is immutable, and every
 * application use case touching merchant-owned data takes it as a required parameter,
 * so omitting it is a compile error rather than a runtime oversight.
 *
 * tenantId is resolved SERVER-SIDE from stored membership. A tenant id supplied by a
 * client - or by the model - is data, never a grant.
 */

import type { CorrelationId, MerchantId, RequestId, UserId } from '@settlementops/shared';
import { type MerchantScope, trustedMerchantScope } from '@settlementops/domain';

export const ROLES = ['OPERATOR', 'APPROVER', 'ADMIN'] as const;

export type Role = (typeof ROLES)[number];

export const isRole = (value: string): value is Role =>
  (ROLES as readonly string[]).includes(value);

export interface RequestContext {
  readonly userId: UserId;
  readonly tenantId: MerchantId;
  readonly roles: readonly Role[];
  readonly requestId: RequestId;
  readonly correlationId: CorrelationId;
}

/** The only sanctioned way to derive a repository scope. */
export const scopeOf = (ctx: RequestContext): MerchantScope => trustedMerchantScope(ctx.tenantId);

export const hasRole = (ctx: RequestContext, role: Role): boolean => ctx.roles.includes(role);

/** ADMIN implies APPROVER implies OPERATOR. */
const RANK: Readonly<Record<Role, number>> = { OPERATOR: 1, APPROVER: 2, ADMIN: 3 };

export const hasAtLeast = (ctx: RequestContext, minimum: Role): boolean =>
  ctx.roles.some((r) => RANK[r] >= RANK[minimum]);
