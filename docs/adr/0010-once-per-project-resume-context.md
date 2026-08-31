# ADR 0010: Inject resume context once per project per session

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

Hermes `pre_llm_call` runs once per turn. Re-injecting the same Resume Snapshot every turn wastes context and can drown out the user’s current request. Conversely, session-start-only injection does not serve a second initialized project discovered later through tool workdirs.

## Decision

For each initialized project tracked in a Hermes session, inject bounded resume context at most once: on the first eligible `pre_llm_call` after the plugin knows that project.

The plugin records `resume_context_injected = true` in that project’s session state. A later change to `Progress.md` does not trigger reinjection; agents obtain current detail through the bundled skill, normal file reads, or MCP tools.

## Consequences

- The injected context must include only the compact, existing contract: project identity, Resume Snapshot, Next Action, and non-empty Blockers, each bounded to a documented maximum.
- Tests must cover repeated turns, a project discovered after session start, multiple initialized projects, changed progress after injection, and oversized sections.
- Injection failure must not block the user message or other lifecycle protections.
