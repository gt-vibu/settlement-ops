# apps/web - USER-OWNED

This workspace is reserved for the frontend and is **owned by the user**.

## Boundary

The backend implementation pipeline **must not**:

- create, modify, rename, move or delete any file in this directory
  (other than this placeholder and its `package.json`);
- add any frontend dependency to any manifest in the repository;
- make visual design, styling, component, layout or frontend-architecture decisions.

The boundary is enforced by CI, not by convention:

- `scripts/check-ui-boundary.ts` fails if any backend package imports from `apps/web`,
  or if `apps/web` appears as a dependency of a backend package;
- `scripts/check-deps.ts` treats `apps/web` as forbidden in every backend import graph;
- ESLint, Prettier, Vitest and the TypeScript build all exclude this directory.

## Contract

The web application consumes the published OpenAPI contract from `apps/api`.
It never reaches the database, and it is never a source of tenant authorization,
financial truth, or state transitions.

References: `specs/REPOSITORY_STRUCTURE.md` section 3, `specs/FRONTEND_BACKEND_CONTRACT.md`,
`READINESS_RESOLUTION_REPORT.md` decision D2.
