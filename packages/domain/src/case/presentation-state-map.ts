/**
 * Product-label mapping (specs/STATE_MACHINE.md v2.0.0 section 7).
 *
 * specs/PRD.md section 18 presents a simplified label set for the UI and explicitly
 * subordinates itself to the canonical state machine. The mapping is isolated in this
 * one file so the backend's seventeen states are never diluted by presentation
 * concerns, and so the UI cannot become a second source of state truth.
 */

import type { CaseState } from './case-state.js';

export const PRODUCT_LABELS = [
  'NEW',
  'MATCHED',
  'EXCEPTION',
  'INVESTIGATING',
  'ACTION_PROPOSED',
  'AWAITING_APPROVAL',
  'REQUESTING_EVIDENCE',
  'STAGED',
  'ESCALATED',
  'CLOSED',
] as const;

export type ProductLabel = (typeof PRODUCT_LABELS)[number];

const MAP: Readonly<Record<CaseState, ProductLabel | null>> = {
  RECEIVED: 'NEW',
  NORMALIZED: 'NEW',
  MATCHING: 'MATCHED',
  RECONCILED: 'MATCHED',
  EXCEPTION: 'EXCEPTION',
  INVESTIGATING: 'INVESTIGATING',
  ACTION_PROPOSED: 'ACTION_PROPOSED',
  APPROVAL_PENDING: 'AWAITING_APPROVAL',
  REQUESTING_EVIDENCE: 'REQUESTING_EVIDENCE',
  STAGED: 'STAGED',
  APPLIED: 'STAGED',
  OUTCOME_LOGGED: 'STAGED',
  ESCALATED: 'ESCALATED',
  REJECTED: 'ESCALATED',
  CLOSED: 'CLOSED',
  APPROVED: null,
  REOPENED: null,
};

/** null means transient/administrative - not surfaced as a product state. */
export const toProductLabel = (state: CaseState): ProductLabel | null => MAP[state];
