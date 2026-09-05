/**
 * Repository ports.
 *
 * Application use cases depend on these interfaces, never on Drizzle or `pg`
 * (`ARCHITECTURE.md` section 13). Every merchant-owned method takes a MerchantScope
 * that can only come from a RequestContext - so a caller cannot forget tenant scope,
 * because the type system will not let them.
 */

import type { CaseId, MerchantId, PaymentId } from '@settlementops/shared';
import type {
  FinancialRecord,
  MerchantScope,
  ReconciliationUnit,
  ReconciliationVerdict,
} from '@settlementops/domain';

export interface ImportSummary {
  readonly id: string;
  readonly merchantId: MerchantId;
  readonly sourceType: string;
  readonly status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  readonly submittedCount: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly duplicateCount: number;
  readonly validationErrors: readonly unknown[];
  readonly createdAt: Date;
  readonly completedAt: Date | null;
}

export interface ImportRepository {
  /**
   * Creates an import, or returns the existing one for this idempotency key.
   * `created` distinguishes the two so a replay is observable rather than silent.
   */
  createOrGet(
    scope: MerchantScope,
    input: {
      id: string;
      sourceType: string;
      idempotencyKey: string;
      submittedCount: number;
      correlationId: string;
    },
  ): Promise<{ summary: ImportSummary; created: boolean }>;

  complete(
    scope: MerchantScope,
    id: string,
    counts: {
      accepted: number;
      rejected: number;
      duplicates: number;
      validationErrors: readonly unknown[];
    },
  ): Promise<void>;

  markFailed(scope: MerchantScope, id: string, reason: string): Promise<void>;

  findById(scope: MerchantScope, id: string): Promise<ImportSummary | null>;
}

export interface RecordRepository {
  /**
   * Persists normalized records. Returns how many were accepted and how many were
   * rejected as duplicates by the database's source-uniqueness constraints.
   *
   * Duplicate rejection happens at the database, not in application memory, because it
   * must hold across concurrent imports.
   */
  insertMany(
    scope: MerchantScope,
    importId: string,
    records: readonly FinancialRecord[],
  ): Promise<{ accepted: number; duplicates: number }>;

  /** Payments that a reconciliation run should evaluate. */
  listPaymentIdsForImport(scope: MerchantScope, importId: string): Promise<readonly PaymentId[]>;

  listCapturedPaymentIds(scope: MerchantScope, limit: number): Promise<readonly PaymentId[]>;

  /** Assembles the full reconciliation unit for one payment, tenant-scoped. */
  loadUnit(scope: MerchantScope, paymentId: PaymentId): Promise<ReconciliationUnit | null>;
}

export interface ReconciliationRunSummary {
  readonly id: string;
  readonly merchantId: MerchantId;
  readonly importId: string | null;
  readonly status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  readonly policyVersion: string;
  readonly evaluatedCount: number;
  readonly reconciledCount: number;
  readonly residualCount: number;
  readonly failureCode: string | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
}

export interface ReconciliationRunRepository {
  create(
    scope: MerchantScope,
    input: { id: string; importId: string | null; policyVersion: string; correlationId: string },
  ): Promise<ReconciliationRunSummary>;

  complete(
    scope: MerchantScope,
    id: string,
    counts: { evaluated: number; reconciled: number; residual: number },
  ): Promise<void>;

  markFailed(scope: MerchantScope, id: string, failureCode: string): Promise<void>;

  findById(scope: MerchantScope, id: string): Promise<ReconciliationRunSummary | null>;
}

export interface CaseListItem {
  readonly id: CaseId;
  readonly caseNumber: string;
  readonly state: string;
  readonly priority: number;
  readonly discrepancyMinor: string;
  readonly currency: string;
  readonly reasons: readonly string[];
  readonly openedAt: Date;
}

export interface CaseRepository {
  /**
   * Creates a residual case. Idempotent per (run, payment) via a unique index, so a
   * retried reconciliation job cannot double-create.
   */
  createResidual(
    scope: MerchantScope,
    input: {
      id: string;
      caseNumber: string;
      runId: string;
      paymentId: PaymentId;
      verdict: ReconciliationVerdict;
    },
  ): Promise<{ id: CaseId; created: boolean }>;

  list(
    scope: MerchantScope,
    filter: { state?: string; limit: number; offset: number },
  ): Promise<readonly CaseListItem[]>;

  countByState(scope: MerchantScope): Promise<Readonly<Record<string, number>>>;

  findById(scope: MerchantScope, id: CaseId): Promise<CaseListItem | null>;

  /**
   * The payment a case was opened against.
   *
   * Needed to load the reconciliation unit an investigation reasons over. Returns null
   * rather than throwing when the case is out of scope, so a caller cannot use it as an
   * existence oracle for another merchant's data.
   */
  paymentIdFor(scope: MerchantScope, id: CaseId): Promise<PaymentId | null>;
}

export interface AuditWriter {
  append(
    scope: MerchantScope,
    event: {
      id: string;
      entityType: string;
      entityId: string;
      eventType: string;
      actorType: string;
      actorId: string | null;
      correlationId: string;
      previousState: string | null;
      nextState: string | null;
      caseVersion: number | null;
      payload: Readonly<Record<string, unknown>>;
    },
  ): Promise<void>;
}
