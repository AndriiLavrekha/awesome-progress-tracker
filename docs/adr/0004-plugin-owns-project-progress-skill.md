# ADR 0004: The Hermes plugin owns the project-progress skill

- **Status:** Accepted
- **Date:** 2026-08-01
- **Supersedes:** the separate-skill installation portion of ADR 0001

## Context

A supported Hermes release includes a standalone plugin with lifecycle hooks and a bundled skill. Installing `project-progress` independently through `hermes skills install` would create two owners for the same instructions, make upgrades drift, and make collision/uninstall behavior ambiguous.

## Decision

The release-mirror Hermes plugin bundles and owns the `project-progress` skill. Supported installation contains exactly:

1. the `awesome-progress-tracker` Hermes plugin, installed with `hermes plugins install <versioned-plugin-mirror>`; and
2. the `awesome-progress-tracker` MCP server, installed with `hermes mcp add`.

The package-managed wrapper delegates only those two operations. It does not invoke `hermes skills install` or `hermes skills uninstall` for the supported release.

## Consequences

- Plugin installation/update/uninstall owns the skill lifecycle.
- Status and doctor must inspect the installed plugin and MCP server, not a separately installed skill.
- Collision detection concerns the plugin name and MCP server name.
- The release mirror must include the validated `SKILL.md` in its plugin package.
- The raw, release-pinned skill URL remains useful only for development or a separately documented unsupported/manual fallback; it is not the supported release path.
