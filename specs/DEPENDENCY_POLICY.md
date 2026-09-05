# Dependency Policy

## Before adding a dependency

Document:

- why it is needed;
- why existing dependencies cannot satisfy the use case;
- maintenance health;
- known security concerns;
- license compatibility;
- bundle/runtime impact.

## Principles

Prefer standard library or existing repository utilities for simple tasks. Avoid adding a framework for a single helper.

## AI SDKs

Provider SDKs belong behind the model-gateway boundary and should not leak into domain/application contracts.

## Locked stack (D1)

Fastify, Drizzle, Zod, Vitest, Pino, `pg`, OpenTelemetry SDK. A package may not introduce a second HTTP framework, ORM, validator or test runner.

## Boundary rules

- `packages/domain`: **zero runtime dependencies**, CI-enforced.
- Model provider SDKs: only behind `ModelGateway` in `packages/agent`.
- Database driver: only in `packages/persistence`.
- HTTP framework: only in `apps/api`.
- **No frontend dependency may be added to any manifest** (D2).
