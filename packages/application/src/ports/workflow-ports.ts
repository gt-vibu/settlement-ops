/**
 * Phase 3 repository ports: scenarios, case transitions, investigations, evidence.
 */

import type { CaseId, MerchantId } from '@settlementops/shared';
import type { CaseState, MerchantScope, TransitionActor } from '@settlementops/domain';

export interface ScenarioInstance {
  readonly id: string;
  readonly merchantId: MerchantId;
  readonly scenarioId: string;
  readonly seed: number;
  readonly status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  readonly importId: string | null;
  readonly reconciliationRunId: string | null;
  readonly recordsCreated: number;
  readonly casesCreated: number;
  readonly failureCode: string | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
}

export interface ScenarioRepository {
  createOrGet(
    scope: MerchantScope,
    input: {
      id: string;
      scenarioId: string;
      seed: number;
      idempotencyKey: string;
      expectedCause: string;
      correlationId: string;
    },
  ): Promise<{ instance: ScenarioInstance; created: boolean }>;

  complete(
    scope: MerchantScope,
    id: string,
    result: {
      importId: string;
      reconciliationRunId: string;
      recordsCreated: number;
      casesCreated: number;
    },
  ): Promise<void>;

  markFailed(scope: MerchantScope, id: string, failureCode: string): Promise<void>;

  findById(scope: MerchantScope, id: string): Promise<ScenarioInstance | null>;

  list(scope: MerchantScope, limit: number): Promise<readonly ScenarioInstance[]>;

  /** Links the cases a scenario produced, so a demo can point at real state. */
  linkCases(scope: MerchantScope, id: string, runId: string): Promise<number>;
}

/**
 * Case state transitions.
 *
 * The check order is fixed and enforced in one place: authorization, then version, then
 * legality. A caller cannot reach the state column any other way.
 */
export interface CaseTransitionResult {
  readonly caseId: CaseId;
  readonly previousState: CaseState;
  readonly nextState: CaseState;
  readonly caseVersion: number;
}

export type TransitionFailure =
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'VERSION_CONFLICT'; readonly actual: number }
  | { readonly kind: 'ILLEGAL_TRANSITION'; readonly from: CaseState; readonly to: CaseState }
  | {
      readonly kind: 'ACTOR_NOT_PERMITTED';
      readonly from: CaseState;
      readonly to: CaseState;
      readonly actor: TransitionActor;
    }
  | { readonly kind: 'OUTCOME_REQUIRED' };

export interface CaseTransitionRepository {
  /** Applies one transition atomically, or fails without changing anything. */
  transition(
    scope: MerchantScope,
    input: {
      caseId: CaseId;
      to: CaseState;
      actor: TransitionActor;
      expectedVersion: number;
      outcomeRecorded?: boolean;
    },
  ): Promise<CaseTransitionResult | TransitionFailure>;

  currentState(
    scope: MerchantScope,
    caseId: CaseId,
  ): Promise<{ state: CaseState; caseVersion: number } | null>;
}

export interface InvestigationRecord {
  readonly id: string;
  readonly caseId: CaseId;
  readonly status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  readonly failureCode: string | null;
  readonly caseVersionAtStart: number;
  readonly toolCallCount: number;
  readonly policyVersion: string;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
}

export interface InvestigationRepository {
  /** One active investigation per case, enforced by a partial unique index. */
  start(
    scope: MerchantScope,
    input: {
      id: string;
      caseId: CaseId;
      caseVersionAtStart: number;
      policyVersion: string;
      correlationId: string;
    },
  ): Promise<{ investigation: InvestigationRecord; created: boolean }>;

  finish(
    scope: MerchantScope,
    id: string,
    outcome: { status: 'SUCCEEDED' | 'FAILED'; failureCode: string | null },
  ): Promise<void>;

  listForCase(scope: MerchantScope, caseId: CaseId): Promise<readonly InvestigationRecord[]>;
}

export interface EvidenceRequestRecord {
  readonly id: string;
  readonly caseId: CaseId;
  readonly detail: string;
  readonly status: 'OPEN' | 'RESOLVED' | 'EXPIRED';
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface EvidenceRequestRepository {
  open(
    scope: MerchantScope,
    input: {
      id: string;
      caseId: CaseId;
      requestedBy: string | null;
      detail: string;
      expiresAt: Date;
    },
  ): Promise<{ request: EvidenceRequestRecord; created: boolean }>;

  listForCase(scope: MerchantScope, caseId: CaseId): Promise<readonly EvidenceRequestRecord[]>;
}

/**
 * Audit read port.
 *
 * Deliberately read-only: no write, update or delete method exists on this interface.
 * Audit events are appended through `AuditWriter`; corrections are compensating events,
 * never edits (`AUDIT_TRAIL.md` section 2).
 */
export interface AuditEventView {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly eventType: string;
  readonly actorType: string;
  readonly actorId: string | null;
  readonly correlationId: string;
  readonly previousState: string | null;
  readonly nextState: string | null;
  readonly caseVersion: number | null;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurredAt: Date;
}

export interface AuditReader {
  /** One case's history, oldest first. */
  listForCase(
    scope: MerchantScope,
    caseId: CaseId,
    limit: number,
  ): Promise<readonly AuditEventView[]>;

  /** Tenant-scoped recent activity, newest first. */
  listRecent(scope: MerchantScope, limit: number): Promise<readonly AuditEventView[]>;

  countForCase(scope: MerchantScope, caseId: CaseId): Promise<number>;
}
