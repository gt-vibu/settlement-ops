/**
 * Demo authentication adapter (Decision D3).
 *
 * NOT an identity provider. There is no password, session, token, MFA or recovery.
 * It resolves a seeded subject into a RequestContext, and exists so that tenant
 * isolation can be built and tested before a real IdP is chosen.
 *
 * THE SECURITY-CRITICAL PART
 *
 * X-Demo-Tenant-ID is a SELECTOR, never a GRANT. If the header were trusted as
 * supplied, any client could name an arbitrary merchant and read its data - the
 * cross-tenant threat T1 in specs/SECURITY.md and a hard release blocker in
 * specs/PRODUCTION_READINESS.md. So the tenant is always resolved from stored
 * membership:
 *
 *   - one membership   -> use it, header irrelevant;
 *   - many memberships -> the header may CHOOSE among them, and only among them;
 *   - header names a merchant the user does not belong to -> FORBIDDEN.
 *
 * The frontend is never a source of tenant authorization.
 */

import { asId, type CorrelationId, type RequestId } from '@settlementops/shared';
import type {
  AuthCredential,
  AuthError,
  AuthenticationAdapter,
  Membership,
  RequestContext,
  Role,
  UserDirectory,
} from '@settlementops/application';

const rolesFor = (memberships: readonly Membership[], merchantId: string): readonly Role[] =>
  memberships.filter((m) => m.merchantId === merchantId).map((m) => m.role);

export const createDemoAuthAdapter = (directory: UserDirectory): AuthenticationAdapter => ({
  authenticate: async (credential: AuthCredential): Promise<RequestContext | AuthError> => {
    const subject = credential.subject?.trim();
    if (subject === undefined || subject === '') {
      return { kind: 'UNAUTHENTICATED', reason: 'missing subject' };
    }

    const user = await directory.findActiveUser(subject);
    if (user === null) {
      // Unknown and inactive are deliberately indistinguishable to the caller.
      return { kind: 'UNAUTHENTICATED', reason: 'unknown or inactive subject' };
    }

    const memberships = await directory.membershipsOf(user.userId);
    if (memberships.length === 0) {
      return { kind: 'FORBIDDEN', reason: 'user has no merchant membership' };
    }

    const requested = credential.requestedTenant?.trim();
    let tenantId: string;

    if (requested !== undefined && requested !== '') {
      const isMember = memberships.some((m) => m.merchantId === requested);
      if (!isMember) {
        // The header named a tenant this user does not belong to. Refuse; never honour.
        return { kind: 'FORBIDDEN', reason: 'not a member of the requested tenant' };
      }
      tenantId = requested;
    } else {
      const distinct = [...new Set(memberships.map((m) => m.merchantId))];
      const only = distinct[0];
      if (only === undefined) {
        return { kind: 'FORBIDDEN', reason: 'user has no merchant membership' };
      }
      if (distinct.length > 1) {
        return {
          kind: 'FORBIDDEN',
          reason: 'multiple memberships require an explicit tenant selector',
        };
      }
      tenantId = only;
    }

    return {
      userId: user.userId,
      tenantId: asId(tenantId),
      roles: rolesFor(memberships, tenantId),
      requestId: asId<RequestId>(credential.requestId),
      correlationId: asId<CorrelationId>(credential.correlationId),
    };
  },
});
