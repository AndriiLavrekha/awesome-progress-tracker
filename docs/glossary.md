# Glossary

## Active Hermes profile

The Hermes configuration context selected by the current Hermes CLI environment. The package installer lets Hermes resolve it and never derives or edits the profile filesystem path itself.

## Hermes-native installation

Direct use of Hermes management commands (`hermes skills install`, `hermes mcp add`) without the Awesome Progress Tracker package installer.

## Package-managed installation

An Awesome Progress Tracker CLI command such as `awesome-progress-tracker install -g hermes` that delegates the work to Hermes management commands.

## Project-progress skill

The reusable `SKILL.md` workflow that tells an agent when and how to maintain project-local Markdown progress state.

## Progress source of truth

`project-progress/Progress.md` in the tracked project. The global project index and MCP responses are derived views and must not replace it.

## Tracker MCP server

The Node stdio server started by `awesome-progress-tracker mcp`. In Hermes it's registered as `awesome-progress-tracker`; discovered tools are prefixed `mcp_awesome_progress_tracker_`.
