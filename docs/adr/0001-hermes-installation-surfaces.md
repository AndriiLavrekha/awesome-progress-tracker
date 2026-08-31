# ADR 0001: Support both package-managed and Hermes-native installation

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

Awesome Progress Tracker must become usable in Hermes Agent while preserving Hermes profile safety and giving users a direct, supportable setup path. The adaptation plan considered a package CLI wrapper, documented native Hermes commands, and a standalone plugin.

## Decision

Pass 1 will support both:

1. A package wrapper: `awesome-progress-tracker install -g hermes` (and corresponding `install-mcp`, `status`, `doctor`, and `uninstall` paths).
2. A documented native Hermes path using `hermes skills install` and `hermes mcp add`.

The wrapper must delegate configuration changes to Hermes management commands. It must not write Hermes `config.yaml` or profile files directly.

The wrapper installs the skill using a raw GitHub URL pinned to the immutable Git tag that matches the npm release version (for example, npm `0.4.0` uses repository tag `v0.4.0`). It must reject or surface a release-process failure when that tag is absent rather than falling back to the default branch.

A standalone Hermes plugin is not part of Pass 1. It remains a potential Pass 2 delivery mechanism for lifecycle hooks after an isolated compatibility spike.

## Consequences

- Users can choose a concise tracker-native installation path or transparent Hermes-native commands.
- The package CLI needs a Hermes target, subprocess seam, and accurate status/uninstall behavior.
- Documentation must keep both paths equivalent and identify ownership of the installed skill and MCP server.
- Pass 1 does not promise Claude/Codex-style lifecycle hooks.
- If `project-progress` or `awesome-progress-tracker` already exists in the active profile, the wrapper fails with diagnostics by default. It must not replace, update, or silently skip an existing component. A future explicit force/remediation flow requires a separate decision and tests.

## Open Follow-ups

- Define the immutable or registry-backed skill source identifier.
- Verify the wrapper under a disposable Hermes profile.
