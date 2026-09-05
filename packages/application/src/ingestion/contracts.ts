/**
 * Ingestion contracts.
 *
 * Imported financial data is UNTRUSTED (`SECURITY.md` section 14: uploads are hostile
 * input). Everything crossing this boundary is schema-validated before it can become a
 * domain record - strict shape, bounded size, explicit currency, integer money only.
 *
 * These schemas live in the application layer, not the domain: the domain must stay
 * dependency-free, so Zod stops here.
 */

import { z } from 'zod';

/** Money on the wire. Integer minor units, never a decimal string or float. */
export const moneyDto = z.object({
  amount_minor: z.number().int().safe(),
  currency: z.string().length(3),
});

const isoDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime())
  .describe('ISO-8601 timestamp');

const lineage = z.object({
  source_system: z.string().min(1).max(64),
  source_record_id: z.string().min(1).max(128),
  observed_at: isoDate,
  schema_version: z.string().min(1).max(16).default('v1'),
});

const base = z.object({ lineage });

export const orderDto = base.extend({
  kind: z.literal('ORDER'),
  order_id: z.string().min(1).max(64),
  customer_reference: z.string().max(128).nullable().default(null),
  amount: moneyDto,
  status: z.enum(['CREATED', 'PAID', 'CANCELLED']),
  created_at: isoDate,
});

export const paymentDto = base.extend({
  kind: z.literal('PAYMENT'),
  payment_id: z.string().min(1).max(64),
  order_id: z.string().min(1).max(64).nullable().default(null),
  amount: moneyDto,
  payment_method: z.enum(['CARD', 'NETBANKING', 'UPI', 'WALLET']),
  status: z.enum(['AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED']),
  authorized_at: isoDate.nullable().default(null),
  captured_at: isoDate.nullable().default(null),
});

export const feeLineDto = base.extend({
  kind: z.literal('FEE_LINE'),
  payment_id: z.string().min(1).max(64).nullable().default(null),
  settlement_id: z.string().min(1).max(64).nullable().default(null),
  fee_type: z.string().min(1).max(64),
  amount: moneyDto,
  effective_date: isoDate,
});

export const taxLineDto = base.extend({
  kind: z.literal('TAX_LINE'),
  fee_line_source_id: z.string().max(128).nullable().default(null),
  tax_type: z.string().min(1).max(64),
  amount: moneyDto,
  period: z.string().min(1).max(32),
});

export const refundDto = base.extend({
  kind: z.literal('REFUND'),
  refund_id: z.string().min(1).max(64),
  payment_id: z.string().min(1).max(64),
  amount: moneyDto,
  status: z.enum(['CREATED', 'PROCESSED', 'FAILED']),
  created_at: isoDate,
  settled_at: isoDate.nullable().default(null),
});

export const adjustmentDto = base.extend({
  kind: z.literal('ADJUSTMENT'),
  settlement_id: z.string().min(1).max(64).nullable().default(null),
  reference: z.string().min(1).max(128),
  amount: moneyDto,
  effective_at: isoDate,
  reason_code: z.string().min(1).max(64),
});

export const settlementDto = base.extend({
  kind: z.literal('SETTLEMENT'),
  settlement_id: z.string().min(1).max(64),
  settlement_batch_reference: z.string().max(128).nullable().default(null),
  gross_amount: moneyDto,
  net_amount: moneyDto,
  settlement_at: isoDate,
  status: z.enum(['PENDING', 'PROCESSED', 'FAILED']),
  utr: z.string().max(64).nullable().default(null),
});

export const settlementLineDto = base.extend({
  kind: z.literal('SETTLEMENT_LINE'),
  settlement_id: z.string().min(1).max(64),
  payment_id: z.string().min(1).max(64).nullable().default(null),
  refund_id: z.string().min(1).max(64).nullable().default(null),
  line_type: z.enum(['PAYMENT', 'REFUND', 'ADJUSTMENT', 'FEE', 'TAX']),
  amount: moneyDto,
});

export const bankCreditDto = base.extend({
  kind: z.literal('BANK_CREDIT'),
  utr: z.string().min(1).max(64),
  amount: moneyDto,
  credited_at: isoDate,
  bank_reference: z.string().min(1).max(128),
});

export const ledgerEntryDto = base.extend({
  kind: z.literal('LEDGER_ENTRY'),
  reference_type: z.string().min(1).max(64),
  reference_id: z.string().min(1).max(128),
  amount: moneyDto,
  entry_type: z.enum(['DEBIT', 'CREDIT']),
  posted_at: isoDate,
  status: z.string().min(1).max(32),
});

export const financialRecordDto = z.discriminatedUnion('kind', [
  orderDto,
  paymentDto,
  feeLineDto,
  taxLineDto,
  refundDto,
  adjustmentDto,
  settlementDto,
  settlementLineDto,
  bankCreditDto,
  ledgerEntryDto,
]);

export type FinancialRecordDto = z.infer<typeof financialRecordDto>;

/** Bounded: `SYSTEM_DESIGN.md` section 12 requires a safe upper bound on import size. */
export const MAX_IMPORT_RECORDS = 10_000;

export const importRequestDto = z.object({
  source_type: z.string().min(1).max(64),
  records: z.array(financialRecordDto).min(1).max(MAX_IMPORT_RECORDS),
});

export type ImportRequestDto = z.infer<typeof importRequestDto>;
