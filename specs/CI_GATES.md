# CI Gates

## Mandatory checks

- formatting;
- lint;
- typecheck;
- unit tests;
- integration tests;
- security tests;
- secret scan;
- dependency audit;
- code-size policy check;
- build;
- repository-structure checks where practical.

## Failure policy

Critical/high failures block merge or release.

Do not disable security checks solely to make CI pass.

---

# Part II — Readiness Resolutions (v2.0.0, locked 2026-08-31)

## Command surface (D1)

```text
pnpm format:check → lint → typecheck → test:unit → test:integration
   → check:size → check:deps → check:money → check:secrets → build
pnpm verify   runs all of the above in order
```

## Custom gates (no off-the-shelf equivalent)

| Script | Enforces |
|---|---|
| `check-file-size.ts` | `CODE_SIZE_POLICY.md` — warn ≥250, fail >350 without recorded exception, hard fail >500 |
| `check-deps.ts` | `ARCHITECTURE.md` §13 directions; **`packages/domain` has zero runtime deps**; **nothing imports `apps/web`** |
| `check-money.ts` | no `parseFloat` / `toFixed` / float literal in money paths |
| `check-secrets.ts` | secret patterns; `.env` never committed |

## Additional blocking gates

- fresh-database migration + smoke test (`MIGRATIONS.md`);
- **UI boundary**: fails if the implementation pipeline touches `apps/web`, or if `apps/web` appears in a backend manifest;
- **hidden-truth boundary**: fails if `EVAL_DATABASE_URL` appears in `apps/api` or `apps/worker` config schemas;
- **audit immutability**: fails if `UPDATE audit_events` succeeds under the application role;
- **verifier isolation**: fails if verifier output can reach agent context.

Critical/high failures block merge. Security checks are never disabled to make CI pass.
