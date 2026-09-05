import { AppShell } from "@/components/app-shell"
import { RunReconciliation } from "@/features/reconciliation/run-button"
import { ErrorState } from "@/features/shared/states"
import { Metric, MetricStrip, PageBody, PageHeader, Panel } from "@/features/shared/page"
import { getOperationsSummary, getWhoAmI } from "@/lib/api"

export const dynamic = "force-dynamic"

const TONE: Record<string, string> = {
  EXCEPTION: "bg-status-attention",
  INVESTIGATING: "bg-status-active",
  REQUESTING_EVIDENCE: "bg-status-active",
  ESCALATED: "bg-status-blocked",
  REJECTED: "bg-status-blocked",
}

/** Proportion bar. No chart library for one visualisation. */
function StateRow({
  state,
  count,
  total,
}: {
  state: string
  count: number
  total: number
}) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100)
  return (
    <div className="px-3 py-2">
      <div className="flex items-baseline gap-3">
        <span className="ident text-[12px]">{state}</span>
        <span className="tabular ml-auto text-[13px] font-semibold">{count}</span>
        <span className="tabular text-muted-foreground w-9 text-right text-[11px]">
          {pct}%
        </span>
      </div>
      <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full ${TONE[state] ?? "bg-muted-foreground/40"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default async function ReconciliationPage() {
  const [identity, summary] = await Promise.all([getWhoAmI(), getOperationsSummary()])
  const who = identity.ok ? identity.data : null

  if (!summary.ok) {
    return (
      <AppShell identity={who} activePath="/reconciliation">
        <PageBody>
          <ErrorState
            title="The SettlementOps API is not reachable"
            message={summary.message}
            hint="pnpm db:up && pnpm db:migrate, then start the API on port 3000."
          />
        </PageBody>
      </AppShell>
    )
  }

  const byState = summary.data.cases_by_state
  const entries = Object.entries(byState).sort((a, b) => b[1] - a[1])
  const totalCases = entries.reduce((t, [, n]) => t + n, 0)
  const open = summary.data.open_case_count

  return (
    <AppShell identity={who} activePath="/reconciliation" pending={{ "/exceptions": open }}>
      <PageBody>
        <PageHeader
          title="Reconciliation"
          context="Run the deterministic pass over unreconciled financial records. Anything it cannot close safely becomes a case."
          action={<RunReconciliation />}
        />

        {/* Every figure here is a CASE count. A record that matches cleanly never becomes a
            case, so an automation rate cannot be derived from this endpoint - and inventing
            one from case counts would misreport the baseline. The per-run evaluated /
            reconciled / residual figures come back from the run itself. */}
        <MetricStrip>
          <Metric label="Cases opened" value={totalCases} hint="All states, this merchant" />
          <Metric
            label="Awaiting triage"
            value={byState.EXCEPTION ?? 0}
            tone="attention"
            hint="No one has picked these up"
          />
          <Metric
            label="Investigating"
            value={byState.INVESTIGATING ?? 0}
            tone="active"
            hint="In progress"
          />
          <Metric
            label="Escalated"
            value={byState.ESCALATED ?? 0}
            tone="blocked"
            hint="Handed to a human owner"
          />
        </MetricStrip>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Panel title="Where the residual sits" meta={`${totalCases} cases`}>
            {entries.length === 0 ? (
              <p className="text-muted-foreground px-3 py-6 text-center text-xs">
                No cases yet. Create a scenario, then run reconciliation.
              </p>
            ) : (
              <div className="divide-border divide-y">
                {entries.map(([state, count]) => (
                  <StateRow key={state} state={state} count={count} total={totalCases} />
                ))}
              </div>
            )}
          </Panel>

          <Panel title="What a run does" meta="Deterministic only">
            <div className="space-y-2 p-3 text-[12px] leading-relaxed">
              <p>
                A run reads unreconciled records, matches each against the expected
                settlement within tolerance, and reports how many it evaluated, reconciled
                and left residual.
              </p>
              <p className="text-muted-foreground">
                Cleanly matched records close without ever opening a case, so they do not
                appear in the counts above. The AI investigator is not involved in this pass.
              </p>
              <p className="text-muted-foreground">
                Approval and staging states are absent because that path is not yet built.
                They are not seeded &mdash; a hand-populated queue would be a screenshot,
                not a product.
              </p>
            </div>
          </Panel>
        </div>
      </PageBody>
    </AppShell>
  )
}
