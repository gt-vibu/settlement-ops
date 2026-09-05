# Authorization Model

**Version:** 2.0.0 (Readiness Decision D3 — locked 2026-08-31)
**Supersedes:** 1.0.0. Change recorded in `CHANGE_CONTROL.md` as CC-003.

## 0. Why this document changed

v1.0.0 said roles "must be mapped onto the existing repository's auth system rather than creating a parallel identity system." Phase 0 inspection established that **no auth system exists** in this repository (`IMPLEMENTATION_READINESS.md` §5), so there was nothing to map onto. Decision D3 resolves this: build a **demo authentication adapter**, not a production identity provider, behind a stable interface a real IdP can later replace without touching domain code.

## 1. The two layers

Authentication and authorization are separate concerns and must stay separate in code.

```text
HTTP request
   │
   ▼
┌──────────────────────────────────────────┐
│ AUTHENTICATION ADAPTER  (swappable)      │
│ Demo adapter today; OIDC/JWT later.      │
│ Resolves a credential into an identity.  │
└──────────────────┬───────────────────────┘
                   │  produces
                   ▼
          ┌────────────────────┐
          │  RequestContext    │   ← trusted, server-constructed
          │  userId            │
          │  tenantId          │
          │  roles[]           │
          │  requestId         │
          │  correlationId     │
          └─────────┬──────────┘
                    │
                    ▼
   Application use cases → Domain → Repositories
   (every merchant-owned operation requires this context)
```

Everything above the `RequestContext` line is replaceable infrastructure. Everything below it is domain code that must never know how authentication happened.

## 2. `RequestContext`

The single trusted authorization value in the system.

```text
RequestContext {
  userId         : UserId        // authenticated subject
  tenantId       : MerchantId    // resolved SERVER-SIDE, never client-asserted
  roles          : Role[]        // resolved SERVER-SIDE from stored membership
  requestId      : RequestId
  correlationId  : CorrelationId
}
```

**Construction rules:**

1. Only the authentication adapter may construct a `RequestContext`.
2. It is immutable once constructed.
3. Every application use case touching merchant-owned data takes it as a **required, non-optional** parameter — enforced at the type level, so omitting it is a compile error rather than a runtime oversight.
4. Repositories derive merchant scope **only** from it. A repository must never take a merchant ID from a request payload, a path parameter, a query string, or model output.
5. It is never serialized into a prompt, a tool argument, or a log line beyond `userId`/`tenantId` identifiers.

## 3. Demo authentication adapter

The MVP adapter. Development and demo environments only.

### Accepted credential

```text
X-Demo-User-ID: <user-id>
```

### Resolution procedure

```text
1. Read X-Demo-User-ID.
2. Look the user up in the `users` table.
   → not found / inactive  ⇒ 401 UNAUTHENTICATED
3. Load that user's merchant memberships and roles
   from `user_merchant_roles` (server-side data).
4. Determine tenantId:
     • single membership          ⇒ use it
     • multiple memberships       ⇒ use X-Demo-Tenant-ID *only if*
                                    the user is a member of it;
                                    otherwise 403 FORBIDDEN
5. Construct RequestContext.
```

### The critical rule

> **`X-Demo-Tenant-ID` is a selector among tenants the user already belongs to. It is never a grant.**

The owner's lock states: "these should not be trusted directly by domain logic" and "the frontend must never be the source of tenant authorization." Step 4 implements exactly that. If the header were trusted as-supplied, any client could set an arbitrary tenant ID and read another merchant's data — the `SECURITY.md` T1 cross-tenant threat, and a `PRODUCTION_READINESS.md` hard blocker. **Tenant membership is always read from the database, never from the request.**

### Environment gating

| Environment | Demo adapter |
|---|---|
| `development`, `test`, `demo` | Enabled |
| `production` | **Disabled — startup fails if enabled** |

The application asserts at startup that `AUTH_ADAPTER=demo` and `NODE_ENV=production` cannot both hold. This is a fail-fast configuration check, not a runtime branch that could be misconfigured into production.

### What the demo adapter is not

It is not a production identity provider. It has no password flow, no session management, no token issuance, no refresh, no MFA, no account recovery. It is a **seeded-identity resolver** for a demo, and `LIMITATIONS.md` records it as such.

## 4. Roles

| Role | Capabilities |
|---|---|
| `OPERATOR` | Read cases within tenant; start investigations; request evidence; escalate; reject; view audit |
| `APPROVER` | All `OPERATOR` capabilities **plus** approve/reject eligible proposals |
| `ADMIN` | All `APPROVER` capabilities **plus** configuration, the AI kill switch, scenario instantiation, and reopening a `CLOSED` case |

