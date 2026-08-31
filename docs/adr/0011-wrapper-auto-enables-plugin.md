# ADR 0011: Package-managed install enables the Hermes plugin

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

The supported package wrapper installs the release-mirror Hermes plugin and the MCP server. Hermes permits plugins to be installed disabled. Reporting install success while leaving lifecycle protections disabled would violate the supported-release expectation and create a difficult-to-diagnose partial setup.

## Decision

`awesome-progress-tracker install -g hermes` invokes Hermes plugin installation with explicit enablement. A successful wrapper install means the managed plugin is installed and enabled; documentation may still require a Hermes restart before new plugin/MCP configuration is loaded into a running process.

## Consequences

- The package wrapper must use the Hermes CLI’s supported auto-enable flag and verify enabled state in status/doctor.
- The native documented path must show an explicit enable step or option as well.
- Install errors must leave a clear partial-state diagnostic if plugin enablement or MCP registration fails after the other component succeeds.
- Uninstall removes/disables only the managed plugin after collision/ownership checks.
