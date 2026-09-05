/**
 * Scenario catalog (specs/DEMO_SCENARIOS.md).
 *
 * A scenario is a controlled way to produce a real payment lifecycle. It is NOT a
 * scripted outcome: the scenario decides what records exist, and the ordinary
 * deterministic reconciliation decides what happens to them. A scenario can therefore
 * "fail" to produce the exception it was designed for, and that would be a real finding
 * about the matcher rather than something to paper over.
 *
 * `expectedCause` is a demonstration checkpoint for the operator running a demo. It is
 * stored outside the visible case payload and never reaches a case or evidence endpoint
 * (specs/SCENARIO_ENGINE.md; specs/LEAKAGE_AUDIT.md section 7).
 */

export const SCENARIO_IDS = [
  'clean-settlement',
  'fee-tax-discrepancy',
  'split-settlement',
  'refund-netting',
  'ambiguous-adjustment',
  'misleading-adjustment',
] as const;

export type ScenarioId = (typeof SCENARIO_IDS)[number];

export const isScenarioId = (value: string): value is ScenarioId =>
  (SCENARIO_IDS as readonly string[]).includes(value);

export interface ScenarioDefinition {
  readonly id: ScenarioId;
  readonly name: string;
  readonly description: string;
  /** Payment gross in minor units. */
  readonly grossMinor: bigint;
  readonly paymentMethod: 'CARD' | 'NETBANKING' | 'UPI' | 'WALLET';
  /** What a demo operator should expect to see. Never sent to a case endpoint. */
  readonly expectedCause: string;
  /** Whether the scenario is designed to reconcile cleanly. */
  readonly expectsException: boolean;
  readonly demonstrationCheckpoint: string;
}

export const SCENARIOS: readonly ScenarioDefinition[] = [
  {
    id: 'clean-settlement',
    name: 'Clean settlement',
    description:
      'A normal card payment that settles exactly as the fee schedule predicts. Should reconcile deterministically and never reach the exception queue.',
    grossMinor: 1_000_000n,
    paymentMethod: 'CARD',
    expectedCause: 'NONE',
    expectsException: false,
    demonstrationCheckpoint: 'Reconciles automatically; the AI is never invoked.',
  },
  {
    id: 'fee-tax-discrepancy',
    name: 'Fee and tax discrepancy',
    description:
      'A 10,000.00 payment where the settlement is short by the fee and tax, and no fee record accompanies it. The variance is explainable, but not from the settlement alone.',
    grossMinor: 1_000_000n,
    paymentMethod: 'CARD',
    expectedCause: 'MDR_FEE',
    expectsException: true,
    demonstrationCheckpoint:
      'Becomes an exception with a 295.00 discrepancy and a missing fee record.',
  },
  {
    id: 'split-settlement',
    name: 'Split settlement',
    description:
      'One payment settled across two legs with different UTRs. The aggregate conserves value, but one leg is credited late, so the bank-side view disagrees.',
    grossMinor: 1_000_000n,
    paymentMethod: 'CARD',
    expectedCause: 'UTR_SPLIT',
    expectsException: true,
    demonstrationCheckpoint:
      'Amounts conserve across legs, but a bank credit falls outside the expected lag.',
  },
  {
    id: 'refund-netting',
    name: 'Refund netting across cycles',
    description:
      'A refund raised near a settlement boundary that nets into a later cycle than the settlement it affects.',
    grossMinor: 1_000_000n,
    paymentMethod: 'NETBANKING',
    expectedCause: 'REFUND_NETTING',
    expectsException: true,
    demonstrationCheckpoint:
      'Refund settles beyond the permitted netting window and the net no longer reconciles.',
  },
  {
    id: 'ambiguous-adjustment',
    name: 'Genuine ambiguity',
    description:
      'A discrepancy that two different records could each plausibly explain, with insufficient evidence to choose between them safely.',
    grossMinor: 1_000_000n,
    paymentMethod: 'CARD',
    expectedCause: 'AMBIGUOUS',
    expectsException: true,
    demonstrationCheckpoint:
      'No unique explanation is supported. The safe outcome is escalation, not a guess.',
  },
  {
    id: 'misleading-adjustment',
    name: 'Misleading but legitimate-looking adjustment',
    description:
      'An adjustment whose amount matches the discrepancy exactly but whose timing makes it an impossible explanation.',
    grossMinor: 1_000_000n,
    paymentMethod: 'CARD',
    expectedCause: 'AMBIGUOUS',
    expectsException: true,
    demonstrationCheckpoint:
      'A tempting explanation that deterministic checks reject on lifecycle grounds.',
  },
];

export const scenarioById = (id: string): ScenarioDefinition | null =>
  SCENARIOS.find((s) => s.id === id) ?? null;

/** Catalog projection safe to return over the API - carries no expected cause. */
export interface ScenarioCatalogEntry {
  readonly id: ScenarioId;
  readonly name: string;
  readonly description: string;
  readonly expects_exception: boolean;
}

export const catalog = (): readonly ScenarioCatalogEntry[] =>
  SCENARIOS.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    expects_exception: s.expectsException,
  }));
