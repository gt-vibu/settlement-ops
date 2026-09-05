import Link from "next/link"
import { notFound } from "next/navigation"

import { AppShell } from "@/components/app-shell"
import { StatusBadge } from "@/components/status-badge"
import { CaseActions } from "@/features/exceptions/case-actions"
import { AuditTimeline } from "@/features/exceptions/audit-timeline"
import { Money } from "@/features/shared/money"
import { Identifier } from "@/features/shared/identifier"
import { Timestamp } from "@/features/shared/timestamp"
import { ErrorState } from "@/features/shared/states"
import { Field, PageBody, Panel } from "@/features/shared/page"
import { humanizeReason } from "@/lib/format"
import { PRIORITY_LABEL } from "@/lib/case-state"
import { getException, getWhoAmI, listCaseAudit, listInvestigations } from "@/lib/api"

export const dynamic = "force-dynamic"

export default async function ExceptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [identity, found, runs, audit] = await Promise.all([
    getWhoAmI(),
    getException(id),
    listInvestigations(id),
    listCaseAudit(id),
  ])

  // A case in another tenant returns 404, not 403 - the API is deliberately not an
  // existence oracle, and the UI must not soften that into "forbidden".
  if (!found.ok && found.status === 404) notFound()

  const who = identity.ok ? identity.data : null

  if (!found.ok) {
    return (
      <AppShell identity={who} activePath="/exceptions">
        <PageBody>
          <ErrorState title="Unable to load this exception" message={found.message} />
        </PageBody>
      </AppShell>
    )
  }

  const item = found.data
  const investigations = runs.ok ? runs.data.items : []
  const events = audit.ok ? audit.data.items : []
  // The backend increments case_version on every transition; the audit trail is the
  // authoritative record of where it now stands.
  const caseVersion =
    events.reduce<number | null>(
      (max, e) =>
        e.case_version !== null && (max === null || e.case_version > max)
          ? e.case_version
          : max,
      null,
    ) ?? 1

  return (
    <AppShell identity={who} activePath="/exceptions">
      <PageBody>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            href="/exceptions"
            className="text-muted-foreground hover:text-foreground text-[11px] transition-colors"
          >
            &larr; Queue
          </Link>
          <h1 className="ident text-[15px] font-semibold">{item.case_number}</h1>
          <StatusBadge state={item.state} />
          <span className="text-muted-foreground text-[11px]">version {caseVersion}</span>
        </div>

        {/* Financial facts dominate the hierarchy. */}
        <div className="rounded-data bg-card grid grid-cols-2 divide-x divide-y border sm:grid-cols-4 sm:divide-y-0">
          <Field label="Discrepancy">
            <span className="text-lg font-semibold">
              <Money minor={item.discrepancy_amount_minor} currency={item.currency} />
            </span>
            <div className="text-muted-foreground mt-0.5 text-[11px]">
              Expected net minus settled
            </div>
          </Field>
          <Field label="Priority">
            <span className="text-lg font-semibold">
              {PRIORITY_LABEL[item.priority] ?? "None"}
            </span>
            <div className="text-muted-foreground mt-0.5 text-[11px]">Queue aid only</div>
          </Field>
          <Field label="Opened">
            <Timestamp iso={item.opened_at} className="text-[13px]" />
            <div className="text-muted-foreground mt-0.5 text-[11px]">
              <Timestamp iso={item.opened_at} relative /> ago
            </div>
          </Field>
          <Field label="Case ID">
            <Identifier value={item.id} />
          </Field>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4">
            <Panel title="Why deterministic reconciliation stopped">
              <div className="p-3">
                {item.reasons.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No reason recorded.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {item.reasons.map((reason) => (
                      <li key={reason} className="flex items-start gap-2 text-[13px]">
                        <span className="bg-status-attention mt-1.5 size-1.5 shrink-0 rounded-full" />
                        <span>
                          {humanizeReason(reason)}
                          <span className="text-muted-foreground ident ml-2">{reason}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-muted-foreground border-border mt-3 border-t pt-2.5 text-[11px]">
                  Deterministic reason codes describe where the baseline stopped. They are
                  not a diagnosed cause &mdash; establishing cause is the investigation step.
                </p>
              </div>
            </Panel>

            <Panel title="Action">
              <div className="p-3">
                <CaseActions caseId={item.id} caseVersion={caseVersion} state={item.state} />
              </div>
            </Panel>

            {investigations.length > 0 ? (
              <Panel title="Investigations" meta={`${investigations.length} run`}>
                <ul className="divide-border divide-y">
                  {investigations.map((run) => (
                    <li
                      key={run.id}
                      className="flex items-center gap-2.5 px-3 py-1.5 text-[13px]"
                    >
                      <span className="font-medium">{run.status}</span>
                      {run.failure_code ? (
                        <span className="bg-status-blocked-bg text-status-blocked rounded-data px-1.5 py-0.5 text-[11px]">
                          {run.failure_code}
                        </span>
                      ) : null}
                      <span className="text-muted-foreground text-[11px]">
                        policy {run.policy_version}
                      </span>
                      <Timestamp
                        iso={run.started_at}
                        relative
                        className="text-muted-foreground ml-auto text-[11px]"
                      />
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </div>

          <Panel title="Audit trail" meta="Append-only">
            <div className="p-3">
              <AuditTimeline events={events} />
            </div>
          </Panel>
        </div>
      </PageBody>
    </AppShell>
  )
}
