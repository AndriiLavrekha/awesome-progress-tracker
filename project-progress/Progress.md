---
project: progress-tracker
progress_schema_version: 1
status: in_progress
path: C:/Users/nkinc/Documents/progress-tracker
agent_last_used: claude
updated: 2026-08-19
last_milestone: Plan A complete: checkpoint validation and verification gates shipped on feat/resume-hardening
deployed: true
deployment_url: https://github.com/AndriiLavrekha/awesome-progress-tracker/releases/tag/v0.2.3
sensitivity: normal
commit_progress: true
---

# Progress Tracker

## Resume Snapshot

Fixed two token/context-loss gaps in the tracker itself (dogfooded on this repo's own `project-progress/`), both unreleased on `main` (not yet tagged).

1. **Progress.md unbounded growth (ADR 0016).** `update_project_progress`'s `Done` section now auto-folds: when submitted content exceeds `FOLD_THRESHOLD` (2800 chars), the oldest lines move into a new `Archive.md` (new template file, auto-copied by `init`) and only the newest lines stay in `Progress.md`. `foldDoneSection`/`appendToArchive` added to `src/mcp/writer.ts`, wired into `update_project_progress` in `src/mcp/server.ts` (response now reports `archived: N`). SKILL.md now states `Resume Snapshot`/`Last Session` are replace-wholesale fields, not append targets — old narrative belongs in dated `Session Log.md` entries.
2. **Stop hook never enforced staleness (ADR 0017).** `handleStop` previously always returned `code: 0` (advisory-only), so a session could do real work and end without ever updating `Progress.md`. `handleStop` now reuses `checkFreshness` and, on Claude Code, hard-blocks the first stale Stop via `code: 2` + stderr (Claude Code's documented Stop-block mechanism), capped to once per session via a new `stopBlocked` session-state flag so it can't loop forever. Codex is kept on a new `stop-soft` subcommand (`{ allowBlock: false }`, same soft `systemMessage` as before) until Codex's exit-code-2 semantics for its Stop-equivalent hook are manually verified — same gate pattern as ADR 0002/0015.

Verification: full suite 123/123 passing, typecheck clean, build clean. Manual smoke: real `init` creates `Archive.md`; a scripted fold run moved 20/200 synthetic Done items into `Archive.md` correctly.

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

Executed plan A (checkpoint validation and verification gates) end to end via subagent-driven development: a fresh implementer per task, then spec-compliance review, then code-quality review, with fix rounds until each cleared. 8/8 tasks done, 19 commits, suite 131 to 197 passing.

Shipped: eight optional frontmatter keys (`base_commit`, `base_branch`, `worktree_dirty`, `checkpoint_at`, four `gate_*`), `src/hook/checkpoint.ts` (git reading + drift resolution), `src/hook/checkpoint-render.ts` (self-bounding rendering), Stop-hook stamping through `writeFileAtomic`, SessionStart drift reporting, and the `set_project_gates` MCP tool. ADR 0018 records it.

Review caught six defects that spec compliance did not, all in the plan rather than the implementations: `Date.parse` accepting non-ISO input while the error claimed ISO 8601; `merge-base --is-ancestor` failures on shallow clones being reported as a confident zero-count divergence; a `git reset --hard` backwards reported as two-way divergence; rendered drift exceeding its 400-char budget so end-truncation dropped the actionable closing line while keeping file names; unbounded branch-name interpolation reintroducing that overflow at 300 chars; and the Stop hook writing the canonical resume file with a plain `fs.writeFile`, risking both a lost update against concurrent MCP writes and a truncated file.

`DriftStatus` consequently has six variants, not four. Rendering bounds itself rather than being externally truncated. Drift is injected before the Resume Snapshot so an agent learns its state may be stale before absorbing it.

## Next Action

Continue subagent-driven execution of plan B, `docs/superpowers/plans/2026-08-19-session-handoff.md`, starting from Task 1 (`src/hash.ts` body hashing). Then plan C (concurrency hardening) and plan D (benchmark). Plan B Task 4 is load-bearing: SessionStart writing frontmatter makes `gitHasChanges` always true, so it must stop counting `project-progress/` paths or every read-only session gets nagged.

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
- [x] Implement Hermes CLI-backed install, status, doctor, and uninstall workflows with focused tests.
- [x] Resolve final-review findings for PowerShell verification, Hermes-specific CLI copy, and profile-only MCP scope.
- [x] Re-run packaged integration verification against an isolated Hermes profile after the final-review fixes.
- [x] Complete final quality review.
- [x] Integrate the reviewed Hermes branch into `main`.
- [ ] Decide Hermes release/versioning and publish the next release.
- [ ] Manually verify Codex Stop-hook exit-code-2 behavior, then promote `hooks-codex.json` from `stop-soft` to `stop`.
- [ ] Commit and release ADR 0016 (fold/archive) and ADR 0017 (fail-closed Stop gate).
- [x] Brainstorm the resume-hardening roadmap and write four design specs.
- [x] Write four task-by-task implementation plans from those specs.
- [x] Implement plan A: checkpoint validation and verification gates (ADR 0018).
- [ ] Implement plan B: session handoff and body-hash freshness (ADR 0019).
- [ ] Implement plan C: content-hash write guard and mergeable conflicts (ADR 0020).
- [ ] Implement plan D: resumability benchmark harness and first fixture (ADR 0021).
- [ ] Document git + `Session Log.md` as the existing checkpoint-history answer in README (rejects a separate journal).
- [ ] Fix the stale `path:` frontmatter value — it points at `C:/Users/nkinc/Documents/progress-tracker` but this repo is checked out at `D:/depot/awesome-progress-tracker`.

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
- [x] Added Hermes CLI-backed Skill + MCP install, status, doctor, and uninstall support.
- [x] Added tested POSIX and PowerShell disposable Hermes verification recipes.
- [x] Added Hermes-specific CLI output and rejected unsupported project-local Hermes MCP semantics.
- [x] Added `Done`-section auto-fold to `Archive.md` in `update_project_progress`, capped at `FOLD_THRESHOLD` (ADR 0016).
- [x] Clarified in SKILL.md that `Resume Snapshot`/`Last Session` are replace-wholesale fields, not append targets.
- [x] Wrote four resume-hardening specs and four implementation plans on `feat/resume-hardening`.
- [x] Shipped plan A: optional checkpoint/gate frontmatter, drift resolution and rendering, Stop-hook stamping, SessionStart drift injection, and `set_project_gates` (ADR 0018).
- [x] Made the Stop hook fail-closed on Claude Code (exit 2, once per session via `stopBlocked`), kept Codex on soft-only `stop-soft` until verified (ADR 0017).

## Blockers

None. Plan A is shipped on `feat/resume-hardening`; plans B, C, and D remain. One consequence is deliberately deferred to plan B Task 4: stamping leaves `Progress.md` dirty and the meaningful-work predicate still counts `project-progress/` paths. The pending ADR 0016/0017 release on `main` is independent and still unreleased. ADR 0015 defines Hermes compatibility as Skill + MCP with lifecycle hooks deferred.

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
- Hermes final-review fixes pass focused tests, the full test suite, and typecheck.
- Packaged Hermes verification passes in an isolated `HERMES_HOME`.

## Resume Instructions

Open `C:/Users/nkinc/Documents/progress-tracker`, read this file first, then read `docs/superpowers/specs/2026-06-26-project-progress-design.md`.
