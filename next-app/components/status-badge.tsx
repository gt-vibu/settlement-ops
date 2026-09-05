import { cn } from "@/lib/utils"
import { TONE_CLASS, humanizeState, toneFor } from "@/lib/case-state"

/**
 * Operational state treatment.
 *
 * State is carried by TEXT as well as colour - never colour alone, so it survives
 * greyscale printing and colour-vision differences.
 */
export function StatusBadge({
  state,
  className,
}: {
  state: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "rounded-data inline-flex items-center gap-1.5 px-1.5 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap",
        TONE_CLASS[toneFor(state)],
        className,
      )}
    >
      <span className="size-1 rounded-full bg-current opacity-70" aria-hidden="true" />
      {humanizeState(state)}
    </span>
  )
}
