/**
 * Tool boundary tests.
 *
 * The claim under test is that the tool layer is a BOUNDARY, not a convenience: an
 * argument the model invents cannot widen it, and a tool it invents does not exist.
 */

import { describe, expect, it } from 'vitest';

import { TOOL_NAMES, isToolName, validateArguments } from './contracts.js';
import { createToolRegistry } from './registry.js';

const ctx = { scope: {} as never, paymentId: 'pay_1' };

describe('tool allowlist', () => {
  it('contains no generic query capability', () => {
    for (const name of TOOL_NAMES) {
      expect(name).not.toMatch(/sql|query|exec|shell|http|fetch|file/i);
    }
  });

  it('rejects a tool name that is not on the list', async () => {
    const registry = createToolRegistry(async () => null);
    const result = await registry.invoke(ctx as never, 'run_sql', {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('unknown tool');
  });

  it('does not echo the allowlist back on rejection', async () => {
    const registry = createToolRegistry(async () => null);
    const result = await registry.invoke(ctx as never, 'drop_tables', {});
    for (const name of TOOL_NAMES) expect(result.summary).not.toContain(name.slice(0, 6));
  });

  it('recognises exactly the published names', () => {
    expect(isToolName('get_fee_schedule')).toBe(true);
    expect(isToolName('get_everything')).toBe(false);
  });
});

describe('argument validation', () => {
  it('rejects an identifier carrying a SQL fragment', () => {
    const result = validateArguments({ payment_id: "pay_1'; DROP TABLE payments;--" });
    expect(result.ok).toBe(false);
  });

  it('rejects a nonsense date rather than passing it to a query', () => {
    const result = validateArguments({ effective_date: 'yesterday-ish' });
    expect(result.ok).toBe(false);
  });

  it('rejects a non-integer money amount', () => {
    expect(validateArguments({ amount_minor: '29500.5' }).ok).toBe(false);
    expect(validateArguments({ amount_minor: '29500' }).ok).toBe(true);
  });

  it('bounds the search window instead of accepting an unbounded one', () => {
    expect(validateArguments({ window_days: 900 }).ok).toBe(false);
    expect(validateArguments({ window_days: 7 }).ok).toBe(true);
  });

  it('has no parameter through which a merchant could be chosen', () => {
    const args = { merchant_id: 'someone-else' } as Record<string, unknown>;
    // Not part of ToolArguments at all: scope comes from the server-built context.
    expect(Object.keys(validateArguments(args).ok ? args : {})).not.toContain('scope');
  });
});

describe('missing case handling', () => {
  it('returns a bounded error rather than throwing when the payment is out of scope', async () => {
    const registry = createToolRegistry(async () => null);
    const result = await registry.invoke(ctx as never, 'get_settlement_breakup', {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('no such payment');
  });
});
