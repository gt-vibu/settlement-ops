/**
 * The authentication boundary (specs/AUTHORIZATION_MODEL.md section 10).
 *
 * Everything above this interface is replaceable infrastructure; everything below it
 * is domain code that must never learn how authentication happened. Swapping the demo
 * adapter for OIDC means implementing this interface and changing configuration -
 * nothing in domain, application, persistence or workflow changes.
 */

import type { MerchantId, UserId } from '@settlementops/shared';
import type { RequestContext, Role } from './request-context.js';

export type AuthError =
  | { readonly kind: 'UNAUTHENTICATED'; readonly reason: string }
  | { readonly kind: 'FORBIDDEN'; readonly reason: string };

export interface AuthCredential {
  /** Raw subject assertion from the transport (a header, a token subject, ...). */
  readonly subject: string | undefined;
  /** Optional tenant SELECTOR. Never a grant - validated against stored membership. */
  readonly requestedTenant: string | undefined;
  readonly requestId: string;
  readonly correlationId: string;
}

export interface AuthenticationAdapter {
  authenticate(credential: AuthCredential): Promise<RequestContext | AuthError>;
}

/** A user's stored membership of one merchant. Read from the database, never a request. */
export interface Membership {
  readonly merchantId: MerchantId;
  readonly role: Role;
}

export interface UserDirectory {
  findActiveUser(subject: string): Promise<{ readonly userId: UserId } | null>;
  membershipsOf(userId: UserId): Promise<readonly Membership[]>;
}

export const isAuthError = (value: RequestContext | AuthError): value is AuthError =>
  'kind' in value;
