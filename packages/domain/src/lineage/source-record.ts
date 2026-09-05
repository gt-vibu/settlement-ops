/**
 * Source lineage (specs/DATA_MODEL.md section 2).
 *
 * Every derived conclusion in this system must be traceable back to a source record
 * and the transformation that produced it. An evidence id alone is insufficient if
 * the source record cannot be linked to the case (specs/SYSTEM_DESIGN.md section 11).
 */

import { type Result, ok, err } from '@settlementops/shared';
import type { MerchantScope } from './merchant-scope.js';

export interface SourceLineage {
  readonly sourceSystem: string;
  readonly sourceRecordId: string;
  readonly observedAt: Date;
  readonly ingestedAt: Date;
  readonly schemaVersion: string;
}

export interface SourceRecordIdentity {
  readonly id: string;
  readonly scope: MerchantScope;
  readonly lineage: SourceLineage;
}

export type LineageError =
  | { readonly kind: 'MISSING_FIELD'; readonly field: string }
  | { readonly kind: 'IMPOSSIBLE_TIMESTAMP'; readonly reason: string };

export const buildLineage = (input: SourceLineage): Result<SourceLineage, LineageError> => {
  if (input.sourceSystem.trim() === '')
    return err({ kind: 'MISSING_FIELD', field: 'sourceSystem' });
  if (input.sourceRecordId.trim() === '')
    return err({ kind: 'MISSING_FIELD', field: 'sourceRecordId' });
  if (input.schemaVersion.trim() === '')
    return err({ kind: 'MISSING_FIELD', field: 'schemaVersion' });
  if (Number.isNaN(input.observedAt.getTime()))
    return err({ kind: 'IMPOSSIBLE_TIMESTAMP', reason: 'observedAt is not a valid date' });
  if (Number.isNaN(input.ingestedAt.getTime()))
    return err({ kind: 'IMPOSSIBLE_TIMESTAMP', reason: 'ingestedAt is not a valid date' });
  if (input.ingestedAt.getTime() < input.observedAt.getTime()) {
    return err({
      kind: 'IMPOSSIBLE_TIMESTAMP',
      reason: 'ingestedAt precedes observedAt',
    });
  }
  return ok(input);
};

/** Duplicate identity key: (merchant, source system, source record id). */
export const duplicateKey = (r: SourceRecordIdentity): string =>
  `${r.scope.merchantId}::${r.lineage.sourceSystem}::${r.lineage.sourceRecordId}`;
