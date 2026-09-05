"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { runReconciliationAction, type ActionResult } from "@/app/actions"

export function RunReconciliation() {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<ActionResult | null>(null)

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await runReconciliationAction()
            setResult(r)
            if (r.status === "ok") router.refresh()
          })
        }
      >
        {pending ? "Running…" : "Run reconciliation"}
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
        </p>
      ) : null}
    </div>
  )
}
