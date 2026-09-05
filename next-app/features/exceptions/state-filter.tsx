"use client"

import { useRouter } from "next/navigation"

import { cn } from "@/lib/utils"

/** Only states the backend can actually produce in Phase 1 are offered. */
const STATES = [
  { value: "", label: "All" },
  { value: "EXCEPTION", label: "Exception" },
  { value: "INVESTIGATING", label: "Investigating" },
  { value: "ESCALATED", label: "Escalated" },
  { value: "REQUESTING_EVIDENCE", label: "Evidence requested" },
  { value: "CLOSED", label: "Closed" },
]

export function StateFilter({ current }: { current: string }) {
  const router = useRouter()

  return (
    <div
      role="group"
      aria-label="Filter by state"
      className="bg-muted/70 rounded-data inline-flex items-center gap-0.5 p-0.5"
    >
      {STATES.map((option) => {
        const active = option.value === current
        return (
          <button
            key={option.value || "all"}
            type="button"
            aria-pressed={active}
            onClick={() =>
              router.push(option.value ? `/exceptions?state=${option.value}` : "/exceptions")
            }
            className={cn(
              "focus-visible:ring-ring rounded-[0.25rem] px-2.5 py-1 text-xs transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none",
              active
                ? "bg-background text-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
