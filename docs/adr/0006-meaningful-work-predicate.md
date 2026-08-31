# ADR 0006: Define meaningful work as a successful non-progress write in an initialized project

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

ADR 0005 requires a deterministic meaningful-work predicate for the conditional stale-progress gate. Request-category heuristics and task-list parsing would make the enforcement decision dependent on ambiguous text or optional project hygiene.

## Decision

A Hermes session has meaningful work when both conditions are true:

1. `project-progress/Progress.md` existed when the relevant write occurred (the project is initialized); and
2. Hermes reports a successful write/edit operation whose target is outside `project-progress/`.

The plugin sets a session-local `meaningful_work = true` flag when this condition first becomes true. A successful update inside `project-progress/` does not itself establish meaningful work, but it satisfies the later freshness check if `Progress.md` is updated.

## Consequences

- The rule is deterministic, testable, and independent of the user’s wording or task-list quality.
- Even small non-progress edits in an initialized project require a current `Progress.md` before verification. This is intentional; users can avoid the gate only by making no project edits or by updating progress.
- Read-only tool calls, failed writes, edits to `project-progress/` only, and uninitialized projects do not activate the gate.
- The implementation must define the exact Hermes tool-name/argument shapes that count as successful writes and test each supported path.
