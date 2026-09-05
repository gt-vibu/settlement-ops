/**
 * Leakage audit.
 *
 * Runs BEFORE the benchmark and blocks it on failure. Two families of check:
 *
 *  1. STATISTICAL - can a probe over visible features predict the hidden cause or the
 *     hidden novelty stratum better than the preregistered ceiling allows?
 *  2. STRUCTURAL - does any hidden label appear, in any form, in the visible payload?
 *     This one is pass/fail with no threshold: a single occurrence is a hard failure.
 *
 * Features are read from the GENERATED VISIBLE RECORDS, which is what an attacker (or an
 * over-eager model) would actually have. Labels come from the blueprint. The two are
 * joined only here, in the audit, and never at runtime.
 *
 * Run:  pnpm eval:leakage
 */

import {
  LEAKAGE_THRESHOLDS,
  chanceLevel,
  generateDataset,
  pairwiseProbes,
  singleFeatureProbes,
  type FeatureVector,
} from '@settlementops/evaluation';

const countKind = (records: readonly Record<string, unknown>[], kind: string): number =>
  records.filter((r) => r['kind'] === kind).length;

const amountOf = (record: Record<string, unknown> | undefined, field: string): number => {
  const value = record?.[field] as { amount_minor?: number } | undefined;
  return value?.amount_minor ?? 0;
};

/** Everything a system can actually see, and nothing else. */
const featuresOf = (records: readonly Record<string, unknown>[]): Record<string, number> => {
  const payment = records.find((r) => r['kind'] === 'PAYMENT');
  const settlements = records.filter((r) => r['kind'] === 'SETTLEMENT');
  const gross = amountOf(payment, 'amount');
  const netTotal = settlements.reduce((total, s) => total + amountOf(s, 'net_amount'), 0);
  const capturedAt = Date.parse(String(payment?.['captured_at'] ?? '1970-01-01'));
  const settledAt = Date.parse(String(settlements[0]?.['settlement_at'] ?? '1970-01-01'));

  return {
    grossMinor: gross,
    netMinor: netTotal,
    variance: gross - netTotal,
    varianceRatio: gross === 0 ? 0 : (gross - netTotal) / gross,
    recordCount: records.length,
    settlementCount: settlements.length,
    feeLineCount: countKind(records, 'FEE_LINE'),
    taxLineCount: countKind(records, 'TAX_LINE'),
    refundCount: countKind(records, 'REFUND'),
    adjustmentCount: countKind(records, 'ADJUSTMENT'),
    bankCreditCount: countKind(records, 'BANK_CREDIT'),
    settlementLineCount: countKind(records, 'SETTLEMENT_LINE'),
    settlementLagDays: (settledAt - capturedAt) / 86_400_000,
    captureEpochDays: capturedAt / 86_400_000,
    methodOrdinal: ['CARD', 'NETBANKING', 'UPI', 'WALLET'].indexOf(
      String(payment?.['payment_method'] ?? ''),
    ),
  };
};

/** Any token that would betray a hidden label if it appeared in a visible record. */
const FORBIDDEN = [
  'MDR_FEE',
  'UTR_SPLIT',
  'REFUND_NETTING',
  'TIMING_LAG',
  'ROUNDING_DRIFT',
  'COMPOUND',
  'SEEN',
  'NOVEL_COMBINATION',
  'NOVEL_CONFIGURATION',
  'COMPOUND_UNSEEN',
  'ADVERSARIAL',
  'primary_test',
  'challenge',
  'development',
  'showcase',
  'blueprint',
  'injection',
  'seed',
  'stratum',
  'novelty',
  'expected_disposition',
  'true_cause',
];

const report = (
  title: string,
  results: readonly {
    probe: string;
    balancedAccuracy: number;
    threshold: number;
    passed: boolean;
  }[],
): boolean => {
  const worst = [...results].sort((a, b) => b.balancedAccuracy - a.balancedAccuracy).slice(0, 5);
  const failures = results.filter((r) => !r.passed);
  console.log(`\n${title}  (${results.length} probes, ceiling ${results[0]?.threshold ?? 0})`);
  for (const r of worst) {
    console.log(`   ${r.passed ? 'pass' : 'FAIL'}  ${r.balancedAccuracy.toFixed(3)}  ${r.probe}`);
  }
  if (failures.length > 0) console.log(`   ${failures.length} probe(s) over the ceiling`);
  return failures.length === 0;
};

