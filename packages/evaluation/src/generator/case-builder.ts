/**
 * Case construction.
 *
 * Split out of `generate.ts` to keep both files reviewable: this one decides what a single
 * case looks like, the other decides how many of each kind exist and in which split.
 *
 * The rule this file exists to hold: one clean lifecycle, then each cause applied as a
 * TRANSFORM of it. Causes compose rather than overwrite, so a three-cause case genuinely
 * carries three defects.
 */

import type { CauseCode, PaymentMethod } from '@settlementops/domain';

import { SIMULATED_PERIOD } from '../manifest/experiment-manifest.js';
import type { Split } from '../manifest/splits.js';
import {
  amountBandOf,
  causeTupleKey,
  lineCountBandOf,
  timingBandOf,
  type ConfigurationBucket,
} from './buckets.js';
import { ADVERSARIAL_TRANSFORM, TRANSFORMS, type SingleCause } from './defects.js';
import { cleanLifecycle, emit, emitAdjustments } from './lifecycle.js';
import { applyAccountedAdjustments, noiseRecords, splitFeeLines } from './noise.js';
import { expectedSettlementFor, refsFor } from './render.js';
import type { Rng } from './rng.js';
import type { CaseBlueprint } from './types.js';

export interface CasePlan {
  readonly causes: readonly CauseCode[];
  readonly adversarial: boolean;
  readonly ambiguous: boolean;
}

export interface RenderedCase {
  readonly blueprint: Omit<CaseBlueprint, 'noveltyStratum'>;
  readonly visibleRecords: readonly Record<string, unknown>[];
  readonly bucket: ConfigurationBucket;
}

/** Amount bands the generator draws from, chosen to exercise every bucket. */
const AMOUNT_CHOICES: readonly bigint[] = [
  45_000n,
  90_000n,
  250_000n,
  600_000n,
  1_000_000n,
  2_500_000n,
  7_500_000n,
  15_000_000n,
];

const METHOD_CHOICES: readonly PaymentMethod[] = ['CARD', 'NETBANKING', 'UPI', 'WALLET'];

/**
 * Development deliberately does NOT cover the whole configuration space.
 *
 * If it did, `NOVEL_CONFIGURATION` would be unreachable - every configuration would
 * already have been seen. Development sees only card and netbanking, so UPI and wallet
 * settlements are genuinely unfamiliar territory later. UPI additionally carries a zero
 * fee rate, which makes it a useful negative control: a system that always blames a
 * missing fee record is penalised there.
 */
const DEVELOPMENT_METHODS: readonly PaymentMethod[] = ['CARD', 'NETBANKING'];

const PERIOD_START = new Date(SIMULATED_PERIOD.from).getTime();
const PERIOD_END = new Date(SIMULATED_PERIOD.to).getTime();

/** Weekday captures only: a weekend capture shifts the cycle and adds noise, not signal. */
const drawCaptureDate = (rng: Rng): Date => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const at = new Date(PERIOD_START + Math.floor(rng.next() * (PERIOD_END - PERIOD_START)));
    at.setUTCHours(4 + rng.int(0, 8), rng.int(0, 59), 0, 0);
    const day = at.getUTCDay();
    if (day !== 0 && day !== 6) return at;
  }
  return new Date(PERIOD_START);
};

/**
 * Render one case.
 *
 * One clean lifecycle, then each cause applied as a transform of it. A compound case is
 * genuinely compound: every cause damages the same settlement rather than overwriting the
 * previous cause's records. Disposition is RESOLVE only if EVERY component is individually
 * provable - one unprovable component makes the whole case unresolvable, which is the
 * honest rule.
 */
export const renderCase = (
  ordinal: number,
  split: Split,
  merchantSlug: string,
  plan: CasePlan,
  rng: Rng,
): RenderedCase => {
  const refs = refsFor(ordinal);
  const grossMinor = rng.pick(AMOUNT_CHOICES);
  const method = rng.pick(split === 'development' ? DEVELOPMENT_METHODS : METHOD_CHOICES);
  const capturedAt = drawCaptureDate(rng);
  const variant = rng.int(0, 7);
  // Drawn BEFORE any cause is applied and never derived from one, so neither the lateness
  // nor the size of a discrepancy can be read backwards into which cause produced it.
  const jitterDays = rng.int(0, 1);
  const varianceScaleBps = rng.int(20, 900);
  const input = { variant, varianceScaleBps };

  const life = cleanLifecycle(refs, grossMinor, method, capturedAt, jitterDays);
  const results = plan.adversarial
    ? [ADVERSARIAL_TRANSFORM(life, input, refs)]
    : plan.causes.map((cause) =>
        cause === 'COMPOUND'
          ? TRANSFORMS.MDR_FEE(life, input, refs)
          : TRANSFORMS[cause as SingleCause](life, input, refs),
      );

  const baseRecords = [...emit(life), ...emitAdjustments(life)];
  const visibleRecords = [
    ...splitFeeLines(applyAccountedAdjustments(baseRecords, refs, rng), refs, rng),
    ...noiseRecords(refs, capturedAt, grossMinor, rng),
  ];

  const allProvable = results.every((result) => result.disposition === 'RESOLVE');
  const discrepancyMinor =
    life.unexplainedMinor + (life.feeRecordsPresent ? 0n : life.feeMinor + life.taxMinor);
  const cyclesLate = Math.max(
    0,
    Math.round(
      (life.settledAt.getTime() - expectedSettlementFor(capturedAt).getTime()) / 172_800_000,
    ),
  );

  const bucket: ConfigurationBucket = {
    amountBand: amountBandOf(grossMinor),
    timingBand: timingBandOf(cyclesLate),
    lineCountBand: lineCountBandOf(life.split ? 2 : 1),
    paymentMethod: method,
  };

  const causes: readonly CauseCode[] =
    plan.causes.length > 1 ? [...plan.causes].sort() : plan.causes;

  return {
    blueprint: {
      paymentId: refs.payment,
      merchantSlug,
      split,
      trueCauses: causes,
      trueCauseTuple: causeTupleKey(causes),
      trueDisposition: allProvable ? 'RESOLVE' : 'ESCALATE',
      bucket,
      grossMinor,
      paymentMethod: method,
      capturedAt,
      expectedResidual: true,
      discrepancyMinor,
      injection: {
        variant,
        components: results.map((result) => result.detail),
        compound: causes.length > 1,
      },
    },
    visibleRecords,
    bucket,
  };
};
