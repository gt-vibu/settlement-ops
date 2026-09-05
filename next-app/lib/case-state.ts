/**
 * Case-state presentation vocabulary.
 *
 * The backend owns seventeen canonical states (specs/STATE_MACHINE.md v2.0.0). This maps
 * them onto a small visual vocabulary. It is presentation only - the UI never infers a
 * state, never transitions one, and never treats these groupings as authoritative.
 *
 * ESCALATED is styled "blocked" (red) on purpose. Escalation is the SAFE outcome, not a
 * failure - but it is the state that needs a human, so it should be the loudest thing in
 * the queue.
 */

export type StatusTone = "neutral" | "attention" | "active" | "settled" | "blocked"

const TONE: Record<string, StatusTone> = {
  RECEIVED: "neutral",
  NORMALIZED: "neutral",
  MATCHING: "neutral",
  RECONCILED: "settled",
  CLOSED: "neutral",

  EXCEPTION: "attention",
  REQUESTING_EVIDENCE: "attention",

  INVESTIGATING: "active",
  ACTION_PROPOSED: "active",
  APPROVAL_PENDING: "active",

  APPROVED: "settled",
  STAGED: "settled",
  APPLIED: "settled",
  OUTCOME_LOGGED: "settled",

  ESCALATED: "blocked",
  REJECTED: "blocked",

  REOPENED: "active",
}

export const toneFor = (state: string): StatusTone => TONE[state] ?? "neutral"

export const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-status-neutral-bg text-status-neutral",
  attention: "bg-status-attention-bg text-status-attention",
  active: "bg-status-active-bg text-status-active",
  settled: "bg-status-settled-bg text-status-settled",
  blocked: "bg-status-blocked-bg text-status-blocked",
}

export const humanizeState = (state: string): string =>
  state
    .toLowerCase()
    .split("_")
    .join(" ")
    .replace(/^./, (c) => c.toUpperCase())

/** Queue-management aid only. Never financial truth (specs/PRD.md section 19). */
export const PRIORITY_LABEL: Record<number, string> = {
  3: "High",
  2: "Medium",
  1: "Low",
  0: "None",
}
