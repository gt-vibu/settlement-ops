/**
 * Phase 3 persistence adapters: case transitions, investigations, evidence requests.
 *
 * The transition adapter is the important one. It performs the state change as a single
 * conditional UPDATE guarded on both the current state and the case version, so the
 * check and the write cannot be separated by a concurrent writer. Two racing approvals
 * cannot both succeed: the second finds `case_version` already advanced and fails with a
 * conflict rather than overwriting.
 */

import { asId, type CaseId } from '@settlementops/shared';
import {
  canTransition,
  isActorPermitted,
  isCaseState,
  requiresOutcomeRecord,
  type CaseState,
  type MerchantScope,
} from '@settlementops/domain';
import type {
  CaseTransitionRepository,
  CaseTransitionResult,
  EvidenceRequestRecord,
  EvidenceRequestRepository,
  InvestigationRecord,
  InvestigationRepository,
  TransitionFailure,
} from '@settlementops/application';
import type { DatabaseHandle } from '../client.js';

export const createCaseTransitionRepository = (db: DatabaseHandle): CaseTransitionRepository => ({
  currentState: async (scope: MerchantScope, caseId: CaseId) => {
    const result = await db.pool.query<{ state: string; case_version: number }>(
      `SELECT state, case_version FROM reconciliation_cases
        WHERE id = $1 AND merchant_id = $2`,
      [caseId, scope.merchantId],
    );
    const row = result.rows[0];
    if (row === undefined || !isCaseState(row.state)) return null;
    return { state: row.state, caseVersion: row.case_version };
  },

  transition: async (
    scope: MerchantScope,
    input,
  ): Promise<CaseTransitionResult | TransitionFailure> => {
    const current = await db.pool.query<{ state: string; case_version: number }>(
      `SELECT state, case_version FROM reconciliation_cases
        WHERE id = $1 AND merchant_id = $2`,
      [input.caseId, scope.merchantId],
    );
    const row = current.rows[0];
    // A case in another tenant is indistinguishable from one that does not exist.
    if (row === undefined || !isCaseState(row.state)) return { kind: 'NOT_FOUND' };

    const from: CaseState = row.state;

    if (row.case_version !== input.expectedVersion) {
      return { kind: 'VERSION_CONFLICT', actual: row.case_version };
    }
    if (!canTransition(from, input.to)) {
      return { kind: 'ILLEGAL_TRANSITION', from, to: input.to };
    }
    if (!isActorPermitted(from, input.to, input.actor)) {
      return { kind: 'ACTOR_NOT_PERMITTED', from, to: input.to, actor: input.actor };
    }
    if (requiresOutcomeRecord(from, input.to) && input.outcomeRecorded !== true) {
      return { kind: 'OUTCOME_REQUIRED' };
    }

    // Guarded write: the WHERE clause repeats state and version, so a concurrent
    // transition between the read above and this write loses rather than corrupts.
    const updated = await db.pool.query<{ case_version: number }>(
      `UPDATE reconciliation_cases
          SET state = $3,
              case_version = case_version + 1,
              closed_at = CASE WHEN $3 = 'CLOSED' THEN now() ELSE closed_at END
        WHERE id = $1 AND merchant_id = $2
          AND state = $4 AND case_version = $5
        RETURNING case_version`,
      [input.caseId, scope.merchantId, input.to, from, input.expectedVersion],
    );

    const after = updated.rows[0];
    if (after === undefined) {
      const latest = await db.pool.query<{ case_version: number }>(
        `SELECT case_version FROM reconciliation_cases WHERE id = $1 AND merchant_id = $2`,
        [input.caseId, scope.merchantId],
      );
      return { kind: 'VERSION_CONFLICT', actual: latest.rows[0]?.case_version ?? -1 };
    }

    return {
      caseId: asId<CaseId>(input.caseId),
      previousState: from,
      nextState: input.to,
      caseVersion: after.case_version,
    };
  },
});

interface InvestigationRow {
  id: string;
  case_id: string;
  status: string;
  failure_code: string | null;
  case_version_at_start: number;
  tool_call_count: number;
  policy_version: string;
  started_at: Date;
  finished_at: Date | null;
}

const toInvestigation = (row: InvestigationRow): InvestigationRecord => ({
  id: row.id,
  caseId: asId<CaseId>(row.case_id),
  status: row.status as InvestigationRecord['status'],
  failureCode: row.failure_code,
  caseVersionAtStart: row.case_version_at_start,
  toolCallCount: row.tool_call_count,
  policyVersion: row.policy_version,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
});

