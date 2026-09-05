import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * The page vocabulary.
 *
 * One set of layout primitives every screen composes from, so density, rhythm and
 * hierarchy stay consistent instead of each page inventing its own spacing. Tightened
 * deliberately: a finance console earns trust through information density, not whitespace.
 */

/** Consistent content width and page rhythm. */
export function PageBody({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1400px] space-y-4">{children}</div>
}

/** Page title, one line of operational context, and the page-level action. */
export function PageHeader({
  title,
  context,
  action,
}: {
  title: string
  context?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[15px] leading-tight font-semibold tracking-tight">{title}</h1>
        {context ? (
          <p className="text-muted-foreground mt-0.5 text-xs">{context}</p>
        ) : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  )
}

/**
 * A bordered content region with its own header strip.
 *
 * Replaces the oversized Card treatment: a header rule plus a hairline border gives the
 * same grouping at a fraction of the vertical cost.
 */
export function Panel({
  title,
  meta,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string
  meta?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn("rounded-data bg-card overflow-hidden border", className)}>
      {title ? (
        <header className="border-border bg-muted/30 flex items-center gap-3 border-b px-3 py-1.5">
          <h2 className="text-[12px] font-semibold tracking-tight">{title}</h2>
          {meta ? <span className="text-muted-foreground text-[11px]">{meta}</span> : null}
          {action ? <div className="ml-auto">{action}</div> : null}
        </header>
      ) : null}
      <div className={cn(bodyClassName)}>{children}</div>
    </section>
  )
}

/**
 * The attention strip.
 *
 * A compact bordered row rather than four large cards. Values render final - no count-up,
 * because an animating balance reads as instability in a finance product.
 */
export function MetricStrip({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-data bg-card grid grid-cols-2 divide-x divide-y border sm:grid-cols-4 sm:divide-y-0">
      {children}
    </div>
  )
}

export function Metric({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: "default" | "attention" | "active" | "blocked" | "settled"
}) {
  const toneClass = {
    default: "text-foreground",
    attention: "text-status-attention",
    active: "text-status-active",
    blocked: "text-status-blocked",
    settled: "text-status-settled",
  }[tone]

  return (
    <div className="px-3.5 py-2.5">
      <div className="text-muted-foreground text-[11px] tracking-wide uppercase">
        {label}
      </div>
      <div className={cn("tabular mt-0.5 text-xl leading-tight font-semibold", toneClass)}>
        {value}
      </div>
      {hint ? <div className="text-muted-foreground mt-0.5 text-[11px]">{hint}</div> : null}
    </div>
  )
}

/** Label/value pair for dense detail regions. */
export function Field({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("px-3.5 py-2.5", className)}>
      <div className="text-muted-foreground text-[11px] tracking-wide uppercase">
        {label}
      </div>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  )
}
