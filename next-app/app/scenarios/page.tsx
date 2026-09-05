import { AppShell } from "@/components/app-shell"
import { CreateScenario } from "@/features/scenarios/create-scenario"
import { Timestamp } from "@/features/shared/timestamp"
import { EmptyState, ErrorState } from "@/features/shared/states"
import { Metric, MetricStrip, PageBody, PageHeader, Panel } from "@/features/shared/page"
import { getWhoAmI, listScenarioInstances, listScenarios } from "@/lib/api"

export const dynamic = "force-dynamic"

export default async function ScenariosPage() {
  const [identity, catalog, instances] = await Promise.all([
    getWhoAmI(),
    listScenarios(),
    listScenarioInstances(),
  ])

  const who = identity.ok ? identity.data : null
  const isAdmin = who?.roles.includes("ADMIN") ?? false
  const runs = instances.ok ? instances.data.items : []
  const records = runs.reduce((t, i) => t + i.records_created, 0)
  const cases = runs.reduce((t, i) => t + i.cases_created, 0)

  return (
    <AppShell identity={who} activePath="/scenarios">
      <PageBody>
        <PageHeader
          title="Scenario control"
          context="Each scenario injects a controlled financial event through the same import and reconciliation pipeline as batch data. Nothing here is simulated."
        />

        <MetricStrip>
          <Metric label="Runs executed" value={runs.length} hint="This tenant" />
          <Metric label="Records generated" value={records} hint="Payments and settlements" />
          <Metric
            label="Exceptions produced"
            value={cases}
            tone={cases > 0 ? "attention" : "default"}
            hint="Decided by the matcher"
          />
          <Metric
            label="Your role"
            value={who?.roles[0] ?? "—"}
            tone={isAdmin ? "settled" : "attention"}
            hint={isAdmin ? "May create scenarios" : "ADMIN required to create"}
          />
        </MetricStrip>

        {!catalog.ok ? (
          <ErrorState
            title={
              catalog.status === 404
                ? "Scenarios are not enabled in this environment"
                : "Unable to load scenarios"
            }
            message={
              catalog.status === 404
                ? "Demo scenario routes are registered only when DEMO_SCENARIOS_ENABLED is set."
                : catalog.message
            }
          />
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <Panel
              title="Scenario catalogue"
              meta={`${catalog.data.items.length} available`}
              action={
                !isAdmin ? (
                  <span className="text-status-attention text-[11px]">
                    Switch to Demo Admin to run
                  </span>
                ) : null
              }
            >
              <ul className="divide-border divide-y">
                {catalog.data.items.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-medium">{s.name}</span>
                        {/* The expectation is the backend's own declaration, not a claim
                            the UI makes about the outcome. */}
                        <span
                          className={
                            s.expects_exception
                              ? "bg-status-attention-bg text-status-attention rounded-data px-1.5 py-0.5 text-[10px] font-medium"
                              : "bg-status-settled-bg text-status-settled rounded-data px-1.5 py-0.5 text-[10px] font-medium"
                          }
                        >
                          {s.expects_exception ? "expects exception" : "reconciles cleanly"}
                        </span>
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">
                        {s.description}
                      </p>
                    </div>
                    {isAdmin ? (
                      <div className="w-40 shrink-0 text-right">
                        <CreateScenario
                          scenarioId={s.id}
                          expectsException={s.expects_exception}
                        />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Recent runs" meta="Read back from the backend">
              {runs.length === 0 ? (
                <div className="p-3">
                  <EmptyState
                    title="No scenarios created yet"
                    description="Run one from the catalogue to generate a payment lifecycle and watch it reconcile."
                  />
                </div>
              ) : (
                <ul className="divide-border divide-y">
                  {runs.map((i) => (
                    <li key={i.id} className="px-3 py-1.5">
                      <div className="flex items-baseline gap-2">
                        <span className="ident truncate text-[12px]">{i.scenario_id}</span>
                        <Timestamp
                          iso={i.created_at}
                          relative
                          className="text-muted-foreground ml-auto shrink-0 text-[11px]"
                        />
                      </div>
                      <div className="text-muted-foreground mt-0.5 flex items-center gap-2.5 text-[11px]">
                        <span>{i.status}</span>
                        <span className="tabular">{i.records_created} records</span>
                        <span className="tabular">
                          {i.cases_created} exception{i.cases_created === 1 ? "" : "s"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        )}
      </PageBody>
    </AppShell>
  )
}
