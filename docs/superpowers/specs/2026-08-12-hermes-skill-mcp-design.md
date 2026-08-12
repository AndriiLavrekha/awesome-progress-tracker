# Hermes Skill and MCP Integration Design

## Goal

Provide the supported first Hermes Agent integration that installs the existing
`project-progress` skill and the existing `awesome-progress-tracker` stdio MCP
server. It must leave Hermes profile-file management to the Hermes CLI and
preserve `project-progress/Progress.md` as the canonical project state.

## Scope

This release adds `hermes` as an agent target for the package CLI's
`install`, `install-mcp`, `status`, `doctor`, and `uninstall` workflows.
It installs only two managed components:

- the `project-progress` skill;
- an MCP server named `awesome-progress-tracker`, configured with the current
  `PROJECT_PROGRESS_ROOTS` value.

The existing generic skill remains the workflow authority: it asks before
initializing a project and honors explicit opt-out. The existing Node MCP
server remains unchanged except for configuration needed to register it.

## Exclusions

Hermes lifecycle hooks and a standalone Hermes plugin are deferred. Hermes's
`pre_llm_call`, `pre_tool_call`, and `pre_verify` contracts have a distinct
JSON request/response protocol, so reusing the Claude/Codex adapter would be
incorrect. A later, independently tested hook spike may add resume context,
commit protection, or stale-progress reminders.

The integration does not hand-edit `config.yaml`, install dependencies, modify
the user's default Hermes profile in tests, or replace identically named,
user-owned skills or MCP servers.

## Design

`src/cli.ts` gains `"hermes"` in `AgentTarget` and a narrow command-runner
seam backed by `execFile`. The Hermes branch invokes documented Hermes CLI
subcommands with argument arrays; it never builds a shell command.

Before mutating the profile, install checks for collisions with
`project-progress` and `awesome-progress-tracker`. A collision is a clear
failure with remediation; it is never silently overwritten. Full installation
adds the skill and then the MCP server. If the latter fails, it removes only
the skill created by that invocation and reports both the original failure and
any rollback failure. `install-mcp` skips the skill. Uninstall treats an
already-absent managed component as success, but reports other failures.

Status and doctor query Hermes through its management commands rather than
inferring state from filesystem locations. Doctor reports CLI availability,
skill state, MCP state, an MCP connection test, index writability, and whether
the current repository is initialized. Its output names exactly which
component needs remediation.

## User Experience

The supported path is:

```bash
npx awesome-progress-tracker install -g hermes --roots "C:/Users/me/Projects"
npx awesome-progress-tracker doctor -g hermes
```

The installer delegates profile-safe changes to Hermes and informs the user to
restart Hermes when needed. README and test documentation label this as
supported "Skill + MCP integration" and explicitly say that automatic resume
injection, stale-progress guarding, and commit protection are deferred.

## Testing and Verification

Unit tests mock the command runner and assert exact program/argument arrays,
collision checks, partial-failure rollback, `mcpOnly`, idempotent removal, and
status/doctor parsing. Existing Claude and Codex behavior remains covered.

Release verification uses a temporary Hermes home/profile and a packed package
artifact. It verifies skill discovery, MCP registration and connection, a
project list/read/update flow, ask-before-initialization/opt-out behavior, and
clean uninstall. No test uses or changes the deployed Hermes profile.

## Decision

Ship Skill + MCP interoperability first. Start lifecycle integration only as a
separate design spike after this path is stable and Hermes's hook payloads and
failure semantics are tested directly.
