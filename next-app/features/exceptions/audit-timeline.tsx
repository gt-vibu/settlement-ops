import { Timestamp } from "@/features/shared/timestamp"
import type { AuditEvent } from "@/lib/api"

/**
 * Forensic history for one case.
 *
 * Read-only by construction: audit events are append-only at the database (the
 * application role has UPDATE and DELETE revoked), so this surface offers no edit
 * affordance because no such operation exists.
 */
export function AuditTimeline({ events }: { events: readonly AuditEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No audit events recorded for this case yet.
      </p>
    )
  }

  return (
    <ol className="space-y-0">
      {events.map((e, index) => (
        <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
          <div className="flex flex-col items-center">
            <span className="bg-border mt-1.5 size-1.5 shrink-0 rounded-full" />
            {index < events.length - 1 ? (
              <span className="bg-border mt-1 w-px flex-1" aria-hidden="true" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium">
                {e.event_type.replace(/_/g, " ")}
              </span>
              {e.previous_state && e.next_state ? (
                <span className="text-muted-foreground text-xs">
                  {e.previous_state} &rarr;{" "}
                  <span className="text-foreground font-medium">{e.next_state}</span>
                </span>
              ) : null}
              <Timestamp
                iso={e.occurred_at}
                className="text-muted-foreground ml-auto text-xs"
              />
            </div>
            <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 text-xs">
              <span>
                actor <span className="text-foreground">{e.actor_type}</span>
              </span>
              {e.case_version !== null ? <span>version {e.case_version}</span> : null}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
