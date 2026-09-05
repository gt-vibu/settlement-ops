import { describe, it, expect } from 'vitest';
import { CASE_STATES, TRANSITION_ACTORS, type CaseState } from './case-state.js';
import {
  TRANSITIONS,
  allowedTargets,
  canTransition,
  isActorPermitted,
  requiresOutcomeRecord,
} from './case-transitions.js';

describe('transition table integrity', () => {
  it('every transition references declared states', () => {
    for (const t of TRANSITIONS) {
      expect(CASE_STATES).toContain(t.from);
      expect(CASE_STATES).toContain(t.to);
    }
  });

  it('every transition names at least one authorized actor', () => {
    for (const t of TRANSITIONS) {
      expect(t.actors.length).toBeGreaterThan(0);
      for (const actor of t.actors) expect(TRANSITION_ACTORS).toContain(actor);
    }
  });

  it('the AI agent is not an actor anywhere in the state machine', () => {
    // specs/STATE_MACHINE.md section 5 rule 2. The agent proposes; it never moves a case.
    expect(TRANSITION_ACTORS as readonly string[]).not.toContain('AGENT');
    for (const t of TRANSITIONS) {
      expect(t.actors as readonly string[]).not.toContain('AGENT');
    }
  });

  it('every non-terminal state except CLOSED has at least one exit', () => {
    // Readiness risk A-4: a reachable state with no exit strands the case.
    for (const state of CASE_STATES) {
      if (state === 'CLOSED') continue;
      expect(allowedTargets(state).length, `${state} has no exit`).toBeGreaterThan(0);
    }
  });

  it('has no duplicate from/to pairs', () => {
    const seen = new Set<string>();
    for (const t of TRANSITIONS) {
      const key = `${t.from}->${t.to}`;
      expect(seen.has(key), `duplicate ${key}`).toBe(false);
      seen.add(key);
    }
  });
});

describe('legal transitions (one positive test each)', () => {
  it.each(TRANSITIONS.map((t) => [t.from, t.to] as const))('%s -> %s is legal', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });
});

describe('illegal transitions (specs/STATE_MACHINE.md section 6)', () => {
  const ILLEGAL: readonly (readonly [CaseState, CaseState])[] = [
    ['EXCEPTION', 'STAGED'],
    ['EXCEPTION', 'APPROVED'],
    ['EXCEPTION', 'CLOSED'],
    ['INVESTIGATING', 'CLOSED'],
    ['INVESTIGATING', 'APPROVED'],
    ['ACTION_PROPOSED', 'STAGED'],
    ['ACTION_PROPOSED', 'APPLIED'],
    ['APPROVAL_PENDING', 'STAGED'],
    ['APPROVAL_PENDING', 'APPLIED'],
    ['APPROVED', 'APPLIED'],
    ['STAGED', 'CLOSED'],
    ['APPLIED', 'CLOSED'],
    ['CLOSED', 'APPROVED'],
    ['CLOSED', 'STAGED'],
    ['RECONCILED', 'INVESTIGATING'],
    ['NORMALIZED', 'EXCEPTION'],
    ['RECEIVED', 'CLOSED'],
  ];

  it.each(ILLEGAL)('%s -> %s is rejected', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it('approval bypass is impossible: no path reaches STAGED except from APPROVED', () => {
    const intoStaged = TRANSITIONS.filter((t) => t.to === 'STAGED').map((t) => t.from);
    expect(intoStaged).toEqual(['APPROVED']);
  });

  it('only a human APPROVER can approve', () => {
    expect(isActorPermitted('APPROVAL_PENDING', 'APPROVED', 'APPROVER')).toBe(true);
    expect(isActorPermitted('APPROVAL_PENDING', 'APPROVED', 'OPERATOR')).toBe(false);
    expect(isActorPermitted('APPROVAL_PENDING', 'APPROVED', 'SYSTEM')).toBe(false);
  });

  it('only an ADMIN can reopen a closed case', () => {
    expect(isActorPermitted('CLOSED', 'REOPENED', 'ADMIN')).toBe(true);
    expect(isActorPermitted('CLOSED', 'REOPENED', 'OPERATOR')).toBe(false);
  });
});

describe('readiness gaps closed by D4', () => {
  it('A-2: a verified RESOLVE with action NONE can close via APPROVED -> CLOSED', () => {
    expect(canTransition('APPROVED', 'CLOSED')).toBe(true);
    expect(requiresOutcomeRecord('APPROVED', 'CLOSED')).toBe(true);
  });

  it('A-4(a): EXCEPTION can escalate when the AI kill switch is off', () => {
    expect(canTransition('EXCEPTION', 'ESCALATED')).toBe(true);
  });

  it('A-4(b): REQUESTING_EVIDENCE can escalate when evidence never arrives', () => {
    expect(canTransition('REQUESTING_EVIDENCE', 'ESCALATED')).toBe(true);
  });

  it('A-4(c): a proposal can be invalidated by late evidence', () => {
    expect(canTransition('ACTION_PROPOSED', 'INVESTIGATING')).toBe(true);
    expect(canTransition('APPROVAL_PENDING', 'INVESTIGATING')).toBe(true);
  });

  it('closure always requires an outcome except via RECONCILED', () => {
    const intoClosed = TRANSITIONS.filter((t) => t.to === 'CLOSED');
    for (const t of intoClosed) {
      if (t.from === 'RECONCILED') expect(t.requiresOutcome ?? false).toBe(false);
      else expect(t.requiresOutcome).toBe(true);
    }
  });
});

describe('role hierarchy (specs/AUTHORIZATION_MODEL.md section 4)', () => {
  it('lets a senior human role satisfy a transition permitting a junior one', () => {
    // EXCEPTION -> ESCALATED permits SYSTEM and OPERATOR.
    expect(isActorPermitted('EXCEPTION', 'ESCALATED', 'OPERATOR')).toBe(true);
    expect(isActorPermitted('EXCEPTION', 'ESCALATED', 'APPROVER')).toBe(true);
    expect(isActorPermitted('EXCEPTION', 'ESCALATED', 'ADMIN')).toBe(true);
  });

  it('does NOT let a junior role satisfy a senior-only transition', () => {
    // APPROVAL_PENDING -> APPROVED permits APPROVER only.
    expect(isActorPermitted('APPROVAL_PENDING', 'APPROVED', 'APPROVER')).toBe(true);
    expect(isActorPermitted('APPROVAL_PENDING', 'APPROVED', 'ADMIN')).toBe(true);
    expect(isActorPermitted('APPROVAL_PENDING', 'APPROVED', 'OPERATOR')).toBe(false);
  });

  it('keeps SYSTEM outside the human hierarchy in both directions', () => {
    // No human inherits a SYSTEM-only transition...
    expect(isActorPermitted('APPROVED', 'STAGED', 'SYSTEM')).toBe(true);
    expect(isActorPermitted('APPROVED', 'STAGED', 'ADMIN')).toBe(false);
    expect(isActorPermitted('APPROVED', 'STAGED', 'APPROVER')).toBe(false);
    // ...and SYSTEM does not inherit a human-only one.
    expect(isActorPermitted('APPROVAL_PENDING', 'APPROVED', 'SYSTEM')).toBe(false);
    expect(isActorPermitted('CLOSED', 'REOPENED', 'SYSTEM')).toBe(false);
  });

  it('still refuses any actor on an illegal transition', () => {
    for (const actor of TRANSITION_ACTORS) {
      expect(isActorPermitted('EXCEPTION', 'STAGED', actor)).toBe(false);
    }
  });
});
