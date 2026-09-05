"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { createScenarioAction, type ActionResult } from "@/app/actions"

/**
 * Creates REAL backend state.
 *
 * The request reaches the scenario endpoint, which generates records and runs them through
 * the same import and reconciliation pipeline the batch path uses. Nothing here is
 * simulated, and the outcome reported is whatever the pipeline actually produced - a
 * scenario that creates no exception says so, because the matcher decides, not the UI.
 */
export function CreateScenario({
  scenarioId,
  expectsException,
}: {
  scenarioId: string
  expectsException: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<ActionResult | null>(null)

  const create = () => {
    startTransition(async () => {
      const r = await createScenarioAction(scenarioId)
      setResult(r)
      if (r.status === "ok") router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <Button size="sm" onClick={create} disabled={pending}>
        {pending ? "Creating…" : "Create scenario"}
      </Button>
      {result ? (
        <p
          role="status"
          className={cn(
            "text-xs",
            result.status === "ok" ? "text-status-settled" : "text-status-blocked",
          )}
        >
          {result.message}
          {result.status === "ok" && !expectsException
            ? " This scenario is designed to reconcile cleanly."
            : ""}
        </p>
      ) : null}
    </div>
  )
}
