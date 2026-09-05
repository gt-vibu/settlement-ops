import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/format"

/**
 * Money is rendered from an integer minor-unit STRING. It is never parsed to a number
 * and never computed here - the backend is the sole authority on financial values
 * (directive section 29).
 */
export function Money({
  minor,
  currency,
  className,
  muted,
}: {
  minor: string
  currency: string
  className?: string
  muted?: boolean
}) {
  return (
    <span
      className={cn(
        "tabular tracking-tight",
        muted ? "text-muted-foreground" : "text-foreground",
        className,
      )}
    >
      {formatMoney(minor, currency)}
    </span>
  )
}
