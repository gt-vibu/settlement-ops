/**
 * Generator contracts.
 *
 * The ordering here is the whole security model of the benchmark: a `CaseBlueprint` is
 * decided FIRST, and the visible records are rendered FROM it afterwards. Nothing flows
 * back. The application, both baselines and the agent see only `visibleRecords`; the
 * blueprint goes to `settlementops_eval`, which the application credential cannot reach.
 */

import type { CauseCode, PaymentMethod } from '@settlementops/domain';

import type { NoveltyStratum, Split } from '../manifest/splits.js';
import type { ConfigurationBucket } from './buckets.js';

/** What the oracle knows and no runtime component may ever see. */
export interface CaseBlueprint {
  readonly paymentId: string;
  readonly merchantSlug: string;
  readonly split: Split;
  /** Sorted. A single-cause case has one entry; COMPOUND has two or more. */
  readonly trueCauses: readonly CauseCode[];
  readonly trueCauseTuple: string;
  /** What a correct system must ultimately do. RESOLVE only where evidence can prove it. */
  readonly trueDisposition: 'RESOLVE' | 'ESCALATE';
  readonly noveltyStratum: NoveltyStratum;
  readonly bucket: ConfigurationBucket;
  readonly grossMinor: bigint;
  readonly paymentMethod: PaymentMethod;
  readonly capturedAt: Date;
  /** Whether the deterministic baseline is expected to leave this as a residual. */
  readonly expectedResidual: boolean;
  readonly discrepancyMinor: bigint;
  /** Free-form generator detail for forensic replay. Never served anywhere. */
  readonly injection: Readonly<Record<string, unknown>>;
}

/** One generated case: the hidden blueprint plus the records the world gets to see. */
export interface GeneratedCase {
  readonly blueprint: CaseBlueprint;
  readonly visibleRecords: readonly Record<string, unknown>[];
}

export interface GeneratedSplit {
  readonly split: Split;
  readonly seed: number;
  readonly merchants: readonly string[];
  readonly cases: readonly GeneratedCase[];
}
