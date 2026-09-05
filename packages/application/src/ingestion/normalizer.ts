/**
 * Normalization: validated DTO -> canonical domain record.
 *
 * The only place raw input becomes a domain record. Every output carries the merchant
 * scope taken from the RequestContext - never from the payload - so an importer cannot
 * write into another tenant by crafting a field.
 */

import { asId, type Result, ok, err } from '@settlementops/shared';
import type { OrderId, PaymentId, RefundId, SettlementId } from '@settlementops/shared';
import {
  isCurrency,
  money,
  trustedMerchantScope,
  type FinancialRecord,
  type MerchantScope,
  type Money,
} from '@settlementops/domain';
import type { FinancialRecordDto } from './contracts.js';
import type { RequestContext } from '../auth/request-context.js';

export type NormalizationError =
  | { readonly kind: 'UNSUPPORTED_CURRENCY'; readonly value: string; readonly index: number }
  | { readonly kind: 'INVALID_TIMESTAMP'; readonly field: string; readonly index: number };

const toMoney = (
  dto: { amount_minor: number; currency: string },
  index: number,
): Result<Money, NormalizationError> =>
  isCurrency(dto.currency)
    ? ok(money(BigInt(dto.amount_minor), dto.currency))
    : err({ kind: 'UNSUPPORTED_CURRENCY', value: dto.currency, index });

const toDate = (value: string, field: string, index: number): Result<Date, NormalizationError> => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? err({ kind: 'INVALID_TIMESTAMP', field, index })
    : ok(parsed);
};

const optionalDate = (
  value: string | null,
  field: string,
  index: number,
): Result<Date | null, NormalizationError> =>
  value === null ? ok(null) : toDate(value, field, index);

export interface NormalizationInput {
  readonly dto: FinancialRecordDto;
  readonly index: number;
  readonly recordId: string;
  readonly ingestedAt: Date;
}

