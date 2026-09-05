/**
 * Typed evidence tools.
 *
 * These are the ONLY way an investigation reaches data. There is deliberately no generic
 * query tool: a model with SQL is a model with unbounded reach, and every safety property
 * this system claims would rest on the model choosing not to use it.
 *
 * Every tool is:
 *   read-only          no tool writes anything, ever
 *   tenant-scoped      the scope comes from the server-built request context, never from
 *                      a model-supplied argument
 *   parameter-validated  arguments are checked before execution, not trusted
 *   bounded            results are capped, so one call cannot flood the context
 *   audited            the call and a summary of its result are recorded
 *
 * `TOOLS.md` v2.0.0. `validate_candidate_resolution` is deliberately absent: it would let
 * the model ask the verifier whether an answer would pass, turning a terminal gate into
 * an oracle it could optimise against.
 */

import type { MerchantScope } from '@settlementops/domain';

export const TOOL_NAMES = [
  'get_settlement_breakup',
  'get_fee_tax_lines',
  'get_ledger_entries',
  'get_bank_credit',
  'search_related_adjustments',
  'get_refunds',
  'get_fee_schedule',
  'calculate_expected_net_amount',
  'validate_tax_line_mapping',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const isToolName = (value: string): value is ToolName =>
  (TOOL_NAMES as readonly string[]).includes(value);

/** Arguments a model may supply. Note what is NOT here: no merchant id, no SQL, no path. */
export interface ToolArguments {
  readonly payment_id?: string;
  readonly settlement_id?: string;
  readonly utr?: string;
  readonly effective_date?: string;
  readonly amount_minor?: string;
  readonly window_days?: number;
}

export interface ToolCall {
  readonly name: ToolName;
  readonly arguments: ToolArguments;
}

export interface ToolResult {
  readonly ok: boolean;
  readonly name: ToolName;
  /** Bounded, serialisable evidence. Never a raw database row. */
  readonly data: Readonly<Record<string, unknown>>;
  /** One line an operator can read. Also what goes into the audit trail. */
  readonly summary: string;
  /** Source record ids this evidence came from, for provenance checking. */
  readonly recordIds: readonly string[];
  readonly error?: string;
}

export interface ToolContext {
  readonly scope: MerchantScope;
  /** The case under investigation. Tools may not reach outside it without a reason. */
  readonly paymentId: string;
}

export type ToolHandler = (ctx: ToolContext, args: ToolArguments) => Promise<ToolResult>;

/**
 * Argument validation.
 *
 * Runs before any handler. A model that supplies a merchant id, a SQL fragment or an
 * oversized window gets a validation error, not a query.
 */
export const validateArguments = (
  args: ToolArguments,
): { ok: true; args: ToolArguments } | { ok: false; error: string } => {
  const id = (value: string | undefined): boolean =>
    value === undefined || (/^[A-Za-z0-9_-]{1,64}$/.test(value) && value.length > 0);

  if (!id(args.payment_id)) return { ok: false, error: 'payment_id is not a valid identifier' };
  if (!id(args.settlement_id))
    return { ok: false, error: 'settlement_id is not a valid identifier' };
  if (!id(args.utr)) return { ok: false, error: 'utr is not a valid identifier' };

  if (args.effective_date !== undefined && Number.isNaN(Date.parse(args.effective_date))) {
    return { ok: false, error: 'effective_date is not an ISO-8601 date' };
  }
  if (args.amount_minor !== undefined && !/^-?\d{1,18}$/.test(args.amount_minor)) {
    return { ok: false, error: 'amount_minor must be an integer string in minor units' };
  }
  if (args.window_days !== undefined && (args.window_days < 1 || args.window_days > 30)) {
    return { ok: false, error: 'window_days must be between 1 and 30' };
  }
  return { ok: true, args };
};

/**
 * A tool failure.
 *
 * `name` is typed loosely on purpose: a rejection for an UNKNOWN tool must not have to
 * borrow a real tool's name to be constructed. A test caught exactly that - the rejection
 * message for `drop_tables` was reading "get_settlement_breakup failed", which both
 * misattributes the failure and hands an attacker a valid name.
 */
export const toolError = (name: ToolName | 'unknown', error: string): ToolResult => ({
  ok: false,
  name: name as ToolName,
  data: {},
  summary: name === 'unknown' ? `tool rejected: ${error}` : `${name} failed: ${error}`,
  recordIds: [],
  error,
});
