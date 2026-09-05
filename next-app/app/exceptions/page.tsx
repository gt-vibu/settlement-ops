import Link from "next/link"

import { AppShell } from "@/components/app-shell"
import { StatusBadge } from "@/components/status-badge"
import { StateFilter } from "@/features/exceptions/state-filter"
import { Money } from "@/features/shared/money"
import { Timestamp } from "@/features/shared/timestamp"
import { EmptyState, ErrorState } from "@/features/shared/states"
import { PageBody, PageHeader, Panel } from "@/features/shared/page"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { humanizeReason } from "@/lib/format"
import { PRIORITY_LABEL } from "@/lib/case-state"
import { getOperationsSummary, getWhoAmI, listExceptions } from "@/lib/api"

export const dynamic = "force-dynamic"

export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>
}) {
  const { state } = await searchParams
  const [identity, summary, queue] = await Promise.all([
    getWhoAmI(),
    getOperationsSummary(),
    listExceptions(state ? { state, limit: 100 } : { limit: 100 }),
  ])

  const who = identity.ok ? identity.data : null
  const openCount = summary.ok ? summary.data.open_case_count : undefined

  if (!queue.ok) {
    return (
      <AppShell identity={who} activePath="/exceptions">
        <PageBody>
          <ErrorState
            title="The SettlementOps API is not reachable"
            message={queue.message}
            hint="pnpm db:up && pnpm db:migrate, then start the API on port 3000."
          />
        </PageBody>
      </AppShell>
    )
  }

  const items = queue.data.items
  const total = items.reduce((t, i) => t + BigInt(i.discrepancy_amount_minor), 0n)
  const currency = items[0]?.currency ?? "INR"

  return (
    <AppShell
      identity={who}
      activePath="/exceptions"
      pending={openCount === undefined ? {} : { "/exceptions": openCount }}
    >
      <PageBody>
        <PageHeader
          title="Exception queue"
          context="Residual cases the deterministic baseline could not safely close."
          action={<StateFilter current={state ?? ""} />}
        />

        {items.length === 0 ? (
          <Panel>
            <div className="p-3">
              <EmptyState
                title={state ? "No exceptions in this state" : "No open exceptions"}
                description={
                  state
                    ? "Try a different state filter."
                    : "Every reconciled record closed cleanly. Create a scenario to generate financial activity."
                }
                action={
                  <Link href="/scenarios" className={buttonVariants({ size: "sm" })}>
                    Create a scenario
                  </Link>
                }
              />
            </div>
          </Panel>
        ) : (
          <Panel
            title={state ? `${state.replace(/_/g, " ")} cases` : "All open cases"}
            meta={
              <>
                {items.length} case{items.length === 1 ? "" : "s"} &middot;{" "}
                <Money minor={total.toString()} currency={currency} muted /> affected
              </>
            }
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-7 text-[11px] tracking-wide uppercase">
                      Case
                    </TableHead>
                    <TableHead className="h-7 w-32 text-[11px] tracking-wide uppercase">
                      State
                    </TableHead>
                    <TableHead className="h-7 text-[11px] tracking-wide uppercase">
                      Why it stopped
                    </TableHead>
                    <TableHead className="h-7 w-28 text-right text-[11px] tracking-wide uppercase">
                      Discrepancy
                    </TableHead>
                    <TableHead className="h-7 w-16 text-[11px] tracking-wide uppercase">
                      Priority
                    </TableHead>
                    <TableHead className="h-7 w-12 text-right text-[11px] tracking-wide uppercase">
                      Age
                    </TableHead>
                    <TableHead className="h-7 w-16 text-right text-[11px] tracking-wide uppercase">
                      <span className="sr-only">Open</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id} className="group hover:bg-accent/40 h-8">
                      <TableCell className="py-0">
                        <Link
                          href={`/exceptions/${item.id}`}
                          className="ident hover:text-primary focus-visible:ring-ring rounded-data transition-colors focus-visible:ring-1 focus-visible:outline-none"
                        >
                          {item.case_number}
                        </Link>
                      </TableCell>
                      <TableCell className="py-0">
                        <StatusBadge state={item.state} />
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[20rem] truncate py-0 text-[11px]">
                        {item.reasons.map(humanizeReason).join(", ") || "—"}
                      </TableCell>
                      <TableCell className="py-0 text-right">
                        <Money
                          minor={item.discrepancy_amount_minor}
                          currency={item.currency}
                          className="text-[13px] font-medium"
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground py-0 text-[11px]">
                        {PRIORITY_LABEL[item.priority] ?? "—"}
                      </TableCell>
                      <TableCell className="py-0 text-right">
                        <Timestamp
                          iso={item.opened_at}
                          relative
                          className="text-muted-foreground text-[11px]"
                        />
                      </TableCell>
                      <TableCell className="py-0 text-right">
                        {/* State changes happen on the detail page, not here: the list
                            endpoint does not carry case_version, and optimistic
                            concurrency must not be driven by a guessed version. */}
                        <Link
                          href={`/exceptions/${item.id}`}
                          className="text-muted-foreground hover:text-foreground text-[11px] opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          Open &rarr;
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Panel>
        )}

        {items.length > 0 ? (
          <p className="text-muted-foreground text-[11px]">
            Priority orders the queue; it never affects financial truth. Approval and staging
            states are absent because that path is not yet built &mdash; they are not seeded.
          </p>
        ) : null}
      </PageBody>
    </AppShell>
  )
}
