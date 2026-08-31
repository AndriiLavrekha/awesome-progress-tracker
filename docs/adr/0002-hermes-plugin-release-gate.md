# ADR 0002: Gate public Hermes support on the standalone plugin

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

The initial adaptation plan treated skill plus MCP integration as a shippable Pass 1 and lifecycle hooks as a later enhancement. That would create a materially weaker experience than the existing Claude Code and Codex integrations: no automatic resume context, stale-progress safety net, or restricted-progress commit guard.

## Decision

Do not ship the package-managed Hermes wrapper as supported Hermes compatibility until a standalone Hermes plugin is complete and verified.

The standalone plugin is the release gate. It must provide Hermes-native implementations of:

1. compact resume-context injection;
2. stale-progress continuation/warning behavior before verification/finalization; and
3. the restricted progress-file commit guard.

The original skill and MCP work may be built as prerequisites or used for private development validation, but they must not be marketed as complete Hermes support. Once the plugin is ready, ship both the package wrapper and documented Hermes-native installation path.

## Consequences

- The plan must be reordered around plugin architecture and hook behavior before CLI-wrapper work.
- The full feature set cannot reuse the Claude/Codex adapter unchanged; it needs a Hermes-specific integration and test harness.
- Release validation must include real lifecycle behavior in an isolated Hermes profile, not only skills/MCP discovery.
- Documentation must distinguish prototype/prerequisite integration from supported Hermes compatibility until the plugin gate passes.
