"use server"

/**
 * Server actions — every state mutation in the product goes through here.
 *
 * Running server-side keeps the identity cookie httpOnly and the API base URL out of the
 * browser. The client never talks to the backend directly.
 *
 * THE CONTRACT (FRONTEND_BACKEND_CONTRACT.md Part III)
 *
 *   - every mutation sends the client's `case_version`
 *   - a 409 means the case changed elsewhere: RELOAD, never blind retry
 *   - a 404 is the cross-tenant answer and is not softened to "forbidden"
 *   - the resulting state is read from the response, never assumed
 *   - revalidatePath after every successful mutation
 *
 * No financial value is computed here. The backend is authoritative.
 */

import { randomUUID } from "node:crypto"
import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"

import {
  DEMO_TENANT_COOKIE,
  DEMO_USER_COOKIE,
  escalateCase,
  instantiateScenario,
  reinvestigateCase,
  runReconciliation,
  startInvestigation,
  type ApiResult,
} from "@/lib/api"

export type ActionResult =
  | { status: "ok"; message: string; state?: string; caseVersion?: number }
  | { status: "conflict"; message: string }
  | { status: "forbidden"; message: string }
  | { status: "not_found"; message: string }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string }

/**
 * Maps a backend failure onto an actionable message.
 *
 * "Something went wrong" is not acceptable (directive section 30): the operator must know
 * whether to reload, ask for access, or fix their input.
 */
function toActionResult<T>(
  result: ApiResult<T>,
  success: (data: T) => ActionResult,
): ActionResult {
  if (result.ok) return success(result.data)

  switch (result.status) {
    case 409:
      return {
        status: "conflict",
        message: "This exception changed in another session. Showing the latest state.",
      }
    case 403:
      return {
        status: "forbidden",
        message: "You are not permitted to perform this operation.",
      }
    case 404:
      return { status: "not_found", message: "This exception is not available." }
    case 400:
    case 422:
      return { status: "invalid", message: result.message }
    case 503:
      return {
        status: "error",
        message: "The SettlementOps API is not reachable. Start the API and retry.",
      }
    default:
      return { status: "error", message: result.message }
  }
}

const refreshExceptionViews = (id?: string): void => {
  revalidatePath("/")
  revalidatePath("/exceptions")
  if (id) revalidatePath(`/exceptions/${id}`)
}

/* ------------------------------------------------------------ case actions */

export async function startInvestigationAction(
  caseId: string,
  caseVersion: number,
): Promise<ActionResult> {
  const result = await startInvestigation(caseId, caseVersion)
  const mapped = toActionResult(result, (d) => ({
    status: "ok" as const,
    // The backend decides the resulting state. With the AI kill switch off it escalates
    // rather than fabricating a proposal, and the UI reports what actually happened.
    message:
      d.state === "ESCALATED"
        ? "Investigation could not run — AI investigation is disabled. Case escalated for human review."
        : "Investigation started.",
    state: d.state,
    caseVersion: d.case_version,
  }))
  refreshExceptionViews(caseId)
  return mapped
}

export async function escalateCaseAction(
  caseId: string,
  caseVersion: number,
  reason: string,
): Promise<ActionResult> {
  const trimmed = reason.trim()
  if (trimmed === "") {
    return { status: "invalid", message: "An escalation reason is required." }
  }
  const result = await escalateCase(caseId, caseVersion, trimmed)
  const mapped = toActionResult(result, (d) => ({
    status: "ok" as const,
    message: "Case escalated for human review.",
    state: d.state,
    caseVersion: d.case_version,
  }))
  refreshExceptionViews(caseId)
  return mapped
}

export async function reinvestigateCaseAction(
  caseId: string,
  caseVersion: number,
): Promise<ActionResult> {
  const result = await reinvestigateCase(caseId, caseVersion)
  const mapped = toActionResult(result, (d) => ({
    status: "ok" as const,
    message: "Re-investigation started.",
    state: d.state,
    caseVersion: d.case_version,
  }))
  refreshExceptionViews(caseId)
  return mapped
}

/* -------------------------------------------------------- scenario actions */

export async function createScenarioAction(
  scenarioId: string,
  seed?: number,
): Promise<ActionResult> {
  const result = await instantiateScenario(
    scenarioId,
    seed ?? Math.floor(Math.random() * 1_000_000),
    randomUUID(),
  )
  const mapped = toActionResult(result, (d) => ({
    status: "ok" as const,
    // Report what the pipeline actually produced. A scenario that creates no case says so
    // — the matcher decides the outcome, not the scenario.
    message: d.replayed
      ? "This scenario was already created with that key; showing the original."
      : `Scenario created — ${d.records_created} records, ${d.cases_created} exception${
          d.cases_created === 1 ? "" : "s"
        }.`,
  }))
  revalidatePath("/")
  revalidatePath("/exceptions")
  revalidatePath("/scenarios")
  revalidatePath("/reconciliation")
  return mapped
}

export async function runReconciliationAction(): Promise<ActionResult> {
  const result = await runReconciliation()
  const mapped = toActionResult(result, (d) => ({
    status: "ok" as const,
    message: `Reconciliation complete — ${d.evaluated_count} evaluated, ${d.reconciled_count} reconciled, ${d.residual_count} residual.`,
  }))
  revalidatePath("/")
  revalidatePath("/exceptions")
  revalidatePath("/reconciliation")
  return mapped
}

/* ------------------------------------------------------------------ identity */

const SEEDED_SUBJECTS = ["demo-operator", "demo-approver", "demo-admin"] as const

export async function switchDemoUser(subject: string): Promise<void> {
  // Allowlist: never write an arbitrary caller-supplied value into the identity cookie.
  if (!(SEEDED_SUBJECTS as readonly string[]).includes(subject)) return

  const jar = await cookies()
  jar.set(DEMO_USER_COOKIE, subject, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 86_400,
  })
  // Switching identity must not carry the previous tenant selection across.
  jar.delete(DEMO_TENANT_COOKIE)
  revalidatePath("/", "layout")
}
