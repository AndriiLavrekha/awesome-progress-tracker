# ADR 0012: Make package-managed Hermes installation best-effort transactional

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

A supported Hermes install creates/enables a plugin and registers/tests an MCP server. Leaving either component after the other fails produces a partial integration that violates the supported release contract.

## Decision

`awesome-progress-tracker install -g hermes` uses best-effort transaction semantics:

1. preflight prerequisites and collisions before mutation;
2. install and enable the managed plugin;
3. register the managed MCP server;
4. test the MCP connection and tool discovery; and
5. on a later failure, roll back only components created by this invocation.

The CLI reports the primary failure plus each rollback result. If rollback fails, it reports precise remaining state and remediation; it never masks the original error.

## Consequences

- The implementation needs an operation journal recording only changes made in the current invocation.
- Existing managed components are not modified or removed during rollback.
- Tests must simulate failure at each step and assert exact calls, rollback order, and diagnostic output.
- `status` and `doctor` must represent partial state accurately in the rare event rollback cannot complete.