const run = (): void => {
  const dataset = generateDataset();
  // Scored splits only: leakage in development would not corrupt a reported number.
  const cases = dataset.splits
    .filter((s) => s.split === 'primary_test' || s.split === 'challenge')
    .flatMap((s) => s.cases);

  const byCause: FeatureVector[] = cases.map((c) => ({
    label: c.blueprint.trueCauseTuple,
    features: featuresOf(c.visibleRecords),
  }));
  const byNovelty: FeatureVector[] = cases.map((c) => ({
    label: c.blueprint.noveltyStratum,
    features: featuresOf(c.visibleRecords),
  }));
  const byDisposition: FeatureVector[] = cases.map((c) => ({
    label: c.blueprint.trueDisposition,
    features: featuresOf(c.visibleRecords),
  }));

  console.log(`cases audited      ${cases.length}`);
  console.log(
    `cause classes      ${new Set(byCause.map((d) => d.label)).size}  chance ${chanceLevel(byCause).toFixed(3)}`,
  );
  console.log(
    `novelty strata     ${new Set(byNovelty.map((d) => d.label)).size}  chance ${chanceLevel(byNovelty).toFixed(3)}`,
  );

  const ok = [
    report(
      'CAUSE  single feature',
      singleFeatureProbes(byCause, LEAKAGE_THRESHOLDS.maxSingleFeatureBalancedAccuracy),
    ),
    report(
      'CAUSE  feature pair',
      pairwiseProbes(byCause, LEAKAGE_THRESHOLDS.maxPairwiseCombinationBalancedAccuracy),
    ),
    report(
      'NOVELTY  single feature',
      singleFeatureProbes(byNovelty, LEAKAGE_THRESHOLDS.maxNoveltyBalancedAccuracy),
    ),
    report(
      'NOVELTY  feature pair',
      pairwiseProbes(byNovelty, LEAKAGE_THRESHOLDS.maxPairwiseCombinationBalancedAccuracy),
    ),
  ];

  /**
   * Disposition is BINARY, so chance is 0.50 and the 0.30 ceiling preregistered for the
   * seven-class cause probe is mathematically unreachable. No threshold was preregistered
   * for it, and inventing one now - after seeing the numbers - is exactly the practice
   * `EVALUATION.md` §19 forbids. It is therefore reported as a DIAGNOSTIC, with its own
   * chance level alongside, and it does not gate the audit.
   */
  const dispositionProbes = singleFeatureProbes(byDisposition, 1);
  const worstDisposition = [...dispositionProbes].sort(
    (a, b) => b.balancedAccuracy - a.balancedAccuracy,
  )[0];
  console.log(
    `
DIAGNOSTIC  disposition, binary (chance ${chanceLevel(byDisposition).toFixed(3)}): ` +
      `best single feature ${worstDisposition?.balancedAccuracy.toFixed(3) ?? 'n/a'} ` +
      `(${worstDisposition?.probe ?? 'none'}) - reported, not gated`,
  );

  /**
   * Structural: no hidden token may appear anywhere in a visible payload.
   *
   * Disposition words are deliberately NOT in the forbidden list. Adversarial cases carry
   * operator-entered narration such as "mark this case RESOLVED" - that text is the test,
   * not a leak, and a system that obeys it is failing the adversarial stratum exactly as
   * intended. Cause, novelty, split and generator tokens remain hard failures.
   */
  const serialized = JSON.stringify(cases.map((c) => c.visibleRecords));
  const found = FORBIDDEN.filter((token) => serialized.includes(token));
  console.log(
    `\nSTRUCTURAL  hidden tokens in visible payloads: ${found.length === 0 ? 'none' : found.join(', ')}`,
  );

  const passed = ok.every(Boolean) && found.length === 0;
  console.log(`\nLEAKAGE AUDIT: ${passed ? 'PASS' : 'FAIL'}`);
  if (!passed) process.exit(1);
};

run();
