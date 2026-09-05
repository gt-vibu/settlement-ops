import Link from "next/link"

import { AppShell } from "@/components/app-shell"
import { StatusBadge } from "@/components/status-badge"
import { Money } from "@/features/shared/money"
import { Timestamp } from "@/features/shared/timestamp"
import { EmptyState, ErrorState } from "@/features/shared/states"
import { Metric, MetricStrip, PageBody, PageHeader, Panel } from "@/features/shared/page"
import { buttonVariants } from "@/components/ui/button"
import { humanizeReason } from "@/lib/format"
import { PRIORITY_LABEL } from "@/lib/case-state"
import {
  getOperationsSummary,
  getWhoAmI,
  listExceptions,
  listRecentAudit,
} from "@/lib/api"

export const dynamic = "force-dynamic"

export default async function OverviewPage() {
  const [identity, summary, queue, activity] = await Promise.all([
    getWhoAmI(),
    getOperationsSummary(),
    listExceptions({ limit: 12 }),
    listRecentAudit(14),
  ])

  const who = identity.ok ? identity.data : null

  if (!summary.ok) {
    return (
      <AppShell identity={who} activePath="/">
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
  const items = queue.ok ? queue.data.items : []
  const events = activity.ok ? activity.data.items : []
  const affected = items.reduce((t, i) => t + BigInt(i.discrepancy_amount_minor), 0n)
  const currency = items[0]?.currency ?? "INR"

  return (
    <AppShell
      identity={who}
      activePath="/"
      pending={{ "/exceptions": summary.data.open_case_count }}
    >
      <PageBody>
        <PageHeader
          title="What needs your attention"
          context="Deterministic reconciliation has already closed the straightforward records. These are the residuals."
          action={
            <Link href="/exceptions" className={buttonVariants({ size: "sm" })}>
              Work the queue
            </Link>
          }
        />

        <MetricStrip>
          {/* open_case_count counts every case not yet closed, which includes the ones
              already being worked - it is not a triage backlog. */}
          <Metric
            label="Open cases"
            value={summary.data.open_case_count}
            tone="attention"
            hint="Not yet closed"
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
            hint="Needs a human decision"
          />
          <Metric
            label="Amount affected"
            value={<Money minor={affected.toString()} currency={currency} />}
            hint="Across the newest cases"
          />
        </MetricStrip>

        {/* Two columns: the queue is the content, activity is the rail. Stacking these
            vertically was what left the page feeling empty. */}
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Panel
            title="Priority queue"
            meta={`${items.length} shown`}
            action={
              <Link
                href="/exceptions"
                className="text-muted-foreground hover:text-foreground text-[11px] transition-colors"
              >
                All exceptions &rarr;
              </Link>
            }
          >
            {items.length === 0 ? (
              <div className="p-3">
                <EmptyState
                  title="No open exceptions"
                  description="Every reconciled record closed cleanly. Create a scenario to generate financial activity."
                  action={
                    <Link href="/scenarios" className={buttonVariants({ size: "sm" })}>
                      Create a scenario
                    </Link>
                  }
                />
              </div>
            ) : (
              <ul className="divide-border divide-y">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/exceptions/${item.id}`}
                      className="hover:bg-accent/40 focus-visible:ring-ring flex items-center gap-3 px-3 py-1.5 transition-colors duration-150 focus-visible:ring-1 focus-visible:outline-none focus-visible:-outline-offset-1"
                    >
                      <span className="ident w-36 shrink-0">{item.case_number}</span>
                      <span className="w-28 shrink-0">
                        <StatusBadge state={item.state} />
                      </span>
                      <span className="text-muted-foreground hidden min-w-0 flex-1 truncate text-[11px] md:block">
                        {item.reasons.map(humanizeReason).join(", ") || "\\u2014"}
                      </span>
                      <span className="text-muted-foreground w-14 shrink-0 text-right text-[11px]">
                        {PRIORITY_LABEL[item.priority] ?? "\\u2014"}
                      </span>
                      <Money
                        minor={item.discrepancy_amount_minor}
                        currency={item.currency}
                        className="w-24 shrink-0 text-right text-[13px] font-medium"
                      />
                      <Timestamp
                        iso={item.opened_at}
                        relative
                        className="text-muted-foreground w-9 shrink-0 text-right text-[11px]"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Activity" meta="Immutable">
            {events.length === 0 ? (
              <p className="text-muted-foreground px-3 py-6 text-center text-xs">
                State transitions appear here as work moves through the system.
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {events.map((e) => (
                  <li key={e.id} className="px-3 py-1.5">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-[12px]">
                        {e.event_type.replace(/_/g, " ")}
                      </span>
                      <Timestamp
                        iso={e.occurred_at}
                        relative
                        className="text-muted-foreground ml-auto shrink-0 text-[11px]"
                      />
                    </div>
                    {e.previous_state && e.next_state ? (
                      <div className="text-muted-foreground mt-0.5 text-[11px]">
                        {e.previous_state} &rarr;{" "}
                        <span className="text-foreground">{e.next_state}</span>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </PageBody>
    </AppShell>
  )
}
