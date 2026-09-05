# Development Workflow

## Before every phase

- read phase objective;
- identify dependencies;
- confirm affected modules;
- update or create tests before high-risk logic.

## During phase

- keep commits small and coherent;
- do not mix UI work with backend work;
- do not bypass CI;
- record architecture/security decisions.

## After phase

Run:

- unit tests;
- targeted integration tests;
- lint;
- typecheck;
- build;
- applicable security checks.

Update `PHASE_REVIEW.md` with PASS/WARN/FAIL and evidence.

## Locked commands (D1)

`pnpm verify` before every phase review. Integration tests need `pnpm db:up`.

## Boundary checks each phase

- [ ] no file under `apps/web` created or modified (D2);
- [ ] no `EVAL_DATABASE_URL` reachable from api/worker (D5);
- [ ] no verifier output reaching agent context (D6);
- [ ] no state transition added outside `STATE_MACHINE.md` v2.0.0 (D4);
- [ ] no `EXPERIMENT_CONSTANTS.md` value changed after approval without a `CHANGE_CONTROL.md` record (D7).
