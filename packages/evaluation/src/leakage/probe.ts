/**
 * Leakage probes.
 *
 * The question is not "is there any signal in the visible records" - there is, and there
 * should be: a case with no fee record genuinely is more likely to be `MDR_FEE`, and a
 * real operator would notice that too. The question is whether some visible field
 * effectively ENCODES the injected label, which would make the benchmark measure lookup
 * rather than reasoning.
 *
 * Thresholds are preregistered in `EXPERIMENT_CONSTANTS.md` §9 so the judgement cannot be
 * made after seeing the number.
 *
 * Deliberately implemented without an ML dependency: a binned majority-class predictor is
 * a STRONGER probe than a shallow tree for this purpose (it can memorise every cell) and
 * it is auditable by reading forty lines of code.
 */

export interface FeatureVector {
  readonly label: string;
  readonly features: Readonly<Record<string, number>>;
}

const BINS = 8;

/** Equal-frequency binning: robust to skew, and it cannot be gamed by an outlier. */
const binIndices = (values: readonly number[]): number[] => {
  const sorted = [...values].sort((a, b) => a - b);
  const cuts: number[] = [];
  for (let i = 1; i < BINS; i += 1) {
    const at = sorted[Math.floor((i / BINS) * sorted.length)];
    if (at !== undefined) cuts.push(at);
  }
  const unique = [...new Set(cuts)].sort((a, b) => a - b);
  return values.map((v) => {
    let index = 0;
    for (const cut of unique) if (v >= cut) index += 1;
    return index;
  });
};

/**
 * Cross-validated balanced accuracy of a majority-class predictor over the given cells.
 *
 * CROSS-VALIDATION IS NOT OPTIONAL HERE, and the first implementation got it wrong. An
 * in-sample majority-class predictor over 64 cross-binned cells and 180 cases simply
 * MEMORISES: most cells hold one or two cases, so it reports high accuracy for any pair
 * of features and every probe "fails". That measures overfitting, not leakage.
 *
 * `LEAKAGE_AUDIT.md` asks whether a feature PREDICTS the hidden label, which is a claim
 * about held-out data. Five folds: the majority class is fitted on four and scored on the
 * fifth, and a cell unseen in training predicts the training-set majority.
 */
const FOLDS = 5;

const crossValidatedBalancedAccuracy = (
  cells: readonly number[],
  labels: readonly string[],
): number => {
  const total = new Map<string, number>();
  const correct = new Map<string, number>();

  for (let fold = 0; fold < FOLDS; fold += 1) {
    const byCell = new Map<number, Map<string, number>>();
    const global = new Map<string, number>();

    for (let i = 0; i < cells.length; i += 1) {
      if (i % FOLDS === fold) continue; // held out
      const cell = cells[i] ?? 0;
      const label = labels[i] ?? '';
      const counts = byCell.get(cell) ?? new Map<string, number>();
      counts.set(label, (counts.get(label) ?? 0) + 1);
      byCell.set(cell, counts);
      global.set(label, (global.get(label) ?? 0) + 1);
    }

    const majority = (counts: Map<string, number> | undefined): string => {
      let best = '';
      let bestCount = -1;
      for (const [label, count] of counts ?? global) {
        if (count > bestCount) {
          best = label;
          bestCount = count;
        }
      }
      return best;
    };

    const fallback = majority(undefined);
    for (let i = 0; i < cells.length; i += 1) {
      if (i % FOLDS !== fold) continue;
      const label = labels[i] ?? '';
      const counts = byCell.get(cells[i] ?? 0);
      const predicted = counts === undefined ? fallback : majority(counts);
      total.set(label, (total.get(label) ?? 0) + 1);
      if (predicted === label) correct.set(label, (correct.get(label) ?? 0) + 1);
    }
  }

  let sum = 0;
  for (const [label, count] of total) sum += (correct.get(label) ?? 0) / count;
  return total.size === 0 ? 0 : sum / total.size;
};

export interface ProbeResult {
  readonly probe: string;
  readonly balancedAccuracy: number;
  readonly threshold: number;
  readonly passed: boolean;
}

export const singleFeatureProbes = (
  data: readonly FeatureVector[],
  threshold: number,
): readonly ProbeResult[] => {
  const names = Object.keys(data[0]?.features ?? {});
  const labels = data.map((d) => d.label);
  return names.map((name) => {
    const cells = binIndices(data.map((d) => d.features[name] ?? 0));
    const accuracy = crossValidatedBalancedAccuracy(cells, labels);
    return {
      probe: `single:${name}`,
      balancedAccuracy: accuracy,
      threshold,
      passed: accuracy <= threshold,
    };
  });
};

/** Every ordered pair of features, cross-binned. Depth-2 in the strongest sense. */
export const pairwiseProbes = (
  data: readonly FeatureVector[],
  threshold: number,
): readonly ProbeResult[] => {
  const names = Object.keys(data[0]?.features ?? {});
  const labels = data.map((d) => d.label);
  const binned = new Map<string, number[]>();
  for (const name of names) binned.set(name, binIndices(data.map((d) => d.features[name] ?? 0)));

  const results: ProbeResult[] = [];
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const a = binned.get(names[i] ?? '') ?? [];
      const b = binned.get(names[j] ?? '') ?? [];
      const cells = a.map((value, index) => value * BINS + (b[index] ?? 0));
      const accuracy = crossValidatedBalancedAccuracy(cells, labels);
      results.push({
        probe: `pair:${names[i]}+${names[j]}`,
        balancedAccuracy: accuracy,
        threshold,
        passed: accuracy <= threshold,
      });
    }
  }
  return results;
};

export const chanceLevel = (data: readonly FeatureVector[]): number => {
  const labels = new Set(data.map((d) => d.label));
  return labels.size === 0 ? 0 : 1 / labels.size;
};
