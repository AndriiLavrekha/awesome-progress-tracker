---
project: progress-tracker
progress_schema_version: 1
status: in_progress
path: C:/Users/nkinc/Documents/progress-tracker
agent_last_used: codex
updated: 2026-08-12
last_milestone: Hermes Skill + MCP integration design approved; spec drafted for review
deployed: true
deployment_url: https://github.com/AndriiLavrekha/awesome-progress-tracker/releases/tag/v0.2.3
sensitivity: normal
commit_progress: true
---

# Progress Tracker

## Resume Snapshot

The Codex MCP cold-start fix is released as `v0.2.2`. The Codex plugin now starts its already-installed MCP artifact with `node dist/src/mcp/server.js` and `cwd: "."`, avoiding GitHub-source npx installation during MCP initialization. Release verification passed: focused and full tests, typecheck, build, package dry-run, and a JSON-RPC initialize response in 0.360 seconds.

On top of that, added a `PreToolUse` hook on `Edit`/`Write` (`handlePreEdit` in `src/hook/cc-adapter.ts`, subcommand `pre-edit`) that reminds the agent once per session to check `Tasks.md`/`Open Questions.md` before changing project files, closing the gap where casual "add a feature"/"do a pass" requests skipped the `project-progress` skill entirely. TDD'd with 4 new tests; wired into `hooks/hooks.json` and `hooks/hooks-codex.json`; manifest tests and SKILL.md updated. Full suite: 97 tests passed, typecheck clean, build clean. Published as `v0.2.3`.

## Current State

This repository contains a Markdown-first project progress workflow for Codex, Claude Code, and future agent tooling. The Codex plugin behavior now covers initialized, uninitialized, and opted-out projects.

The approved direction is skill-first and project-local:

- every project stores progress in `project-progress/`
- Markdown files are the source of truth
- no standalone CLI is required for the first version
- MCP may later read and update the same Markdown files
- lifecycle hooks should nudge, validate, and load context where supported
- reads and writes should be token-conscious by default
- hook strictness, schema versioning, freshness, completion, privacy, discovery, and failure expectations are now final design defaults

## Last Session

The user described losing project state across many folders, coding agents, terminal sessions, reboots, and token limits. The design evolved from a CLI/MCP idea into a leaner project-local Markdown system maintained by agent skills and instructions. The user then clarified lifecycle hooks, token-conscious behavior, and seven final operational defaults. An implementation plan was written with phases for templates, validation, hooks, agent instructions, MCP, and release verification.

## Next Action

Choose the execution mode for `docs/superpowers/plans/2026-08-12-hermes-skill-mcp-integration.md`, then execute its test-first tasks and verify in an isolated Hermes profile.

## Remaining Work

- [x] Verify current Codex plugin, hooks, env, and MCP config compatibility against official OpenAI docs.
- [x] Add hook output for uninitialized projects that instructs the agent to ask before initializing multi-step tracking.
- [x] Add per-project opt-in/opt-out/initialized state outside the project.
- [x] Add CLI/MCP surfaces to inspect and reset state.
- [x] Update the project-progress skill to enforce the ask-before-init workflow.
- [x] Add regression tests for initialized, uninitialized, opted-out, stale-stop, guard, manifest, MCP stdout, and packaging behavior.
- [x] Update README/troubleshooting documentation.
- [x] Run build, test, MCP, manual hook smoke, Codex sanity, and git status verification.
- [x] User reviews the finalized design spec.
- [x] Create implementation plan after spec approval.
- [x] Create reusable Markdown templates.
- [x] Build Python validation and lifecycle hook support.
- [x] Build the Codex skill.
- [x] Create Claude Code-compatible instructions.
- [x] Build MCP server over project-local Markdown files.
- [x] Run release verification.
- [x] Add npm/npx install and execution support.
- [x] Add per-agent bootstrap installer with Claude default and Codex selector.
- [x] Add status, uninstall, and MCP client configuration automation.
- [x] Add lightweight global project index for MCP queries.
- [x] Add MCP setup helper commands and verification.
- [x] Add manual and agent-led test instructions.
- [x] Commit and release the pre-edit reminder hook (`v0.2.3`).
- [x] Review and approve the Hermes Skill + MCP integration specification.
- [x] Approve the Hermes Skill + MCP integration specification and supersede the lifecycle-plugin release gate.
- [x] Write the Hermes Skill + MCP implementation plan.
- [ ] Implement Hermes CLI-backed install, status, doctor, and uninstall workflows with focused tests.
- [ ] Verify the packaged integration against an isolated Hermes profile.

## Done

- [x] Chose Obsidian/Markdown as the source of truth.
- [x] Removed standalone CLI from the first-version design.
- [x] Chose `project-progress/` as the standard repo-root folder.
- [x] Wrote the formal design spec.
- [x] Added lifecycle automation requirements for hooks and milestone updates.
- [x] Added token-conscious read/write and optional cache requirements.
- [x] Added final defaults for hook strictness, schema versioning, freshness, completion criteria, privacy, discovery, and failure expectations.
- [x] Wrote the implementation plan.
- [x] Completed Phase 1 templates and fixtures.
- [x] Completed Phase 2 Python validation and lifecycle hook support.
- [x] Completed Phase 3 agent skill and instruction pack.
- [x] Completed Phase 4 MCP server.
- [x] Added release documentation.
- [x] Completed final release verification.
- [x] Added npm/npx package entry points and verified packed CLI execution.
- [x] Added agent bootstrap installer and verified packed `npx install` behavior.
- [x] Added install lifecycle commands and MCP client configuration automation.
- [x] Added MCP project index and refresh support.
- [x] Added doctor, install verification, MCP-only install, and project-local MCP config.
- [x] Added `TESTING.md` and `agent-instructions/SELF-TEST.md`.
- [x] Added a `PreToolUse` pre-edit reminder hook (`handlePreEdit`) so agents check remaining work before changing files, even when the skill isn't explicitly invoked.

## Blockers

None. ADR 0015 supersedes the prior lifecycle-plugin release gate: supported Hermes compatibility begins with Skill + MCP; lifecycle hooks are deferred.

## Deployment

GitHub releases published: https://github.com/AndriiLavrekha/awesome-progress-tracker/releases/tag/v0.2.0, https://github.com/AndriiLavrekha/awesome-progress-tracker/releases/tag/v0.2.1, https://github.com/AndriiLavrekha/awesome-progress-tracker/releases/tag/v0.2.2, and https://github.com/AndriiLavrekha/awesome-progress-tracker/releases/tag/v0.2.3

## Completion Criteria

- Final design spec includes project-local Markdown structure.
- Final design spec includes lifecycle hook behavior.
- Final design spec includes token-conscious defaults.
- Final design spec includes schema, freshness, completion, privacy, discovery, and failure policies.
- Implementation plan covers templates, skill/instructions, hooks, validation, MCP, and release verification.
- Phase 1 templates and fixtures are reviewed.
- Phase 2 validation and hook support are reviewed.
- Phase 3 agent instructions are reviewed.
- Phase 4 MCP server receives final quality approval.
- User chooses execution mode and release verification passes.

## Resume Instructions

Open `C:/Users/nkinc/Documents/progress-tracker`, read this file first, then read `docs/superpowers/specs/2026-06-26-project-progress-design.md`.
