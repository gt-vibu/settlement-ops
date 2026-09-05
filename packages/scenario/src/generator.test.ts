import { describe, it, expect } from 'vitest';
import { SCENARIOS, catalog, isScenarioId, scenarioById } from './definitions.js';
import { generateScenarioBatch } from './generator.js';

describe('scenario catalog', () => {
  it('resolves every declared scenario', () => {
    for (const definition of SCENARIOS) {
      expect(isScenarioId(definition.id)).toBe(true);
      expect(scenarioById(definition.id)).not.toBeNull();
    }
  });

  it('rejects an unknown scenario id', () => {
    expect(scenarioById('does-not-exist')).toBeNull();
    expect(isScenarioId('does-not-exist')).toBe(false);
  });

  it('never exposes the expected cause through the API catalog projection', () => {
    // The demo checkpoint is for the operator running a demo, not for the system under
    // test. Leaking it through the catalog would hand the answer to the agent.
    const serialized = JSON.stringify(catalog());
    for (const definition of SCENARIOS) {
      if (definition.expectedCause === 'NONE') continue;
      expect(serialized).not.toContain(definition.expectedCause);
    }
    expect(serialized).not.toContain('expectedCause');
    expect(serialized).not.toContain('expected_cause');
  });
});

describe('deterministic generation', () => {
  it.each(SCENARIOS.map((s) => s.id))('%s produces identical records for one seed', (id) => {
    const definition = scenarioById(id);
    if (definition === null) throw new Error('missing definition');
    const a = generateScenarioBatch(definition, 4242);
    const b = generateScenarioBatch(definition, 4242);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces different source ids for different seeds', () => {
    const definition = scenarioById('fee-tax-discrepancy');
    if (definition === null) throw new Error('missing definition');
    const a = JSON.stringify(generateScenarioBatch(definition, 1));
    const b = JSON.stringify(generateScenarioBatch(definition, 2));
    expect(a).not.toBe(b);
  });

  it('emits ordinary import records with no scenario marker on any record', () => {
    // Downstream, a scenario record must be indistinguishable from a real one.
    for (const definition of SCENARIOS) {
      const batch = generateScenarioBatch(definition, 7);
      for (const record of batch.records) {
        const keys = Object.keys(record);
        expect(keys).not.toContain('scenario_id');
        expect(keys).not.toContain('expected_cause');
        expect(keys).not.toContain('defect');
        expect(keys).not.toContain('cause');
      }
    }
  });

  it('produces a complete lifecycle for every scenario', () => {
    for (const definition of SCENARIOS) {
      const batch = generateScenarioBatch(definition, 11);
      const kinds = batch.records.map((r) => r.kind);
      expect(kinds).toContain('PAYMENT');
      expect(kinds).toContain('SETTLEMENT');
      expect(kinds).toContain('SETTLEMENT_LINE');
      expect(kinds).toContain('BANK_CREDIT');
    }
  });

  it('gives the clean scenario a fee record and the fee-discrepancy scenario none', () => {
    const clean = scenarioById('clean-settlement');
    const broken = scenarioById('fee-tax-discrepancy');
    if (clean === null || broken === null) throw new Error('missing definition');
    const cleanKinds = generateScenarioBatch(clean, 3).records.map((r) => r.kind);
    const brokenKinds = generateScenarioBatch(broken, 3).records.map((r) => r.kind);
    expect(cleanKinds).toContain('FEE_LINE');
    expect(brokenKinds).not.toContain('FEE_LINE');
  });

  it('gives the split scenario two settlements and two bank credits', () => {
    const definition = scenarioById('split-settlement');
    if (definition === null) throw new Error('missing definition');
    const records = generateScenarioBatch(definition, 5).records;
    expect(records.filter((r) => r.kind === 'SETTLEMENT')).toHaveLength(2);
    expect(records.filter((r) => r.kind === 'BANK_CREDIT')).toHaveLength(2);
    expect(records.filter((r) => r.kind === 'SETTLEMENT_LINE')).toHaveLength(2);
  });

  it('gives the ambiguous scenario two equally plausible adjustments', () => {
    const definition = scenarioById('ambiguous-adjustment');
    if (definition === null) throw new Error('missing definition');
    const adjustments = generateScenarioBatch(definition, 5).records.filter(
      (r) => r.kind === 'ADJUSTMENT',
    );
    expect(adjustments).toHaveLength(2);
    const amounts = adjustments.map((a) => JSON.stringify(a.amount));
    // Same magnitude, different reason codes: nothing visible distinguishes them.
    expect(amounts[0]).toBe(amounts[1]);
    expect(adjustments[0]?.reason_code).not.toBe(adjustments[1]?.reason_code);
  });

  it('uses only integer minor units for every amount', () => {
    for (const definition of SCENARIOS) {
      for (const record of generateScenarioBatch(definition, 9).records) {
        for (const [key, value] of Object.entries(record)) {
          if (!key.includes('amount')) continue;
          const amount = value as { amount_minor?: number; currency?: string };
          if (amount.amount_minor === undefined) continue;
          expect(Number.isInteger(amount.amount_minor)).toBe(true);
          expect(amount.currency).toBe('INR');
        }
      }
    }
  });
});
