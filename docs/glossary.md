# Glossary

## Active Hermes profile

The Hermes configuration context selected by the current Hermes CLI environment. The package installer must let Hermes resolve it; it must not derive or edit the profile filesystem path itself.

## Hermes-native installation

Direct use of Hermes management commands, specifically `hermes skills install` and `hermes mcp add`, without calling the Awesome Progress Tracker package installer.

## Package-managed installation

An Awesome Progress Tracker CLI command such as `awesome-progress-tracker install -g hermes` that delegates installation work to Hermes management commands.

## Project-progress skill

The reusable `SKILL.md` workflow that tells an agent when and how to maintain project-local Markdown progress state. It is named `project-progress` and, for supported Hermes releases, is bundled and owned by the Hermes plugin rather than separately installed.

## Progress source of truth

`project-progress/Progress.md` in the tracked project. The global project index and MCP responses are derived views and must not replace it.

## Tracker MCP server

The Node stdio server started by `awesome-progress-tracker mcp`. In Hermes it is registered as `awesome-progress-tracker`; discovered tools are prefixed `mcp_awesome_progress_tracker_`.

## Lifecycle safety net

Optional automation that injects progress context, warns about stale progress, or blocks restricted commits. It is distinct from the skill and MCP integration and is deferred to Pass 2 pending a Hermes-specific spike.

## Meaningful-work predicate

A deterministic, session-local rule used by the Hermes plugin to decide whether stale project progress blocks verification. For initialized Git projects it is true when a content-aware working-tree delta outside `project-progress/` exists since session start; for non-Git projects it falls back to a successful structured write/edit outside that directory. It is not based on an LLM's subjective judgment.

## Content-aware Git baseline

A session-start representation of Git working-tree file content/state that can detect an edit to a file that was already dirty. It is stronger than a `git status --porcelain` snapshot and avoids parsing terminal command text.

## Project session state

Lazy state held by the Hermes plugin for one initialized project touched in a session: normalized root, Git baseline or non-Git fallback, `Progress.md` freshness, meaningful-work eligibility, and whether compact resume context was injected. A session can own independent state for up to ten projects.

## Resume-context injection

The bounded project identity, Resume Snapshot, Next Action, and non-empty Blockers prepended through Hermes `pre_llm_call`. It occurs at most once per initialized project per session.

## Restricted-progress commit guard

The Hermes `pre_tool_call` protection for unambiguous Git commit attempts. It blocks a commit when staged progress is restricted by `sensitivity: sensitive` or `commit_progress: false`, and also blocks when that determination cannot be made safely.

## Hermes release gate

The acceptance condition that prevents package-managed Hermes support from shipping until the standalone Hermes plugin has delivered and verified resume-context injection, stale-progress handling, and the restricted-progress commit guard.

## Plugin release mirror

A Git repository or artifact generated from this repository's `hermes-plugin/` directory. Its root contains the Hermes `plugin.yaml` and plugin entry point, so it can be installed with `hermes plugins install`. It is tagged from the same source revision as the matching npm release.

## Immutable plugin reference

The upstream-supported Hermes plugin-install selector for a specific Git release ref plus nested plugin directory. It must install the `hermes-plugin/` artifact from the same immutable tag as the npm release; a moving default branch is not sufficient.

## Package-managed Hermes install

The explicit `awesome-progress-tracker install -g hermes` path. It installs and enables the managed Hermes plugin plus registers/tests the tracker MCP server as a best-effort transaction, rolling back only components created by that invocation on a later failure.

## Installation operation journal

The in-memory record of components created by one package-managed Hermes install invocation. It determines the safe rollback set and never includes pre-existing user or managed components.

## Unsupported plugin drift

A package-managed plugin whose verified version or provenance no longer matches its installed npm package, commonly after `hermes plugins update`. `doctor` reports it and directs the user to rerun the package wrapper; generic Hermes plugin update is not a supported upgrade path.
