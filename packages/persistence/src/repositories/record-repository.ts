/**
 * Record repository: writes normalized records and assembles reconciliation units.
 */

import { asId, type PaymentId } from '@settlementops/shared';
import type { MerchantScope } from '@settlementops/domain';
import type { RecordRepository } from '@settlementops/application';
import type { DatabaseHandle } from '../client.js';
import { insertRecords } from './record-writer.js';
import { loadUnit } from './unit-loader.js';

export const createRecordRepository = (db: DatabaseHandle): RecordRepository => ({
  insertMany: async (scope: MerchantScope, importId: string, records) => {
    if (records.length === 0) return { accepted: 0, duplicates: 0 };
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await insertRecords(client, scope.merchantId, importId, records);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  listPaymentIdsForImport: async (scope: MerchantScope, importId: string) => {
    const result = await db.pool.query<{ id: string }>(
      `SELECT id FROM payments
        WHERE merchant_id = $1 AND import_id = $2 AND status = 'CAPTURED'
        ORDER BY captured_at NULLS LAST`,
      [scope.merchantId, importId],
    );
    return result.rows.map((r) => asId<PaymentId>(r.id));
  },

  listCapturedPaymentIds: async (scope: MerchantScope, limit: number) => {
    const result = await db.pool.query<{ id: string }>(
      `SELECT id FROM payments
        WHERE merchant_id = $1 AND status = 'CAPTURED'
        ORDER BY captured_at DESC NULLS LAST LIMIT $2`,
      [scope.merchantId, limit],
    );
    return result.rows.map((r) => asId<PaymentId>(r.id));
  },

  loadUnit: (scope: MerchantScope, paymentId: PaymentId) => loadUnit(db, scope, paymentId),
});
