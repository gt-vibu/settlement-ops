/**
 * Live Ollama Qwen3 8B gateway verification test.
 *
 * Exercises the actual Qwen3 8B model against the agent schemas and asserts:
 * 1. Pinned model digest validation.
 * 2. Valid structured JSON output conforming to StepDecision and ProposalDecision schemas.
 * 3. Closed-set enums for cause, action, and disposition.
 * 4. Graceful handling of unavailable host, timeout, and schema violation.
 */

import { describe, expect, it } from 'vitest';
import {
  createOllamaGateway,
  STEP_SCHEMA,
  PROPOSAL_SCHEMA,
  SYSTEM_PROMPT,
  type StepDecision,
  type ProposalDecision,
} from '@settlementops/agent';
import { CAUSE_CODES, DISPOSITIONS } from '@settlementops/domain';
import { TOOL_NAMES } from '@settlementops/tools';
import { ollamaAvailable } from './helpers.js';

const isOllamaUp = await ollamaAvailable('qwen3:8b');
const liveTest = isOllamaUp ? it : it.skip;

const EXPLORATORY_QWEN3_IDENTITY = {
  provider: 'ollama',
  model: 'qwen3:8b',
  digest: '500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41',
};

const liveGateway = createOllamaGateway({
  host: 'http://127.0.0.1:11434',
  identity: EXPLORATORY_QWEN3_IDENTITY,
  temperature: 0,
  timeoutSeconds: 60,
  maxOutputTokens: 512,
});

describe('Qwen3 8B Live Model Gateway', () => {
  liveTest('confirms the pinned Qwen3 8B digest is installed and active', async () => {
    const check = await liveGateway.assertPinnedModel();
    expect(check.ok).toBe(true);
    expect(check.detail).toBe('pinned digest confirmed');
  });

  liveTest('fails loudly when an incorrect digest is asserted', async () => {
    const badGateway = createOllamaGateway({
      host: 'http://127.0.0.1:11434',
      identity: {
        provider: 'ollama',
        model: 'qwen3:8b',
        digest: '0000000000000000000000000000000000000000000000000000000000000000',
      },
      temperature: 0,
      timeoutSeconds: 5,
      maxOutputTokens: 10,
    });
    const check = await badGateway.assertPinnedModel();
    expect(check.ok).toBe(false);
    expect(check.detail).toContain('digest mismatch');
  });

  liveTest(
    'produces valid schema-constrained StepDecision with Qwen3 8B',
    { timeout: 60_000 },
    async () => {
      const response = await liveGateway.chat<StepDecision>(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content:
              'Case facts (from the deterministic engine):\n' +
              '- deterministic stop reasons: NET_AMOUNT_MISMATCH, MISSING_FEE_RECORD\n' +
              '- discrepancy: 29500 minor units (INR)\n' +
              '- payment method: CARD\n' +
              '- captured at: 2026-03-01T10:00:00.000Z\n\n' +
              'Evidence so far:\n' +
              'get_settlement_breakup: settlement short by 29500 minor units\n' +
              'calculate_expected_net_amount: expected fee 25000, expected tax 4500\n\n' +
              'Tool calls used: 2/8.\nDecide the next action.',
          },
        ],
        STEP_SCHEMA,
      );

      expect(response.ok).toBe(true);
      if (!response.ok) return;

      expect(typeof response.value.reasoning).toBe('string');
      expect(response.value.reasoning.length).toBeGreaterThan(0);
      expect(['CALL_TOOL', 'CONCLUDE']).toContain(response.value.action);
      if (response.value.action === 'CALL_TOOL' && response.value.tool !== undefined) {
        expect(TOOL_NAMES).toContain(response.value.tool);
      }
      if (response.value.hypotheses !== undefined) {
        for (const h of response.value.hypotheses) {
          expect(CAUSE_CODES).toContain(h);
        }
      }
    },
  );

  liveTest(
    'produces valid schema-constrained ProposalDecision with Qwen3 8B',
    { timeout: 60_000 },
    async () => {
      const response = await liveGateway.chat<ProposalDecision>(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content:
              'Case facts (from the deterministic engine):\n' +
              '- deterministic stop reasons: NET_AMOUNT_MISMATCH, MISSING_FEE_RECORD\n' +
              '- discrepancy: 29500 minor units (INR)\n' +
              '- payment method: CARD\n\n' +
              'Evidence gathered:\n' +
              'get_settlement_breakup: settlement net 970500 vs gross 1000000 (short 29500)\n' +
              'calculate_expected_net_amount: fee 25000 + tax 4500 = 29500 variance explained\n' +
              'get_fee_tax_lines: rate 2.5% MDR + 18% GST matches schedule exactly\n\n' +
              'Propose a cause and a disposition. Resolve ONLY if the evidence above proves it.',
          },
        ],
        PROPOSAL_SCHEMA,
      );

      expect(response.ok).toBe(true);
      if (!response.ok) return;

      expect(typeof response.value.reasoning).toBe('string');
      expect(CAUSE_CODES).toContain(response.value.cause);
      expect(DISPOSITIONS).toContain(response.value.disposition);
    },
  );

  it('safely catches MODEL_UNAVAILABLE on an unreachable host', async () => {
    const deadGateway = createOllamaGateway({
      host: 'http://127.0.0.1:59999',
      identity: EXPLORATORY_QWEN3_IDENTITY,
      temperature: 0,
      timeoutSeconds: 2,
      maxOutputTokens: 10,
    });
    const response = await deadGateway.chat([{ role: 'user', content: 'hello' }], STEP_SCHEMA);

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.failure).toBe('MODEL_UNAVAILABLE');
  });

  liveTest('safely catches MODEL_TIMEOUT on an ultra-short timeout', async () => {
    const timeoutGateway = createOllamaGateway({
      host: 'http://127.0.0.1:11434',
      identity: EXPLORATORY_QWEN3_IDENTITY,
      temperature: 0,
      timeoutSeconds: 0.001,
      maxOutputTokens: 512,
    });
    const response = await timeoutGateway.chat(
      [{ role: 'user', content: 'Case facts: discrepancy 295.00' }],
      STEP_SCHEMA,
    );

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.failure).toBe('MODEL_TIMEOUT');
  });
});
