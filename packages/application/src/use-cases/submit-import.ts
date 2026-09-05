/**
 * Ingest a batch of financial records.
 *
 * Order matters and is deliberate:
 *   validate -> idempotency -> normalize -> persist -> audit
 *
 * Validation happens before anything is written, so malformed input never creates a
 * partial financial state. Idempotency is checked before normalization so a replayed
 * batch costs nothing. Records that fail validation are reported per-record rather than
 * failing the whole batch, because one bad row in a 10,000-row file should not discard
 * the other 9,999 - but they are counted and surfaced, never silently dropped.
 */

import type { Clock, IdGenerator } from '@settlementops/shared';
import { scopeOf, type RequestContext } from '../auth/request-context.js';
import { importRequestDto, type ImportRequestDto } from '../ingestion/contracts.js';
import { normalizeRecord } from '../ingestion/normalizer.js';
import type {
  AuditWriter,
  ImportRepository,
  ImportSummary,
  RecordRepository,
} from '../ports/repositories.js';

export interface SubmitImportDeps {
  readonly imports: ImportRepository;
  readonly records: RecordRepository;
  readonly audit: AuditWriter;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export interface SubmitImportInput {
  readonly body: unknown;
  readonly idempotencyKey: string;
}

export type SubmitImportResult =
  | { readonly kind: 'ACCEPTED'; readonly summary: ImportSummary; readonly replayed: boolean }
  | { readonly kind: 'VALIDATION_ERROR'; readonly issues: readonly unknown[] };

export const submitImport = async (
  deps: SubmitImportDeps,
  ctx: RequestContext,
  input: SubmitImportInput,
): Promise<SubmitImportResult> => {
  const parsed = importRequestDto.safeParse(input.body);
  if (!parsed.success) {
    return { kind: 'VALIDATION_ERROR', issues: parsed.error.issues };
  }
  const request: ImportRequestDto = parsed.data;
  const scope = scopeOf(ctx);

  const { summary, created } = await deps.imports.createOrGet(scope, {
    id: deps.ids.next(),
    sourceType: request.source_type,
    idempotencyKey: input.idempotencyKey,
    submittedCount: request.records.length,
    correlationId: ctx.correlationId,
  });

  // A replay returns the original result and writes nothing further.
  if (!created) {
    return { kind: 'ACCEPTED', summary, replayed: true };
  }

  const ingestedAt = deps.clock.now();
  const normalized = [];
  const validationErrors: unknown[] = [];

  for (const [index, dto] of request.records.entries()) {
    const result = normalizeRecord(ctx, {
      dto,
      index,
      recordId: deps.ids.next(),
      ingestedAt,
    });
    if (result.ok) normalized.push(result.value);
    else validationErrors.push({ index, error: result.error });
  }

  const { accepted, duplicates } = await deps.records.insertMany(scope, summary.id, normalized);

  await deps.imports.complete(scope, summary.id, {
    accepted,
    rejected: validationErrors.length,
    duplicates,
    validationErrors,
  });

  await deps.audit.append(scope, {
    id: deps.ids.next(),
    entityType: 'import',
    entityId: summary.id,
    eventType: 'financial_record_ingested',
    actorType: 'USER',
    actorId: ctx.userId,
    correlationId: ctx.correlationId,
    previousState: null,
    nextState: 'SUCCEEDED',
    caseVersion: null,
    payload: {
      submitted: request.records.length,
      accepted,
      duplicates,
      rejected: validationErrors.length,
    },
  });

  const final = await deps.imports.findById(scope, summary.id);
  return { kind: 'ACCEPTED', summary: final ?? summary, replayed: false };
};
