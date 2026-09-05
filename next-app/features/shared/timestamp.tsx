import { formatDateTime, formatRelativeAge } from "@/lib/format"
import { cn } from "@/lib/utils"

export function Timestamp({
  iso,
  relative,
  className,
}: {
  iso: string
  relative?: boolean
  className?: string
}) {
  return (
    <time
      dateTime={iso}
      title={formatDateTime(iso)}
      className={cn("tabular whitespace-nowrap", className)}
    >
      {relative ? formatRelativeAge(iso) : formatDateTime(iso)}
    </time>
  )
}
