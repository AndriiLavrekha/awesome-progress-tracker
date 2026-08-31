# ADR 0003: Distribute the nested Hermes plugin through a release mirror

- **Status:** Superseded by ADR 0013
- **Date:** 2026-08-01

> Superseded because current Hermes supports nested plugin directories directly, while a moving mirror default branch cannot provide the required immutable package/plugin provenance. ADR 0013 requires upstream immutable Git-ref support instead.

## Context

The Hermes lifecycle integration will live in `hermes-plugin/` within this repository so it can evolve with the Node MCP server and shared project-progress assets. Hermes’ documented Git installation command accepts a repository identifier and documents `plugin.yaml` at the installed plugin root; it does not establish a nested-subdirectory install contract.

## Decision

Keep the plugin source in `hermes-plugin/` in this repository. Release automation will publish a plugin-only Git mirror/artifact whose root is the contents of that directory, including `plugin.yaml`, Python entry point(s), bundled skill assets, and plugin metadata.

The mirror is the identifier passed to `hermes plugins install`. It must be generated from the same immutable source revision as the npm package and tagged with the matching `v<package-version>` version.

Neither the npm wrapper nor user documentation may copy a nested plugin directory directly into `~/.hermes/plugins/`; installation must remain mediated by `hermes plugins install`.

## Consequences

- The release pipeline needs a deterministic subtree export/mirror publication stage and verification that the mirror root is a loadable Hermes plugin.
- The plugin source can share release cadence and review with the npm package while retaining a Hermes-compatible installation root.
- Version, changelog, and rollback instructions must cover both the npm package and plugin mirror.
- A missing/mismatched mirror is release-blocking for Hermes support.
