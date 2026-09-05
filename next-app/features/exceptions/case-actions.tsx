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
  approveCaseAction,
  escalateCaseAction,
  reinvestigateCaseAction,
  stageCaseAction,
  startInvestigationAction,
  type ActionResult,
} from "@/app/actions"

function allowedFor(state: string, roles: string[]) {
  const isApprover = roles.includes("APPROVER") || roles.includes("ADMIN")
  const isOperator =
    roles.includes("OPERATOR") || roles.includes("APPROVER") || roles.includes("ADMIN")

  switch (state) {
    case "EXCEPTION":
      return {
        investigate: isOperator,
        escalate: isOperator,
        reinvestigate: false,
        approve: false,
        stage: false,
      }
    case "INVESTIGATING":
      return {
        investigate: false,
        escalate: isOperator,
        reinvestigate: false,
        approve: false,
        stage: false,
      }
    case "REQUESTING_EVIDENCE":
    case "REJECTED":
      return {
        investigate: false,
        escalate: isOperator,
        reinvestigate: isOperator,
        approve: false,
        stage: false,
      }
    case "ACTION_PROPOSED":
      return {
        investigate: false,
        escalate: isOperator,
        reinvestigate: false,
        approve: isApprover,
        stage: false,
      }
    case "APPROVED":
      return {
        investigate: false,
        escalate: false,
        reinvestigate: false,
        approve: false,
        stage: isOperator,
      }
    default:
      return {
        investigate: false,
        escalate: false,
        reinvestigate: false,
        approve: false,
        stage: false,
      }
  }
}

export function CaseActions({
  caseId,
  caseVersion,
  state,
  roles = [],
  amountMinor = "0",
  latestProposal,
  compact,
}: {
  caseId: string
  caseVersion: number
  state: string
  roles?: string[]
  amountMinor?: string
  latestProposal?: {
    cause?: string
    disposition?: string
    rationale?: string
    evidence_record_ids?: string[]
    tool_calls?: number
  }
  compact?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<ActionResult | null>(null)
  const [reason, setReason] = React.useState("")
  const [approvalNote, setApprovalNote] = React.useState("Approved verified resolution")
  const allowed = allowedFor(state, roles)

  const run = (fn: () => Promise<ActionResult>) => {
    startTransition(async () => {
      const r = await fn()
      setResult(r)
      if (r.status === "ok" || r.status === "conflict") router.refresh()
    })
  }

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

  if (state === "STAGED") {
    return compact ? null : (
      <div className="space-y-2">
        {message}
        <div className="rounded-data bg-status-settled-bg/40 border-status-settled/30 border p-3 text-xs">
          <p className="font-semibold text-foreground">Action Intent Staged</p>
          <p className="text-muted-foreground mt-0.5">
            Staged as an intent (STAGE_LEDGER_ADJUSTMENT) for a human to apply; no ledger was
            written.
          </p>
        </div>
      </div>
    )
  }

  if (state === "APPROVED") {
    return (
      <div className={cn(compact ? "flex items-center gap-1.5" : "space-y-3")}>
        {!compact ? (
          <div className="rounded-data bg-status-settled-bg/30 border-status-settled/30 border p-3 text-xs">
            <p className="font-semibold text-foreground">Proposal Approved</p>
            <p className="text-muted-foreground mt-0.5">
              Verified resolution approved by human approver. Ready to stage financial adjustment.
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {allowed.stage ? (
            <Button
              size={compact ? "sm" : "default"}
              disabled={pending}
              onClick={() => run(() => stageCaseAction(caseId, caseVersion, amountMinor))}
            >
              {pending ? "Staging action…" : "Stage Ledger Adjustment"}
            </Button>
          ) : (
            <Button size={compact ? "sm" : "default"} disabled>
              Stage (Requires OPERATOR role)
            </Button>
          )}
        </div>
        {message}
      </div>
    )
  }

  if (state === "ACTION_PROPOSED") {
    return (
      <div className={cn(compact ? "flex items-center gap-1.5" : "space-y-3")}>
        {!compact && latestProposal ? (
          <div className="rounded-data bg-muted/40 border-border/80 space-y-1.5 border p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">
                Verified Proposal: {latestProposal.cause ?? "MDR_FEE"} (
                {latestProposal.disposition ?? "RESOLVE"})
              </span>
              <span className="text-muted-foreground text-[11px]">
                {latestProposal.tool_calls ?? 2} tool calls verified
              </span>
            </div>
            {latestProposal.rationale ? (
              <p className="text-muted-foreground">{latestProposal.rationale}</p>
            ) : null}
            {latestProposal.evidence_record_ids?.length ? (
              <p className="ident text-muted-foreground text-[11px]">
                Evidence records: {latestProposal.evidence_record_ids.join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {allowed.approve ? (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button size={compact ? "sm" : "default"} disabled={pending}>
                    Approve proposal
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Approve verified proposal</AlertDialogTitle>
                  <AlertDialogDescription>
                    Review the verified proposal cause and disposition. As an authorized APPROVER,
                    recording your approval will advance this case to the staging phase.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-2">
                  <Label htmlFor={`note-${caseId}`}>Approval Note</Label>
                  <Textarea
                    id={`note-${caseId}`}
                    value={approvalNote}
                    onChange={(e) => setApprovalNote(e.target.value)}
                    placeholder="e.g. Verified MDR fee deduction against provider schedule."
                    rows={2}
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={pending}
                    onClick={() => run(() => approveCaseAction(caseId, caseVersion, approvalNote))}
                  >
                    Confirm Approval
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button
              size={compact ? "sm" : "default"}
              disabled
              title="Only an APPROVER role may approve financial proposals"
            >
              Approve (Switch to APPROVER)
            </Button>
          )}

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
                    Escalation hands the case to a human owner. It is a safe outcome, not a failure
                    — but it requires a concrete reason for the audit trail.
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
                  Escalation hands the case to a human owner. It is a safe outcome, not a failure —
                  but it requires a concrete reason for the audit trail.
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
