# Coding Guidelines

## General

Prefer explicit, typed, boring code over clever abstractions.

## Module boundaries

Controllers/handlers should validate and delegate. Application services orchestrate. Domain services enforce business rules. Repositories persist. Adapters integrate external systems.

## Money

Use integer minor units and explicit currencies.

## Naming

Use domain names rather than generic names such as `data`, `thing`, `manager`, `helper` when a more precise name exists.

## Error handling

Use typed/domain error categories and map them to API-safe responses at the boundary.

## Model code

Keep prompts, model invocation, schema parsing, tool orchestration and verifier logic in separate modules.

## Tests

Test invariants directly. Do not use snapshot tests as the only assurance for financial rules.

## Comments

Explain why, not what. Document security-sensitive assumptions near code.
