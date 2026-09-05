import type { ReactNode } from "react"
import { AlertCircleIcon, InboxIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"

/** Every surface tells the operator what they can do next, including when it is empty. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-data border-border flex flex-col items-center border border-dashed px-6 py-14 text-center">
      <InboxIcon className="text-muted-foreground/60 mb-3 size-5" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function ErrorState({
  title,
  message,
  hint,
}: {
  title: string
  message: string
  hint?: string
}) {
  return (
    <Alert>
      <AlertCircleIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {hint ? <p className="text-muted-foreground mt-2 ident">{hint}</p> : null}
      </AlertDescription>
    </Alert>
  )
}

/** Skeletons preserve layout so the page does not jump when data arrives. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-data space-y-px overflow-hidden border">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full rounded-none" />
      ))}
    </div>
  )
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}
