import Link from "next/link"

import { cn } from "@/lib/utils"
import { TenantBar } from "@/components/tenant-bar"
import type { WhoAmI } from "@/lib/api"

/**
 * Four destinations, each backed by a real workflow.
 *
 * Payments, Settlements, Approvals and Audit are deliberately absent: their backend
 * contracts do not exist, and a navigation item that does not work is worse than a smaller
 * real application.
 */
const NAV = [
  { href: "/", label: "Overview", exact: true },
  { href: "/exceptions", label: "Exceptions", exact: false },
  { href: "/reconciliation", label: "Reconciliation", exact: false },
  { href: "/scenarios", label: "Scenarios", exact: false },
] as const

export function AppShell({
  children,
  identity,
  activePath,
  pending,
}: {
  children: React.ReactNode
  identity: WhoAmI | null
  activePath: string
  /** Counts against nav items so the header communicates work, not only location. */
  pending?: Partial<Record<string, number>>
}) {
  return (
    <div className="bg-background flex min-h-svh flex-col">
      <header className="border-border bg-card sticky top-0 z-20 border-b">
        <div className="mx-auto flex h-11 w-full max-w-[1400px] items-center gap-5 px-4">
          <Link href="/" className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-[13px] font-semibold tracking-tight">SettlementOps</span>
            <span className="text-muted-foreground/70 hidden text-[11px] lg:inline">
              Finance Operations
            </span>
          </Link>

          <nav aria-label="Primary" className="flex h-full items-stretch">
            {NAV.map((item) => {
              const active = item.exact
                ? activePath === item.href
                : activePath.startsWith(item.href)
              const count = pending?.[item.href]
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    // An underline rail reads as a console tab; a pill reads as a button.
                    "relative inline-flex items-center gap-1.5 px-3 text-[13px] transition-colors duration-150",
                    "after:absolute after:inset-x-2 after:bottom-0 after:h-px after:transition-colors",
                    active
                      ? "text-foreground after:bg-primary font-medium"
                      : "text-muted-foreground hover:text-foreground after:bg-transparent",
                  )}
                >
                  {item.label}
                  {count !== undefined && count > 0 ? (
                    <span
                      className={cn(
                        "tabular rounded-full px-1.5 text-[10px] leading-[1.15rem]",
                        active
                          ? "bg-status-attention-bg text-status-attention"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {count}
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto">
            <TenantBar identity={identity} />
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-4">{children}</main>
    </div>
  )
}
