/**
 * Server-side API client.
 *
 * Every call runs on the server: the backend base URL never reaches the browser, and the
 * demo identity is read from an httpOnly cookie rather than chosen by client JavaScript.
 *
 * SECURITY (readiness decision D3-R1): the tenant header is a SELECTOR, not a grant. The
 * backend refuses a tenant the user is not a member of, returns 404 for another tenant's
 * resources, and resolves roles from stored membership. This client forwards the selection
 * and renders whatever the backend allows - it never treats a tenant value as access.
 */

import { cookies } from "next/headers"

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000"

export const DEMO_USER_COOKIE = "so_demo_user"
export const DEMO_TENANT_COOKIE = "so_demo_tenant"

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string; details?: unknown }

async function headers(): Promise<Record<string, string>> {
  const jar = await cookies()
  const user = jar.get(DEMO_USER_COOKIE)?.value ?? "demo-operator"
  const tenant = jar.get(DEMO_TENANT_COOKIE)?.value
  const h: Record<string, string> = {
    "X-Demo-User-ID": user,
    "Content-Type": "application/json",
  }
  if (tenant) h["X-Demo-Tenant-ID"] = tenant
  return h
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...(await headers()), ...(init?.headers as Record<string, string>) },
      cache: "no-store",
    })
  } catch {
    return {
      ok: false,
      status: 503,
      code: "DEPENDENCY_UNAVAILABLE",
      message: "The SettlementOps API is not reachable.",
    }
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string; details?: unknown }
    } | null
    return {
      ok: false,
      status: response.status,
      code: body?.error?.code ?? "INTERNAL_ERROR",
      message: body?.error?.message ?? "The request could not be completed.",
      details: body?.error?.details,
    }
  }

  if (response.status === 204) return { ok: true, data: undefined as T }
  return { ok: true, data: (await response.json()) as T }
}

const post = <T>(path: string, body?: unknown, extra?: Record<string, string>) =>
  request<T>(path, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
    ...(extra ? { headers: extra } : {}),
  })

/* ---------------------------------------------------------------- contracts */

export interface WhoAmI {
  user_id: string
  tenant_id: string
  roles: string[]
  request_id: string
}

export interface ExceptionRow {
  id: string
  case_number: string
  state: string
  priority: number
  discrepancy_amount_minor: string
  currency: string
  reasons: string[]
  opened_at: string
}

export interface OperationsSummary {
  cases_by_state: Record<string, number>
  open_case_count: number
}

export interface InvestigationRun {
  id: string
  status: string
  failure_code: string | null
  case_version_at_start: number
  tool_call_count: number
  policy_version: string
  started_at: string
  finished_at: string | null
}

export interface AuditEvent {
  id: string
  entity_type: string
  entity_id: string
  event_type: string
  actor_type: string
  actor_id: string | null
  previous_state: string | null
  next_state: string | null
  case_version: number | null
  payload?: Record<string, unknown>
  occurred_at: string
}

export interface ScenarioCatalogEntry {
  id: string
  name: string
  description: string
  expects_exception: boolean
}

export interface ScenarioInstance {
  id: string
  scenario_id: string
  seed: number
  status: string
  records_created: number
  cases_created: number
  created_at: string
}

export interface ReconciliationRun {
  id: string
  status: string
  policy_version: string
  evaluated_count: number
  reconciled_count: number
  residual_count: number
}

/* ------------------------------------------------------------------- reads */

export const getWhoAmI = () => request<WhoAmI>("/v1/whoami")

export const getOperationsSummary = () =>
  request<OperationsSummary>("/v1/operations/summary")

export const listExceptions = (params: { state?: string; limit?: number } = {}) => {
  const q = new URLSearchParams()
  if (params.state) q.set("state", params.state)
  q.set("limit", String(params.limit ?? 100))
  return request<{ items: ExceptionRow[]; limit: number; offset: number }>(
    `/v1/cases?${q.toString()}`,
  )
}

export const getException = (id: string) => request<ExceptionRow>(`/v1/cases/${id}`)

export const listInvestigations = (id: string) =>
  request<{ items: InvestigationRun[] }>(`/v1/cases/${id}/investigations`)

export const listCaseAudit = (id: string) =>
  request<{ items: AuditEvent[] }>(`/v1/cases/${id}/audit`)

export const listRecentAudit = (limit = 12) =>
  request<{ items: AuditEvent[] }>(`/v1/audit?limit=${limit}`)

export const listScenarios = () =>
  request<{ items: ScenarioCatalogEntry[] }>("/v1/demo/scenarios")

export const listScenarioInstances = () =>
  request<{ items: ScenarioInstance[] }>("/v1/demo/scenario-instances")

/* --------------------------------------------------------------- mutations */

export const startInvestigation = (id: string, caseVersion: number) =>
  post<{ investigation_id: string; status: string; state: string; case_version: number }>(
    `/v1/cases/${id}/investigations`,
    { case_version: caseVersion },
  )

export const escalateCase = (id: string, caseVersion: number, reason: string) =>
  post<{ state: string; case_version: number }>(`/v1/cases/${id}/escalate`, {
    case_version: caseVersion,
    reason,
  })

export const reinvestigateCase = (id: string, caseVersion: number) =>
  post<{ state: string; case_version: number }>(`/v1/cases/${id}/reinvestigate`, {
    case_version: caseVersion,
  })

export const instantiateScenario = (
  scenarioId: string,
  seed: number,
  idempotencyKey: string,
) =>
  post<ScenarioInstance & { replayed: boolean }>(
    `/v1/demo/scenarios/${scenarioId}/instantiate`,
    { seed },
    { "Idempotency-Key": idempotencyKey },
  )

export const runReconciliation = () =>
  post<ReconciliationRun>("/v1/reconciliation-runs", {})

export const approveCase = (id: string, caseVersion: number, note = "") =>
  post<{ state: string; case_version: number }>(`/v1/cases/${id}/approve`, {
    case_version: caseVersion,
    note,
  })

export const stageCase = (id: string, caseVersion: number, amountMinor = "0") =>
  post<{ state: string; case_version: number; note: string }>(`/v1/cases/${id}/stage`, {
    case_version: caseVersion,
    action_type: "STAGE_LEDGER_ADJUSTMENT",
    amount_minor: amountMinor,
  })

