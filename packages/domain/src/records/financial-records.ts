/**
 * Canonical financial records (specs/DATA_MODEL.md section 3).
 *
 * Every amount-bearing field is a Money, never a bare number, so a currency can never
 * go missing in transit. Every record carries a MerchantScope and source lineage.
 */

import type { MerchantId, OrderId, PaymentId, RefundId, SettlementId } from '@settlementops/shared';
import type { Money } from '../money/money.js';
import type { MerchantScope } from '../lineage/merchant-scope.js';
import type { SourceLineage } from '../lineage/source-record.js';
import type { PaymentMethod } from '../policy/fee-schedule.js';

interface RecordBase {
  readonly id: string;
  readonly scope: MerchantScope;
  readonly lineage: SourceLineage;
}

export interface OrderRecord extends RecordBase {
  readonly kind: 'ORDER';
  readonly orderId: OrderId;
  readonly customerReference: string | null;
  readonly amount: Money;
  readonly status: 'CREATED' | 'PAID' | 'CANCELLED';
  readonly createdAt: Date;
}

export interface PaymentRecord extends RecordBase {
  readonly kind: 'PAYMENT';
  readonly paymentId: PaymentId;
  readonly orderId: OrderId | null;
  readonly amount: Money;
  readonly paymentMethod: PaymentMethod;
  readonly status: 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'REFUNDED';
  readonly authorizedAt: Date | null;
  readonly capturedAt: Date | null;
}

export interface FeeLineRecord extends RecordBase {
  readonly kind: 'FEE_LINE';
  readonly paymentId: PaymentId | null;
  readonly settlementId: SettlementId | null;
  readonly feeType: string;
  readonly amount: Money;
  readonly effectiveDate: Date;
}

export interface TaxLineRecord extends RecordBase {
  readonly kind: 'TAX_LINE';
  readonly feeLineId: string | null;
  readonly taxType: string;
  readonly amount: Money;
  readonly period: string;
}

export interface RefundRecord extends RecordBase {
  readonly kind: 'REFUND';
  readonly refundId: RefundId;
  readonly paymentId: PaymentId;
  readonly amount: Money;
  readonly status: 'CREATED' | 'PROCESSED' | 'FAILED';
  readonly createdAt: Date;
  readonly settledAt: Date | null;
}

export interface AdjustmentRecord extends RecordBase {
  readonly kind: 'ADJUSTMENT';
  readonly settlementId: SettlementId | null;
  readonly reference: string;
  /** Signed: an adjustment may increase or decrease expected net. */
  readonly amount: Money;
  readonly effectiveAt: Date;
  readonly reasonCode: string;
}

export interface SettlementRecord extends RecordBase {
  readonly kind: 'SETTLEMENT';
  readonly settlementId: SettlementId;
  readonly settlementBatchId: string | null;
  readonly grossAmount: Money;
  readonly netAmount: Money;
  readonly settlementAt: Date;
  readonly status: 'PENDING' | 'PROCESSED' | 'FAILED';
  readonly utr: string | null;
}

export interface SettlementLineRecord extends RecordBase {
  readonly kind: 'SETTLEMENT_LINE';
  readonly settlementId: SettlementId;
  readonly paymentId: PaymentId | null;
  readonly refundId: RefundId | null;
  readonly lineType: 'PAYMENT' | 'REFUND' | 'ADJUSTMENT' | 'FEE' | 'TAX';
  readonly amount: Money;
}

export interface BankCreditRecord extends RecordBase {
  readonly kind: 'BANK_CREDIT';
  readonly utr: string;
  readonly amount: Money;
  readonly creditedAt: Date;
  readonly bankReference: string;
}

export interface LedgerEntryRecord extends RecordBase {
  readonly kind: 'LEDGER_ENTRY';
  readonly referenceType: string;
  readonly referenceId: string;
  readonly amount: Money;
  readonly entryType: 'DEBIT' | 'CREDIT';
  readonly postedAt: Date;
  readonly status: string;
}

export type FinancialRecord =
  | OrderRecord
  | PaymentRecord
  | FeeLineRecord
  | TaxLineRecord
  | RefundRecord
  | AdjustmentRecord
  | SettlementRecord
  | SettlementLineRecord
  | BankCreditRecord
  | LedgerEntryRecord;

export type FinancialRecordKind = FinancialRecord['kind'];

export const merchantOf = (record: FinancialRecord): MerchantId => record.scope.merchantId;