const INV_COLUMNS = `id, case_id, status, failure_code, case_version_at_start,
                     tool_call_count, policy_version, started_at, finished_at`;

export const createInvestigationRepository = (db: DatabaseHandle): InvestigationRepository => ({
  start: async (scope: MerchantScope, input) => {
    // The partial unique index on (case_id) WHERE status='RUNNING' is what makes
    // "one active investigation per case" hold under concurrency.
    const inserted = await db.pool.query<InvestigationRow>(
      `INSERT INTO investigations
         (id, case_id, merchant_id, status, case_version_at_start, policy_version, correlation_id)
       VALUES ($1, $2, $3, 'RUNNING', $4, $5, $6)
       ON CONFLICT (case_id) WHERE status = 'RUNNING' DO NOTHING
       RETURNING ${INV_COLUMNS}`,
      [
        input.id,
        input.caseId,
        scope.merchantId,
        input.caseVersionAtStart,
        input.policyVersion,
        input.correlationId,
      ],
    );
    const row = inserted.rows[0];
    if (row !== undefined) return { investigation: toInvestigation(row), created: true };

    const existing = await db.pool.query<InvestigationRow>(
      `SELECT ${INV_COLUMNS} FROM investigations
        WHERE case_id = $1 AND merchant_id = $2 AND status = 'RUNNING'`,
      [input.caseId, scope.merchantId],
    );
    const found = existing.rows[0];
    if (found === undefined) throw new Error('investigation conflict resolved to no row');
    return { investigation: toInvestigation(found), created: false };
  },

  finish: async (scope: MerchantScope, id: string, outcome) => {
    await db.pool.query(
      `UPDATE investigations
          SET status = $3, failure_code = $4, finished_at = now()
        WHERE id = $1 AND merchant_id = $2`,
      [id, scope.merchantId, outcome.status, outcome.failureCode],
    );
  },

  listForCase: async (scope: MerchantScope, caseId: CaseId) => {
    const result = await db.pool.query<InvestigationRow>(
      `SELECT ${INV_COLUMNS} FROM investigations
        WHERE case_id = $1 AND merchant_id = $2 ORDER BY started_at DESC`,
      [caseId, scope.merchantId],
    );
    return result.rows.map(toInvestigation);
  },
});

interface EvidenceRow {
  id: string;
  case_id: string;
  detail: string;
  status: string;
  expires_at: Date;
  created_at: Date;
}

const toEvidence = (row: EvidenceRow): EvidenceRequestRecord => ({
  id: row.id,
  caseId: asId<CaseId>(row.case_id),
  detail: row.detail,
  status: row.status as EvidenceRequestRecord['status'],
  expiresAt: row.expires_at,
  createdAt: row.created_at,
});

export const createEvidenceRequestRepository = (db: DatabaseHandle): EvidenceRequestRepository => ({
  open: async (scope: MerchantScope, input) => {
    const inserted = await db.pool.query<EvidenceRow>(
      `INSERT INTO evidence_requests
         (id, case_id, merchant_id, requested_by, detail, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'OPEN', $6)
       ON CONFLICT (case_id) WHERE status = 'OPEN' DO NOTHING
       RETURNING id, case_id, detail, status, expires_at, created_at`,
      [input.id, input.caseId, scope.merchantId, input.requestedBy, input.detail, input.expiresAt],
    );
    const row = inserted.rows[0];
    if (row !== undefined) return { request: toEvidence(row), created: true };

    const existing = await db.pool.query<EvidenceRow>(
      `SELECT id, case_id, detail, status, expires_at, created_at FROM evidence_requests
        WHERE case_id = $1 AND merchant_id = $2 AND status = 'OPEN'`,
      [input.caseId, scope.merchantId],
    );
    const found = existing.rows[0];
    if (found === undefined) throw new Error('evidence request conflict resolved to no row');
    return { request: toEvidence(found), created: false };
  },

  listForCase: async (scope: MerchantScope, caseId: CaseId) => {
    const result = await db.pool.query<EvidenceRow>(
      `SELECT id, case_id, detail, status, expires_at, created_at FROM evidence_requests
        WHERE case_id = $1 AND merchant_id = $2 ORDER BY created_at DESC`,
      [caseId, scope.merchantId],
    );
    return result.rows.map(toEvidence);
  },
});
