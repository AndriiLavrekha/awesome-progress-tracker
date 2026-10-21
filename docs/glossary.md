# Glossary

## Active Hermes profile

The Hermes configuration context selected by the current Hermes CLI environment. The package installer lets Hermes resolve it and never derives or edits the profile filesystem path itself.

## Hermes-native installation

Direct use of Hermes management commands (`hermes skills install`, `hermes mcp add`) without the Breadcrumbs package installer.

## Package-managed installation

A Breadcrumbs CLI command such as `breadcrumbs install -g hermes` that delegates the work to Hermes management commands.

## Project-progress skill

The reusable `SKILL.md` workflow that tells an agent when and how to maintain project-local Markdown progress state.

## Progress source of truth

`project-progress/Progress.md` in the tracked project. The global project index and MCP responses are derived views and must not replace it.

## Last runtime

The one line naming the provider, agent, model, and effort of the session that last updated `project-progress/Progress.md`. SessionStart repeats it.

## Tracker MCP server

The Node stdio server started by `breadcrumbs mcp`. In Hermes it's registered as `breadcrumbs`; discovered tools are prefixed `mcp_breadcrumbs_`.
