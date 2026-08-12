# ADR 0015: Ship Hermes Skill + MCP as supported first integration

- **Status:** Accepted
- **Date:** 2026-08-12
- **Supersedes:** ADR 0002

## Context

Hermes has a supported skill-installation surface and a standard stdio MCP
client. Those provide the project-progress workflow, project initialization
confirmation, opt-out behavior, and all five tracker MCP tools now. Hermes
lifecycle hooks have a different protocol from the Claude/Codex adapters and
need a separate compatibility spike.

Holding the useful, independently verifiable integration behind lifecycle-hook
parity delays Hermes adoption without improving the correctness of the skill or
MCP path.

## Decision

Ship Skill + MCP interoperability as supported Hermes compatibility. The
package CLI delegates installation and removal to Hermes management commands,
and documentation must describe the two managed components and their limits.

Native lifecycle hooks are deferred. The release must not claim automatic
resume injection, stale-progress guarding, or commit protection for Hermes
until a Hermes-specific adapter and end-to-end protocol tests exist.

## Consequences

- `install -g hermes`, `install-mcp -g hermes`, `status -g hermes`, `doctor -g
  hermes`, and `uninstall -g hermes` become supported once unit and isolated
  profile verification pass.
- The existing generic skill remains responsible for ask-before-init and
  opt-out behavior.
- A later hook/plugin spike is independently scoped and cannot regress this
  installation path.