Roles are per-membership: a user may be `OPERATOR` for merchant A and `APPROVER` for merchant B. Roles are never global.

## 5. Operation → role matrix

| Operation | Minimum role | Extra checks |
|---|---|---|
| `GET /v1/cases`, `/cases/{id}`, timeline, evidence, audit | `OPERATOR` | tenant scope |
| `POST /cases/{id}/investigations` | `OPERATOR` | case state + version; AI enabled |
| `POST /cases/{id}/request-evidence` | `OPERATOR` | verified disposition eligible |
| `POST /cases/{id}/escalate` | `OPERATOR` | legal source state (`STATE_MACHINE.md` §3) |
| `POST /cases/{id}/reject` | `APPROVER` | state `APPROVAL_PENDING`; reason required |
| **`POST /cases/{id}/approve`** | **`APPROVER`** | state, version, proposal eligibility, no prior terminal decision, idempotency key |
| `POST /reconciliation-runs`, `POST /imports` | `OPERATOR` | tenant scope; import size limits |
| `POST /demo/scenarios/{id}/instantiate` | `ADMIN` | demo environment flag **and** role |
| Reopen a `CLOSED` case | `ADMIN` | reason required |
| Toggle the AI kill switch | `ADMIN` | audited |

**Separation of duty:** the `APPROVER` requirement on approval is the human gate `SAFETY.md` §2 layer 7 depends on. An `OPERATOR` may start an investigation but may not approve its result.

## 6. Agent authorization

The agent receives a **service context**, never a human `RequestContext`.

```text
AgentToolContext {
  tenantId        : MerchantId   // copied from the initiating RequestContext
  caseId          : CaseId
  agentRunId      : AgentRunId
  correlationId   : CorrelationId
  permittedTools  : ToolName[]   // allowlist, fixed at run start
}
```

Rules:

1. The agent holds **no role**. `OPERATOR`, `APPROVER` and `ADMIN` are human-only.
2. Its permissions are strictly narrower than any human role: **read-only, allowlisted, tenant-pinned**.
3. `tenantId` is copied from the initiating human request at run start and is **immutable for the run**.
4. **A merchant ID appearing in model output is data, never authorization** (`AGENT_POLICY.md`). Tools ignore any tenant the model supplies and use the pinned context.
5. The agent can perform **no** state transition (`STATE_MACHINE.md` §5.2).
6. The agent has **no** credential reaching the evaluation/hidden-truth boundary (D5).

## 7. Tenant isolation enforcement

Defence in depth, in dependency order:

1. **Type level** — merchant-owned repository methods require a `MerchantScope` derived from `RequestContext`; it cannot be defaulted or omitted.
2. **Repository level** — every merchant-owned query filters on `tenant_id`. No exceptions.
3. **CI level** — a static check fails the build on a merchant-owned query lacking a tenant predicate.
4. **Test level** — `SECURITY_TEST_MATRIX.md` requires a merchant-A-reads-merchant-B test per resource type.

Explicitly rejected as the *primary* control: inferring authorization from the fact that a record ID was resolvable. **A found row is not an authorized row** (`ARCHITECTURE.md` §15).

## 8. Scenario authorization

Scenario instantiation requires `ADMIN` **and** a demo/sandbox environment. Scenarios create records only inside the requesting tenant and can never reach or mutate another tenant's data. Deployment forbids exposing scenario routes publicly in production (`DEPLOYMENT.md`).

## 9. Failure behavior

| Condition | Response | Body |
|---|---|---|
| Missing/unknown credential | `401` | `UNAUTHENTICATED` |
| Authenticated, wrong tenant | `403` | `FORBIDDEN` |
| Authenticated, insufficient role | `403` | `FORBIDDEN` |
| Resource in another tenant | **`404`** | `NOT_FOUND` |

The last row is deliberate: returning `403` for a resource in another tenant confirms the resource exists, which is a cross-tenant enumeration oracle. Foreign-tenant resources are indistinguishable from non-existent ones.

## 10. Migration path to real authentication

The demo adapter is confined to one module implementing one interface:

```text
AuthenticationAdapter {
  authenticate(request) -> RequestContext | AuthError
}
```

Replacing it with OIDC/JWT means implementing that interface and changing configuration. **No domain, application, repository or workflow code changes.** That property is what makes the demo adapter acceptable in the MVP, and it should be verified by a test that swaps in a stub adapter without touching anything below the boundary.
