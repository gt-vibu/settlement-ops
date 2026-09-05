/**
 * Tenant isolation primitive.
 *
 * Every merchant-owned entity and every merchant-owned repository method requires a
 * MerchantScope. It is deliberately NOT constructible from a raw request value: the
 * only way to obtain one is from a server-built RequestContext (specs/AUTHORIZATION_MODEL.md
 * section 2) or from a trusted system context.
 *
 * This turns "a record belongs to exactly one merchant scope" (specs/DATA_MODEL.md
 * section 5) into a type-level obligation rather than a runtime check someone can
 * forget to write.
 */

import type { MerchantId } from '@settlementops/shared';

declare const scopeBrand: unique symbol;

export interface MerchantScope {
  readonly merchantId: MerchantId;
  readonly [scopeBrand]: 'MerchantScope';
}

/**
 * Trusted constructor. Call sites are limited to:
 *   - the authentication adapter, after resolving stored membership;
 *   - system/worker contexts that inherit a scope from an authenticated request;
 *   - tests.
 * A merchant id taken from a request payload, path parameter, or model output must
 * never reach this function.
 */
export const trustedMerchantScope = (merchantId: MerchantId): MerchantScope =>
  ({ merchantId }) as MerchantScope;

export const sameScope = (a: MerchantScope, b: MerchantScope): boolean =>
  a.merchantId === b.merchantId;
