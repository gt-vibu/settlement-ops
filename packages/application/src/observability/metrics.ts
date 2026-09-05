/**
 * Operational counters.
 *
 * In-process, in-memory, and deliberately not a metrics vendor. `AGENTS.md` forbids
 * speculative infrastructure, and a modular monolith with one worker does not need a
 * scrape target to answer "is anything failing right now" - it needs the numbers to exist
 * and be readable.
 *
 * What they are FOR is the questions an operator actually asks at 2am: how many
 * investigations escalated, how often was the model unreachable, how many verifier
 * rejections, how many duplicate submissions were absorbed. Every one of those is a
 * counter, not a trace.
 *
 * NEVER record: secrets, hidden evaluation truth, amounts, merchant identifiers, or any
 * per-case value. A metric label with a merchant id in it is a data leak with a dashboard
 * in front of it.
 */

export const METRIC_NAMES = [
  'import.submitted',
  'import.replayed',
  'import.rejected',
  'reconciliation.run',
  'reconciliation.case_opened',
  'investigation.started',
  'investigation.escalated',
  'investigation.proposed',
  'investigation.tool_call',
  'verifier.passed',
  'verifier.rejected',
  'model.call',
  'model.unavailable',
  'model.timeout',
  'model.schema_violation',
  'approval.approved',
  'approval.rejected',
  'staging.staged',
  'conflict.stale_version',
  'job.claimed',
  'job.failed',
  'job.abandoned',
  'job.requeued',
] as const;

export type MetricName = (typeof METRIC_NAMES)[number];

export interface Metrics {
  increment(name: MetricName, by?: number): void;
  /** Records a duration in milliseconds. Kept as count + total so the mean is derivable. */
  observe(name: MetricName, durationMs: number): void;
  snapshot(): Readonly<Record<string, number>>;
  reset(): void;
}

export const createMetrics = (): Metrics => {
  const counters = new Map<string, number>();

  const add = (key: string, value: number): void => {
    counters.set(key, (counters.get(key) ?? 0) + value);
  };

  return {
    increment: (name, by = 1) => add(name, by),
    observe: (name, durationMs) => {
      add(`${name}.count`, 1);
      add(`${name}.total_ms`, Math.max(0, Math.round(durationMs)));
    },
    snapshot: () => Object.fromEntries(counters),
    reset: () => counters.clear(),
  };
};

/**
 * A no-op recorder.
 *
 * Used where metrics are optional so that a call site never has to branch on whether
 * observability is configured. A metric that is sometimes recorded and sometimes silently
 * skipped by an `if` is worse than one that is never recorded.
 */
export const noopMetrics = (): Metrics => ({
  increment: () => undefined,
  observe: () => undefined,
  snapshot: () => ({}),
  reset: () => undefined,
});
