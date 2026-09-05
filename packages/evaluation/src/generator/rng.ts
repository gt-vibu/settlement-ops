/**
 * Deterministic pseudo-random source.
 *
 * `Math.random()` would make the dataset unreproducible, which would make every number
 * downstream unverifiable. This is a small, explicit, seeded generator: the same root
 * seed always produces the same 410 cases, on any machine.
 *
 * Not cryptographic, and must never be used where unpredictability matters.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates, returning a new array. */
  shuffle<T>(items: readonly T[]): T[];
  bool(probability: number): boolean;
}

/** mulberry32 - 32-bit state, good enough distribution, trivially portable. */
export const createRng = (seed: number): Rng => {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));

  return {
    next,
    int,
    pick: <T>(items: readonly T[]): T => {
      const item = items[int(0, items.length - 1)];
      if (item === undefined) throw new Error('pick from empty list');
      return item;
    },
    shuffle: <T>(items: readonly T[]): T[] => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = int(0, i);
        const a = copy[i];
        const b = copy[j];
        if (a !== undefined && b !== undefined) {
          copy[i] = b;
          copy[j] = a;
        }
      }
      return copy;
    },
    bool: (probability: number): boolean => next() < probability,
  };
};

/**
 * Per-split seed derived from the root.
 *
 * Derivation rather than five independent seeds means the whole dataset is reproducible
 * from one number in the manifest, and regenerating one split cannot silently perturb
 * another.
 */
export const deriveSeed = (rootSeed: number, label: string): number => {
  let hash = rootSeed >>> 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (Math.imul(hash ^ label.charCodeAt(i), 0x01000193) + 0x9e3779b9) >>> 0;
  }
  return hash >>> 0;
};
