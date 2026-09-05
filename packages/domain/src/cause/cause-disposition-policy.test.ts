import { describe, it, expect } from 'vitest';
import { CAUSE_CODES } from './cause-code.js';
import { DISPOSITIONS, requiresStaging } from './disposition.js';
import {
  CAUSE_DISPOSITION_POLICY,
  canEverResolve,
  isDispositionPermitted,
} from './cause-disposition-policy.js';

describe('cause to disposition policy', () => {
  it('covers every cause in the closed taxonomy', () => {
    for (const cause of CAUSE_CODES) {
      expect(CAUSE_DISPOSITION_POLICY[cause].length).toBeGreaterThan(0);
    }
  });

  it('AMBIGUOUS can never resolve', () => {
    // specs/CAUSE_TAXONOMY.md: this is definitional, not a tuned threshold.
    expect(canEverResolve('AMBIGUOUS')).toBe(false);
    expect(isDispositionPermitted('AMBIGUOUS', 'RESOLVE')).toBe(false);
    expect(isDispositionPermitted('AMBIGUOUS', 'ESCALATE')).toBe(true);
  });

  it('ROUNDING_DRIFT may resolve or escalate but never request evidence', () => {
    expect(isDispositionPermitted('ROUNDING_DRIFT', 'RESOLVE')).toBe(true);
    expect(isDispositionPermitted('ROUNDING_DRIFT', 'ESCALATE')).toBe(true);
    expect(isDispositionPermitted('ROUNDING_DRIFT', 'REQUEST_EVIDENCE')).toBe(false);
  });

  it('every policy entry uses only declared dispositions', () => {
    for (const cause of CAUSE_CODES) {
      for (const d of CAUSE_DISPOSITION_POLICY[cause]) expect(DISPOSITIONS).toContain(d);
    }
  });

  it('only a NONE action skips staging', () => {
    expect(requiresStaging('NONE')).toBe(false);
    expect(requiresStaging('STAGE_LEDGER_ADJUSTMENT')).toBe(true);
    expect(requiresStaging('DRAFT_EVIDENCE_REQUEST')).toBe(true);
  });
});
