/**
 * Database-backed user directory.
 *
 * This is the component that makes tenant scope trustworthy: memberships are read
 * from user_merchant_roles, never taken from a request header. See
 * specs/AUTHORIZATION_MODEL.md section 3.
 */

import { asId, type MerchantId, type UserId } from '@settlementops/shared';
import type { Membership, UserDirectory } from '@settlementops/application';
import { isRole } from '@settlementops/application';
import type { DatabaseHandle } from './client.js';

interface UserRow {
  id: string;
}

interface MembershipRow {
  merchant_id: string;
  role: string;
}

export const createUserDirectory = (db: DatabaseHandle): UserDirectory => ({
  findActiveUser: async (subject: string): Promise<{ userId: UserId } | null> => {
    const result = await db.pool.query<UserRow>(
      `SELECT id FROM users WHERE external_subject = $1 AND status = 'ACTIVE' LIMIT 1`,
      [subject],
    );
    const row = result.rows[0];
    return row === undefined ? null : { userId: asId<UserId>(row.id) };
  },

  membershipsOf: async (userId: UserId): Promise<readonly Membership[]> => {
    const result = await db.pool.query<MembershipRow>(
      `SELECT merchant_id, role FROM user_merchant_roles WHERE user_id = $1`,
      [userId],
    );
    return result.rows.flatMap((row) =>
      isRole(row.role) ? [{ merchantId: asId<MerchantId>(row.merchant_id), role: row.role }] : [],
    );
  },
});
