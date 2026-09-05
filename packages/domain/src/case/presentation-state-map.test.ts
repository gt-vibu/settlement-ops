import { describe, it, expect } from 'vitest';
import { CASE_STATES } from './case-state.js';
import { PRODUCT_LABELS, toProductLabel } from './presentation-state-map.js';

describe('product label mapping', () => {
  it('maps every canonical state', () => {
    for (const state of CASE_STATES) {
      const label = toProductLabel(state);
      if (label !== null) expect(PRODUCT_LABELS).toContain(label);
    }
  });

  it('keeps APPROVED and REOPENED out of the product label set', () => {
    expect(toProductLabel('APPROVED')).toBeNull();
    expect(toProductLabel('REOPENED')).toBeNull();
  });

  it('presents the staging lifecycle as a single product state', () => {
    expect(toProductLabel('STAGED')).toBe('STAGED');
    expect(toProductLabel('APPLIED')).toBe('STAGED');
    expect(toProductLabel('OUTCOME_LOGGED')).toBe('STAGED');
  });
});
