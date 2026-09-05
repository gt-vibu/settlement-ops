"use client"

import * as React from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/** An identifier an operator will need to paste into another system. */
export function Identifier({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = React.useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard can be unavailable (permissions, insecure context). Silently keep the
      // value selectable rather than showing an error for a convenience affordance.
    }
  }

  return (
    <span className={cn("group/id inline-flex items-center gap-1", className)}>
      <span className="ident">{value}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : `Copy ${value}`}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-data p-0.5 opacity-0 transition-opacity duration-150 group-hover/id:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none"
      >
        {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
      </button>
    </span>
  )
}
