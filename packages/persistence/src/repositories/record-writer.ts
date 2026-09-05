/**
 * Persists normalized financial records.
 *
 * Duplicate rejection is delegated to the database's source-uniqueness constraints via
 * `ON CONFLICT DO NOTHING`, and the accepted/duplicate split is derived from the row
 * count. Doing it this way rather than checking in application memory matters: two
 * concurrent imports carrying the same record would both pass an in-memory check and
 * both insert, double-counting money.
 */

import type { PoolClient } from 'pg';
import type { FinancialRecord } from '@settlementops/domain';

type Inserter = (
  client: PoolClient,
  record: FinancialRecord,
  merchantId: string,
  importId: string,
) => Promise<number>;

const rows = (result: { rowCount: number | null }): number => result.rowCount ?? 0;

const INSERTERS: Record<FinancialRecord['kind'], Inserter> = {
  ORDER: async (c, r, m, i) => {
    if (r.kind !== 'ORDER') return 0;
    return rows(
      await c.query(
        `INSERT INTO orders (id, merchant_id, customer_reference, amount_minor, currency,
                             status, created_at, source_system, source_record_id, import_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (merchant_id, source_system, source_record_id) DO NOTHING`,
        [
          r.id,
          m,
          r.customerReference,
          r.amount.amountMinor.toString(),
          r.amount.currency,
          r.status,
          r.createdAt,
          r.lineage.sourceSystem,
          r.lineage.sourceRecordId,
          i,
        ],
      ),
    );
  },

  PAYMENT: async (c, r, m, i) => {
    if (r.kind !== 'PAYMENT') return 0;
    return rows(
      await c.query(
        `INSERT INTO payments (id, merchant_id, order_id, amount_minor, currency,
                               payment_method, status, authorized_at, captured_at,
                               source_system, source_record_id, import_id)
         VALUES ($1,$2,
                 (SELECT id FROM orders WHERE merchant_id = $2 AND source_record_id = $3 LIMIT 1),
                 $4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (merchant_id, source_system, source_record_id) DO NOTHING`,
        [
          r.id,
          m,
          r.orderId,
          r.amount.amountMinor.toString(),
          r.amount.currency,
          r.paymentMethod,
          r.status,
          r.authorizedAt,
          r.capturedAt,
          r.lineage.sourceSystem,
          r.lineage.sourceRecordId,
          i,
        ],
      ),
    );
  },

  SETTLEMENT: async (c, r, m, i) => {
    if (r.kind !== 'SETTLEMENT') return 0;
    return rows(
      await c.query(
        `INSERT INTO settlements (id, merchant_id, gross_amount_minor, net_amount_minor,
                                  currency, settlement_at, status, utr,
                                  source_system, source_record_id, import_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (merchant_id, source_system, source_record_id) DO NOTHING`,
        [
          r.id,
          m,
          r.grossAmount.amountMinor.toString(),
          r.netAmount.amountMinor.toString(),
          r.grossAmount.currency,
          r.settlementAt,
          r.status,
          r.utr,
          r.lineage.sourceSystem,
          r.lineage.sourceRecordId,
          i,
        ],
      ),
    );
  },

  SETTLEMENT_LINE: async (c, r, m, i) => {
    if (r.kind !== 'SETTLEMENT_LINE') return 0;
    return rows(
      await c.query(
        `INSERT INTO settlement_lines (id, settlement_id, merchant_id, payment_id,
                                       line_type, amount_minor, currency,
                                       source_record_id, import_id)
         SELECT $1,
                s.id,
                $2,
                (SELECT p.id FROM payments p
                  WHERE p.merchant_id = $2 AND p.source_record_id = $4 LIMIT 1),
                $5,$6,$7,$8,$9
           FROM settlements s
          WHERE s.merchant_id = $2 AND s.source_record_id = $3
          LIMIT 1
         ON CONFLICT (merchant_id, source_record_id) DO NOTHING`,
        [
          r.id,
          m,
          r.settlementId,
          r.paymentId,
          r.lineType,
          r.amount.amountMinor.toString(),
          r.amount.currency,
          r.lineage.sourceRecordId,
          i,
        ],
      ),
    );
  },

  FEE_LINE: async (c, r, m, i) => {
    if (r.kind !== 'FEE_LINE') return 0;
    return rows(
      await c.query(
        `INSERT INTO fee_lines (id, merchant_id, payment_id, fee_type, amount_minor,
                                currency, effective_date, source_record_id, import_id)
         VALUES ($1,$2,
                 (SELECT id FROM payments WHERE merchant_id = $2 AND source_record_id = $3 LIMIT 1),
                 $4,$5,$6,$7,$8,$9)
         ON CONFLICT (merchant_id, source_record_id) DO NOTHING`,
        [
          r.id,
          m,
          r.paymentId,
          r.feeType,
          r.amount.amountMinor.toString(),
          r.amount.currency,
          r.effectiveDate,
          r.lineage.sourceRecordId,
          i,
        ],
      ),
    );
  },

  TAX_LINE: async (c, r, m, i) => {
    if (r.kind !== 'TAX_LINE') return 0;
    return rows(
      await c.query(
        `INSERT INTO tax_lines (id, merchant_id, fee_line_id, tax_type, amount_minor,
                                currency, period, source_record_id, import_id)
         VALUES ($1,$2,
                 (SELECT id FROM fee_lines WHERE merchant_id = $2 AND source_record_id = $3 LIMIT 1),
                 $4,$5,$6,$7,$8,$9)
         ON CONFLICT (merchant_id, source_record_id) DO NOTHING`,
        [
          r.id,
          m,
          r.feeLineId,
          r.taxType,
          r.amount.amountMinor.toString(),
          r.amount.currency,
          r.period,
          r.lineage.sourceRecordId,
          i,
        ],
      ),
    );
  },

  REFUND: async (c, r, m, i) => {
    if (r.kind !== 'REFUND') return 0;
    return rows(
      await c.query(
        `INSERT INTO refunds (id, merchant_id, payment_id, amount_minor, currency, status,
                              created_at, settled_at, source_system, source_record_id, import_id)
         SELECT $1,$2,p.id,$4,$5,$6,$7,$8,$9,$10,$11
           FROM payments p
          WHERE p.merchant_id = $2 AND p.source_record_id = $3 LIMIT 1
         ON CONFLICT (merchant_id, source_system, source_record_id) DO NOTHING`,
        [
          r.id,
          m,
          r.paymentId,
          r.amount.amountMinor.toString(),
          r.amount.currency,
          r.status,
          r.createdAt,
          r.settledAt,
          r.lineage.sourceSystem,
          r.lineage.sourceRecordId,
          i,
        ],
      ),
    );
  },

  ADJUSTMENT: async (c, r, m, i) => {
    if (r.kind !== 'ADJUSTMENT') return 0;
    return rows(
      await c.query(
        `INSERT INTO adjustments (id, merchant_id, settlement_id, reference, amount_minor,
                                  currency, effective_at, reason_code, source_record_id, import_id)
         VALUES ($1,$2,
                 (SELECT id FROM settlements WHERE merchant_id = $2 AND source_record_id = $3 LIMIT 1),
                 $4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (merchant_id, source_record_id) DO NOTHING`,
        [
          r.id,
          m,
          r.settlementId,
          r.reference,
          r.amount.amountMinor.toString(),
          r.amount.currency,
          r.effectiveAt,
          r.reasonCode,
          r.lineage.sourceRecordId,
          i,
        ],
      ),
    );
  },

  BANK_CREDIT: async (c, r, m, i) => {
    if (r.kind !== 'BANK_CREDIT') return 0;
    return rows(
      await c.query(
        `INSERT INTO bank_credits (id, merchant_id, utr, amount_minor, currency, credited_at,
                                   bank_reference, source_system, source_record_id, import_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (merchant_id, source_system, source_record_id) DO NOTHING`,
        [
          r.id,
          m,
          r.utr,
          r.amount.amountMinor.toString(),
          r.amount.currency,
          r.creditedAt,
          r.bankReference,
          r.lineage.sourceSystem,
          r.lineage.sourceRecordId,
          i,
        ],
      ),
    );
  },

  LEDGER_ENTRY: async (c, r, m, i) => {
    if (r.kind !== 'LEDGER_ENTRY') return 0;
    return rows(
      await c.query(
        `INSERT INTO ledger_entries (id, merchant_id, reference_type, reference_id,
                                     amount_minor, currency, entry_type, posted_at,
                                     status, source_record_id, import_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (merchant_id, source_record_id) DO NOTHING`,
        [
          r.id,
          m,
          r.referenceType,
          r.referenceId,
          r.amount.amountMinor.toString(),
          r.amount.currency,
          r.entryType,
          r.postedAt,
          r.status,
          r.lineage.sourceRecordId,
          i,
        ],
      ),
    );
  },
};

/**
 * Insert order matters: settlement lines reference settlements and payments, refunds
 * reference payments, taxes reference fees. Inserting in dependency order lets a single
 * batch carry a whole lifecycle.
 */
const INSERT_ORDER: readonly FinancialRecord['kind'][] = [
  'ORDER',
  'PAYMENT',
  'SETTLEMENT',
  'FEE_LINE',
  'TAX_LINE',
  'REFUND',
  'ADJUSTMENT',
  'SETTLEMENT_LINE',
  'BANK_CREDIT',
  'LEDGER_ENTRY',
];

export const insertRecords = async (
  client: PoolClient,
  merchantId: string,
  importId: string,
  records: readonly FinancialRecord[],
): Promise<{ accepted: number; duplicates: number }> => {
  let accepted = 0;
  for (const kind of INSERT_ORDER) {
    for (const record of records.filter((r) => r.kind === kind)) {
      accepted += await INSERTERS[kind](client, record, merchantId, importId);
    }
  }
  return { accepted, duplicates: records.length - accepted };
};
