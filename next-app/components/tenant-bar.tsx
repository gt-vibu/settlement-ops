"use client"

/**
 * Identity indicator.
 *
 * SECURITY (readiness decision D3-R1): switching identity here does NOT confer access.
 * Tenant and roles are resolved server-side from stored membership; the backend refuses a
 * tenant the user does not belong to and returns 404 for another tenant's resources. This
 * is a convenience over a boundary the server owns - never the boundary itself.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { ChevronDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { switchDemoUser } from "@/app/actions"
import type { WhoAmI } from "@/lib/api"

const SEEDED = [
  { subject: "demo-operator", label: "Demo Operator", role: "OPERATOR" },
  { subject: "demo-approver", label: "Demo Approver", role: "APPROVER" },
  { subject: "demo-admin", label: "Demo Admin", role: "ADMIN" },
]

export function TenantBar({ identity }: { identity: WhoAmI | null }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  const switchUser = (subject: string) => {
    startTransition(async () => {
      await switchDemoUser(subject)
      router.refresh()
    })
  }

  if (!identity) {
    return <span className="text-muted-foreground text-[11px]">Not signed in</span>
  }

  return (
    <div className="flex items-center gap-2.5">
      <span className="text-muted-foreground hidden items-center gap-1.5 text-[11px] md:inline-flex">
        <span className="bg-status-settled size-1.5 rounded-full" aria-hidden="true" />
        merchant <span className="ident">{identity.tenant_id.slice(0, 8)}</span>
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="sm" disabled={pending} className="h-7 gap-1.5 px-2">
              <span className="text-[11px] font-medium">
                {identity.roles[0] ?? "No role"}
              </span>
              <ChevronDownIcon className="size-3 opacity-60" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          {/* GroupLabel requires a Group ancestor; without one Base UI throws and takes
              the page down with it. */}
          <DropdownMenuGroup>
            <DropdownMenuLabel>Seeded demo identities</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SEEDED.map((u) => (
              <DropdownMenuItem key={u.subject} onClick={() => switchUser(u.subject)}>
                <span className="flex-1">{u.label}</span>
                <span className="text-muted-foreground text-[11px]">{u.role}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