export const normalizeRecord = (
  ctx: RequestContext,
  input: NormalizationInput,
): Result<FinancialRecord, NormalizationError> => {
  const { dto, index, recordId, ingestedAt } = input;
  const scope: MerchantScope = trustedMerchantScope(ctx.tenantId);

  const observed = toDate(dto.lineage.observed_at, 'observed_at', index);
  if (!observed.ok) return observed;

  const lineage = {
    sourceSystem: dto.lineage.source_system,
    sourceRecordId: dto.lineage.source_record_id,
    observedAt: observed.value,
    ingestedAt,
    schemaVersion: dto.lineage.schema_version,
  };

  const common = { id: recordId, scope, lineage };

  switch (dto.kind) {
    case 'ORDER': {
      const amount = toMoney(dto.amount, index);
      if (!amount.ok) return amount;
      const createdAt = toDate(dto.created_at, 'created_at', index);
      if (!createdAt.ok) return createdAt;
      return ok({
        ...common,
        kind: 'ORDER',
        orderId: asId<OrderId>(dto.order_id),
        customerReference: dto.customer_reference,
        amount: amount.value,
        status: dto.status,
        createdAt: createdAt.value,
      });
    }
    case 'PAYMENT': {
      const amount = toMoney(dto.amount, index);
      if (!amount.ok) return amount;
      const authorizedAt = optionalDate(dto.authorized_at, 'authorized_at', index);
      if (!authorizedAt.ok) return authorizedAt;
      const capturedAt = optionalDate(dto.captured_at, 'captured_at', index);
      if (!capturedAt.ok) return capturedAt;
      return ok({
        ...common,
        kind: 'PAYMENT',
        paymentId: asId<PaymentId>(dto.payment_id),
        orderId: dto.order_id === null ? null : asId<OrderId>(dto.order_id),
        amount: amount.value,
        paymentMethod: dto.payment_method,
        status: dto.status,
        authorizedAt: authorizedAt.value,
        capturedAt: capturedAt.value,
      });
    }
    case 'FEE_LINE': {
      const amount = toMoney(dto.amount, index);
      if (!amount.ok) return amount;
      const effectiveDate = toDate(dto.effective_date, 'effective_date', index);
      if (!effectiveDate.ok) return effectiveDate;
      return ok({
        ...common,
        kind: 'FEE_LINE',
        paymentId: dto.payment_id === null ? null : asId<PaymentId>(dto.payment_id),
        settlementId: dto.settlement_id === null ? null : asId<SettlementId>(dto.settlement_id),
        feeType: dto.fee_type,
        amount: amount.value,
        effectiveDate: effectiveDate.value,
      });
    }
    case 'TAX_LINE': {
      const amount = toMoney(dto.amount, index);
      if (!amount.ok) return amount;
      return ok({
        ...common,
        kind: 'TAX_LINE',
        feeLineId: dto.fee_line_source_id,
        taxType: dto.tax_type,
        amount: amount.value,
        period: dto.period,
      });
    }
    case 'REFUND': {
      const amount = toMoney(dto.amount, index);
      if (!amount.ok) return amount;
      const createdAt = toDate(dto.created_at, 'created_at', index);
      if (!createdAt.ok) return createdAt;
      const settledAt = optionalDate(dto.settled_at, 'settled_at', index);
      if (!settledAt.ok) return settledAt;
      return ok({
        ...common,
        kind: 'REFUND',
        refundId: asId<RefundId>(dto.refund_id),
        paymentId: asId<PaymentId>(dto.payment_id),
        amount: amount.value,
        status: dto.status,
        createdAt: createdAt.value,
        settledAt: settledAt.value,
      });
    }
    case 'ADJUSTMENT': {
      const amount = toMoney(dto.amount, index);
      if (!amount.ok) return amount;
      const effectiveAt = toDate(dto.effective_at, 'effective_at', index);
      if (!effectiveAt.ok) return effectiveAt;
      return ok({
        ...common,
        kind: 'ADJUSTMENT',
        settlementId: dto.settlement_id === null ? null : asId<SettlementId>(dto.settlement_id),
        reference: dto.reference,
        amount: amount.value,
        effectiveAt: effectiveAt.value,
        reasonCode: dto.reason_code,
      });
    }
    case 'SETTLEMENT': {
      const gross = toMoney(dto.gross_amount, index);
      if (!gross.ok) return gross;
      const net = toMoney(dto.net_amount, index);
      if (!net.ok) return net;
      const settlementAt = toDate(dto.settlement_at, 'settlement_at', index);
      if (!settlementAt.ok) return settlementAt;
      return ok({
        ...common,
        kind: 'SETTLEMENT',
        settlementId: asId<SettlementId>(dto.settlement_id),
        settlementBatchId: dto.settlement_batch_reference,
        grossAmount: gross.value,
        netAmount: net.value,
        settlementAt: settlementAt.value,
        status: dto.status,
        utr: dto.utr,
      });
    }
    case 'SETTLEMENT_LINE': {
      const amount = toMoney(dto.amount, index);
      if (!amount.ok) return amount;
      return ok({
        ...common,
        kind: 'SETTLEMENT_LINE',
        settlementId: asId<SettlementId>(dto.settlement_id),
        paymentId: dto.payment_id === null ? null : asId<PaymentId>(dto.payment_id),
        refundId: dto.refund_id === null ? null : asId<RefundId>(dto.refund_id),
        lineType: dto.line_type,
        amount: amount.value,
      });
    }
    case 'BANK_CREDIT': {
      const amount = toMoney(dto.amount, index);
      if (!amount.ok) return amount;
      const creditedAt = toDate(dto.credited_at, 'credited_at', index);
      if (!creditedAt.ok) return creditedAt;
      return ok({
        ...common,
        kind: 'BANK_CREDIT',
        utr: dto.utr,
        amount: amount.value,
        creditedAt: creditedAt.value,
        bankReference: dto.bank_reference,
      });
    }
    case 'LEDGER_ENTRY': {
      const amount = toMoney(dto.amount, index);
      if (!amount.ok) return amount;
      const postedAt = toDate(dto.posted_at, 'posted_at', index);
      if (!postedAt.ok) return postedAt;
      return ok({
        ...common,
        kind: 'LEDGER_ENTRY',
        referenceType: dto.reference_type,
        referenceId: dto.reference_id,
        amount: amount.value,
        entryType: dto.entry_type,
        postedAt: postedAt.value,
        status: dto.status,
      });
    }
    default: {
      const exhaustive: never = dto;
      return exhaustive;
    }
  }
};
