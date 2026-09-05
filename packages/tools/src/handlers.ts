/**
 * Tool implementations.
 *
 * Each one loads the reconciliation unit for the case under investigation and returns a
 * BOUNDED, SUMMARISED slice of it. They never return raw rows, never accept a merchant id
 * from the caller, and never write.
 *
 * The unit is the boundary: a tool cannot see anything the deterministic baseline could
 * not also see, which is what keeps the comparison between the two systems fair.
 */

import {
  FEE_SCHEDULES,
  expectedNetFromRecords,
  scheduleAt,
  scheduledFeeFor,
  type ReconciliationUnit,
} from '@settlementops/domain';

import {
  toolError,
  type ToolArguments,
  type ToolContext,
  type ToolName,
  type ToolResult,
} from './contracts.js';

export type UnitLoader = (ctx: ToolContext) => Promise<ReconciliationUnit | null>;

const MAX_RECORDS = 50;

const cap = <T>(items: readonly T[]): T[] => [...items].slice(0, MAX_RECORDS);

const ok = (
  name: ToolName,
  data: Record<string, unknown>,
  summary: string,
  recordIds: readonly string[],
): ToolResult => ({ ok: true, name, data, summary, recordIds });

export const makeHandlers = (loadUnit: UnitLoader) => {
  const withUnit = async (
    ctx: ToolContext,
    name: ToolName,
    fn: (unit: ReconciliationUnit) => ToolResult,
  ): Promise<ToolResult> => {
    const unit = await loadUnit(ctx);
    if (unit === null) return toolError(name, 'no such payment in this merchant scope');
    return fn(unit);
  };

  return {
    get_settlement_breakup: async (ctx: ToolContext): Promise<ToolResult> =>
      withUnit(ctx, 'get_settlement_breakup', (unit) => {
        const settlements = cap(unit.settlements).map((s) => ({
          settlement_id: s.settlementId,
          utr: s.utr,
          gross_minor: s.grossAmount.amountMinor.toString(),
          net_minor: s.netAmount.amountMinor.toString(),
          settlement_at: s.settlementAt.toISOString(),
          status: s.status,
        }));
        const lines = cap(unit.settlementLines).map((l) => ({
          settlement_id: l.settlementId,
          line_type: l.lineType,
          amount_minor: l.amount.amountMinor.toString(),
        }));
        const settledTotal = unit.settlementLines
          .filter((l) => l.paymentId === unit.payment.paymentId)
          .reduce((total, l) => total + l.amount.amountMinor, 0n);
        return ok(
          'get_settlement_breakup',
          {
            payment_gross_minor: unit.payment.amount.amountMinor.toString(),
            captured_at: unit.payment.capturedAt?.toISOString() ?? null,
            payment_method: unit.payment.paymentMethod,
            settlements,
            settlement_lines: lines,
            settled_total_minor: settledTotal.toString(),
          },
          `${settlements.length} settlement(s), ${lines.length} line(s), settled total ${settledTotal}`,
          [unit.payment.id, ...unit.settlements.map((s) => s.id)],
        );
      }),

    get_fee_tax_lines: async (ctx: ToolContext): Promise<ToolResult> =>
      withUnit(ctx, 'get_fee_tax_lines', (unit) => {
        const fees = cap(unit.fees).map((f) => ({
          fee_type: f.feeType,
          amount_minor: f.amount.amountMinor.toString(),
          effective_date: f.effectiveDate.toISOString(),
        }));
        const taxes = cap(unit.taxes).map((t) => ({
          tax_type: t.taxType,
          amount_minor: t.amount.amountMinor.toString(),
          period: t.period,
        }));
        const feeTotal = unit.fees.reduce((total, f) => total + f.amount.amountMinor, 0n);
        const taxTotal = unit.taxes.reduce((total, t) => total + t.amount.amountMinor, 0n);
        return ok(
          'get_fee_tax_lines',
          {
            fee_lines: fees,
            tax_lines: taxes,
            fee_total_minor: feeTotal.toString(),
            tax_total_minor: taxTotal.toString(),
          },
          fees.length === 0
            ? 'no fee record accompanies this payment'
            : `${fees.length} fee line(s) totalling ${feeTotal}, ${taxes.length} tax line(s) totalling ${taxTotal}`,
          [...unit.fees.map((f) => f.id), ...unit.taxes.map((t) => t.id)],
        );
      }),

    get_bank_credit: async (ctx: ToolContext, args: ToolArguments): Promise<ToolResult> =>
      withUnit(ctx, 'get_bank_credit', (unit) => {
        const credits = cap(
          args.utr === undefined
            ? unit.bankCredits
            : unit.bankCredits.filter((b) => b.utr === args.utr),
        ).map((b) => ({
          utr: b.utr,
          amount_minor: b.amount.amountMinor.toString(),
          credited_at: b.creditedAt.toISOString(),
        }));
        const total = credits.reduce((sum, c) => sum + BigInt(c.amount_minor), 0n);
        return ok(
          'get_bank_credit',
          { bank_credits: credits, credited_total_minor: total.toString() },
          credits.length === 0
            ? 'no bank credit found for this settlement'
            : `${credits.length} credit(s) totalling ${total}`,
          unit.bankCredits.map((b) => b.id),
        );
      }),

    get_refunds: async (ctx: ToolContext): Promise<ToolResult> =>
      withUnit(ctx, 'get_refunds', (unit) => {
        const refunds = cap(unit.refunds).map((r) => ({
          amount_minor: r.amount.amountMinor.toString(),
          status: r.status,
          created_at: r.createdAt.toISOString(),
          settled_at: r.settledAt?.toISOString() ?? null,
        }));
        return ok(
          'get_refunds',
          { refunds },
          refunds.length === 0 ? 'no refunds against this payment' : `${refunds.length} refund(s)`,
          unit.refunds.map((r) => r.id),
        );
      }),

    search_related_adjustments: async (ctx: ToolContext): Promise<ToolResult> =>
      withUnit(ctx, 'search_related_adjustments', (unit) => {
        const adjustments = cap(unit.adjustments).map((a) => ({
          reference: a.reference,
          reason_code: a.reasonCode,
          amount_minor: a.amount.amountMinor.toString(),
          effective_at: a.effectiveAt.toISOString(),
          allocated_to_settlement: a.settlementId !== null,
        }));
        return ok(
          'search_related_adjustments',
          { adjustments },
          adjustments.length === 0
            ? 'no adjustments relate to this settlement'
            : `${adjustments.length} adjustment(s); note whether each is allocated`,
          unit.adjustments.map((a) => a.id),
        );
      }),

    get_ledger_entries: async (ctx: ToolContext): Promise<ToolResult> =>
      withUnit(ctx, 'get_ledger_entries', (unit) =>
        // Ledger entries are not part of the reconciliation unit: the matcher does not
        // consume them, so neither can an investigation claim them as proof.
        ok(
          'get_ledger_entries',
          { ledger_entries: [], note: 'ledger entries are not evidence for reconciliation' },
          'no ledger evidence is admissible for reconciliation',
          [unit.payment.id],
        ),
      ),

    get_fee_schedule: async (_ctx: ToolContext, args: ToolArguments): Promise<ToolResult> => {
      const at = args.effective_date === undefined ? new Date() : new Date(args.effective_date);
      const schedule = scheduleAt(at);
      if (schedule === null) {
        return toolError('get_fee_schedule', 'no fee schedule is in force at that date');
      }
      return ok(
        'get_fee_schedule',
        {
          schedule_id: schedule.id,
          effective_from: schedule.effectiveFrom.toISOString(),
          fee_rate_bps: schedule.feeRateBps,
          tax_on_fee_bps: schedule.taxOnFeeBps,
          all_versions: FEE_SCHEDULES.map((s) => ({
            id: s.id,
            effective_from: s.effectiveFrom.toISOString(),
          })),
        },
        `schedule ${schedule.id} applies at ${at.toISOString()}`,
        [],
      );
    },

    /**
     * Arithmetic is done HERE, deterministically, not by the model.
     *
     * The model decides what to look at; it does not compute money. A language model
     * doing bigint arithmetic in prose is a defect waiting to be reported as a feature.
     */
    calculate_expected_net_amount: async (ctx: ToolContext): Promise<ToolResult> =>
      withUnit(ctx, 'calculate_expected_net_amount', (unit) => {
        const observed = expectedNetFromRecords({
          gross: unit.payment.amount,
          fees: unit.fees.map((f) => f.amount),
          taxes: unit.taxes.map((t) => t.amount),
          refunds: unit.refunds.map((r) => r.amount),
          adjustments: unit.adjustments.map((a) => a.amount),
        });
        const settled = unit.settlementLines
          .filter((l) => l.paymentId === unit.payment.paymentId)
          .reduce((total, l) => total + l.amount.amountMinor, 0n);

        const at = unit.payment.capturedAt ?? unit.payment.authorizedAt;
        const scheduled =
          at === null ? null : scheduledFeeFor(unit.payment.amount, unit.payment.paymentMethod, at);

        if (!observed.ok) {
          return toolError('calculate_expected_net_amount', 'expected net could not be computed');
        }
        const variance = observed.value.expectedNetMinor - settled;
        const scheduledVariance =
          scheduled === null
            ? null
            : (
                unit.payment.amount.amountMinor -
                scheduled.fee.amountMinor -
                scheduled.tax.amountMinor -
                settled
              ).toString();

        return ok(
          'calculate_expected_net_amount',
          {
            expected_net_from_observed_records_minor: observed.value.expectedNetMinor.toString(),
            settled_total_minor: settled.toString(),
            variance_minor: variance.toString(),
            scheduled_fee_minor: scheduled?.fee.amountMinor.toString() ?? null,
            scheduled_tax_minor: scheduled?.tax.amountMinor.toString() ?? null,
            schedule_id: scheduled?.scheduleId ?? null,
            variance_if_scheduled_fee_applied_minor: scheduledVariance,
          },
          `variance ${variance} minor units against observed records`,
          [unit.payment.id],
        );
      }),

    validate_tax_line_mapping: async (ctx: ToolContext): Promise<ToolResult> =>
      withUnit(ctx, 'validate_tax_line_mapping', (unit) => {
        const feeTotal = unit.fees.reduce((total, f) => total + f.amount.amountMinor, 0n);
        const taxTotal = unit.taxes.reduce((total, t) => total + t.amount.amountMinor, 0n);
        const schedule = scheduleAt(unit.payment.capturedAt ?? new Date());
        const expectedTax =
          schedule === null ? null : (feeTotal * BigInt(schedule.taxOnFeeBps)) / 10_000n;
        const consistent = expectedTax === null ? null : taxTotal === expectedTax;
        return ok(
          'validate_tax_line_mapping',
          {
            fee_total_minor: feeTotal.toString(),
            tax_total_minor: taxTotal.toString(),
            expected_tax_on_fee_minor: expectedTax?.toString() ?? null,
            consistent,
          },
          consistent === null
            ? 'no schedule in force; tax mapping not checkable'
            : consistent
              ? 'tax lines are consistent with the fee lines'
              : 'tax lines do NOT match the fee lines under the applicable schedule',
          [...unit.fees.map((f) => f.id), ...unit.taxes.map((t) => t.id)],
        );
      }),
  };
};
