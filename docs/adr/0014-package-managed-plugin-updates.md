# ADR 0014: Make the package wrapper the supported plugin-upgrade path

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

Current `hermes plugins update <name>` performs a Git pull from the installed plugin’s remote. That tracks a moving branch and cannot preserve the required npm-package-to-plugin immutable pairing.

## Decision

For package-managed Awesome Progress Tracker installations, the package wrapper is the only supported plugin-upgrade mechanism. It resolves the installed npm version to its matching immutable plugin ref, replaces/reinstalls the managed plugin transactionally, verifies provenance, and preserves the managed MCP configuration.

The wrapper must not invoke `hermes plugins update`. `doctor` detects a plugin whose recorded/verified provenance does not match the installed package version and labels it unsupported drift with remediation through the package wrapper.

## Consequences

- Upgrade/reinstall tests must assert no `hermes plugins update` invocation.
- The wrapper needs managed-component provenance/version inspection before modifying a plugin.
- Documentation distinguishes package-managed updates from users’ independently managed native plugin installations.
- A generic manual plugin update does not silently become supported merely because the plugin still loads.
