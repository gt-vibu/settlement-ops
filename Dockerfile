# SettlementOps API and worker.
#
# One image for both processes: they share every package and differ only in entry point,
# so two images would be two things to keep in sync for no benefit.
#
# TypeScript is executed directly by Node's type stripping rather than compiled to a dist
# tree. The repository already typechecks in CI (`pnpm typecheck`), so a separate build
# artefact would add a step without adding a check.

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

# Dependency layer: copied first so a source change does not re-resolve the workspace.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY packages/agent/package.json packages/agent/
COPY packages/application/package.json packages/application/
COPY packages/audit/package.json packages/audit/
COPY packages/domain/package.json packages/domain/
COPY packages/evaluation/package.json packages/evaluation/
COPY packages/persistence/package.json packages/persistence/
COPY packages/scenario/package.json packages/scenario/
COPY packages/shared/package.json packages/shared/
COPY packages/tools/package.json packages/tools/
COPY packages/verification/package.json packages/verification/
COPY packages/workflow/package.json packages/workflow/

RUN pnpm install --frozen-lockfile --prod=false

COPY tsconfig.base.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

# Never run as root. A compromised process should not own its own filesystem.
RUN addgroup -S settlementops && adduser -S settlementops -G settlementops \
    && chown -R settlementops:settlementops /app
USER settlementops

EXPOSE 3000

# Overridden per service in docker-compose.prod.yml.
CMD ["node", "--experimental-strip-types", "apps/api/src/index.ts"]
