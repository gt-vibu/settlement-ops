"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import {
  escalateCaseAction,
  reinvestigateCaseAction,
  startInvestigationAction,
  type ActionResult,
} from "@/app/actions"

/**
 * Actions are gated on the case's CURRENT state.
 *
 * An action illegal from this state is never rendered - not rendered and then rejected
 * (FRONTEND_BACKEND_CONTRACT.md Part III rule 4). `request-evidence` appears nowhere in
 * Phase 1: it is legal only from ACTION_PROPOSED / APPROVAL_PENDING, which require a
 * verified proposal that does not exist yet.
 */
function allowedFor(state: string) {
  switch (state) {
    case "EXCEPTION":
      return { investigate: true, escalate: true, reinvestigate: false }
    case "INVESTIGATING":
      return { investigate: false, escalate: true, reinvestigate: false }
    case "REQUESTING_EVIDENCE":
    case "REJECTED":
      return { investigate: false, escalate: true, reinvestigate: true }
    default:
      return { investigate: false, escalate: false, reinvestigate: false }
  }
}

export function CaseActions({
  caseId,
  caseVersion,
  state,
  compact,
}: {
  caseId: string
  caseVersion: number
  state: string
  compact?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<ActionResult | null>(null)
  const [reason, setReason] = React.useState("")
  const allowed = allowedFor(state)

  const run = (fn: () => Promise<ActionResult>) => {
    startTransition(async () => {
      const r = await fn()
      setResult(r)
      // A conflict means the case moved elsewhere: reload the truth rather than retrying.
      if (r.status === "ok" || r.status === "conflict") router.refresh()
    })
  }

  // A conflict refreshes the page, which can move the case into a state with no legal
  // action. The explanation must survive that transition, or the queue appears to have
  // silently ignored the operator.
  const message =
    result && !compact ? (
      <p
        role="status"
        className={cn(
          "text-xs",
          result.status === "ok" ? "text-status-settled" : "text-status-blocked",
        )}
      >
        {result.message}
      </p>
    ) : null

  if (!allowed.investigate && !allowed.escalate && !allowed.reinvestigate) {
    return compact ? null : (
      <div className="space-y-2">
        {message}
        <p className="text-muted-foreground text-xs">
          No further action is available while this case is{" "}
          {state.toLowerCase().replace("_", " ")}.
        </p>
      </div>
    )
  }

  return (
    <div className={cn(compact ? "flex items-center gap-1.5" : "space-y-3")}>
      <div className="flex flex-wrap items-center gap-2">
        {allowed.investigate ? (
          <Button
            size={compact ? "sm" : "default"}
            disabled={pending}
            onClick={() => run(() => startInvestigationAction(caseId, caseVersion))}
          >
            {pending ? "Starting investigation…" : "Start investigation"}
          </Button>
        ) : null}

        {allowed.reinvestigate ? (
          <Button
            size={compact ? "sm" : "default"}
            variant="outline"
            disabled={pending}
            onClick={() => run(() => reinvestigateCaseAction(caseId, caseVersion))}
          >
            Re-investigate
          </Button>
        ) : null}

        {allowed.escalate ? (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button size={compact ? "sm" : "default"} variant="outline" disabled={pending}>
                  Escalate
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Escalate this exception</AlertDialogTitle>
                <AlertDialogDescription>
                  Escalation hands the case to a human owner. It is a safe outcome, not a
                  failure — but it requires a concrete reason for the audit trail.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2">
                <Label htmlFor={`reason-${caseId}`}>Reason</Label>
                <Textarea
                  id={`reason-${caseId}`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Fee statement unavailable; needs manual review with the provider."
                  rows={3}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={pending || reason.trim() === ""}
                  onClick={() => run(() => escalateCaseAction(caseId, caseVersion, reason))}
                >
                  Escalate
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>

      {message}
    </div>
  )
}
