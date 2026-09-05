import { AlertCircleIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export function ApiUnavailable({ message }: { message: string }) {
  return (
    <Alert>
      <AlertCircleIcon />
      <AlertTitle>The SettlementOps API is not reachable</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        <p className="text-muted-foreground mt-2 font-mono text-xs">
          pnpm db:up &amp;&amp; pnpm db:migrate, then start the API on port 3000.
        </p>
      </AlertDescription>
    </Alert>
  )
}
