# ADR 0005: Use a conditional stale-progress verification gate

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

Hermes `pre_verify` can return an action that keeps the agent working. An unconditional gate after every edit would be noisy for trivial changes; a passive warning would not provide the lifecycle protection required for the supported Hermes release.

## Decision

The Hermes plugin uses a conditional stale-progress gate. It requires a `Progress.md` update before verification/finalization only when the session has tracked meaningful work and `project-progress/Progress.md` remains stale.

The plugin must define meaningful work with a deterministic, observable session predicate. It may not use an LLM interpretation of request importance as the enforcement decision.

## Consequences

- The plugin needs session-local state for observed non-progress changes and a baseline timestamp/hash for `Progress.md`.
- Tests must cover trivial and read-only flows, qualifying multi-step work, a current progress file, and stale progress.
- `pre_verify` returns a continuation message only for the qualifying stale case; all other cases are no-ops.
- The exact qualifying predicate remains an implementation decision and must be documented before coding.
