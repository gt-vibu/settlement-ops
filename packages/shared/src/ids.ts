/**
 * Branded identifier types.
 *
 * Branding is a compile-time safety device: a PaymentId cannot be passed where a
 * CaseId is expected, even though both are strings at runtime. This matters because
 * a great deal of this system's safety rests on never confusing one entity's scope
 * for another's (specs/DATA_MODEL.md section 5).
 */

declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type MerchantId = Brand<string, 'MerchantId'>;
export type UserId = Brand<string, 'UserId'>;
export type OrderId = Brand<string, 'OrderId'>;
export type PaymentId = Brand<string, 'PaymentId'>;
export type RefundId = Brand<string, 'RefundId'>;
export type SettlementId = Brand<string, 'SettlementId'>;
export type SettlementBatchId = Brand<string, 'SettlementBatchId'>;
export type CaseId = Brand<string, 'CaseId'>;
export type AgentRunId = Brand<string, 'AgentRunId'>;
export type ProposalId = Brand<string, 'ProposalId'>;
export type StagedActionId = Brand<string, 'StagedActionId'>;
export type EvidenceId = Brand<string, 'EvidenceId'>;
export type AuditEventId = Brand<string, 'AuditEventId'>;
export type RequestId = Brand<string, 'RequestId'>;
export type CorrelationId = Brand<string, 'CorrelationId'>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID_RE.test(value);

/** Unsafe cast used only at trusted boundaries (database reads, id generation). */
export const asId = <T extends string>(value: string): T => value as T;

/** Port. Injected so scenario replay and tests are deterministic. */
export interface IdGenerator {
  next(): string;
}

export const cryptoIdGenerator = (): IdGenerator => ({
  next: (): string => globalThis.crypto.randomUUID(),
});
