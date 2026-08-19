---
project: progress-tracker
progress_schema_version: 1
status: in_progress
path: C:/Users/nkinc/Documents/progress-tracker
agent_last_used: claude
updated: 2026-08-19
last_milestone: Plans A-D merged to main and pushed to origin
deployed: true
deployment_url: https://github.com/AndriiLavrekha/awesome-progress-tracker/releases/tag/v0.2.3
sensitivity: normal
commit_progress: true
---

# Progress Tracker

## Resume Snapshot

Plans A through D are merged to `main` and pushed to origin (`e7d3f98..870d10b`, 50 commits). `feat/resume-hardening` is also pushed and now tracks origin. Verified on `main` after the merge: 287 tests across 20 files, typecheck, build, and bench:build all green.

What shipped: checkpoint validation and gates (plan A), session handoff with body-hash freshness and a progress-aware work predicate (plan B), a content-hash write guard with mergeable conflict payloads and per-path write serialization (plan C), and the resumability benchmark harness under `bench/` (plan D). Plus a fix for stale project-path resolution (ADR 0022). ADRs 0015 through 0022 are all on main.

Still UNRELEASED: no tag has been cut. `dist/src` is committed and current.

The benchmark has never been run. `bench/RESULTS.md` carries methodology and an empty results table by design.

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

Plans A and B both complete on `feat/resume-hardening`: 15/27 tasks, 31 commits, suite 131 to 241 passing.

Plan B shipped session handoff: `session_id` and `handoff` written pessimistically at SessionStart and cleared at Stop, so a session that dies leaves `interrupted` for the next session to report. Two mechanisms had to change first or the feature would have broken them silently. Freshness moved from file mtime to a hash of the Markdown body (`src/hash.ts`), because SessionStart writing frontmatter every session would otherwise push mtime past session start and disable the ADR 0017 fail-closed gate with every test still green. And the meaningful-work predicate stopped counting `project-progress/` paths, or the tracker's own writes would nag every read-only session. ADR 0019 records both.

Review continued to earn its cost. It found the ADR 0016 comment overclaiming CRLF equivalence for frontmatter-less documents; a freshness fallback test that would have passed even with the fallback deleted; a `shouldBlock` assertion that never proved the value was parameterized; and `porcelainPath` corrupting octal-escaped filenames, now renamed `porcelainPathKey` with its contract stated.

Bug injection is now standard practice for any test claiming to guard an invariant. It caught two inert guards in plan A and confirmed three real ones in plan B: moving the SessionStart write before the file read fails exactly the three handoff-reporting tests, which is what proves the read-before-write ordering is pinned.

## Next Action

Two things, in either order.

1. Run the benchmark and fill in `bench/RESULTS.md`. `npm run bench -- setup 01-interrupted-refactor --condition baseline`, then the same with `--condition tracker`; drive an agent in each printed directory with the printed prompt, save a normalized JSONL transcript per run, score both, paste the numbers. This needs an agent with NO knowledge of the fixture or of `expected.json` — an agent that helped build the harness cannot produce an honest number for it. Per the fixture-honesty rule, if both conditions score the same, the scenario is not measuring resumption and gets rewritten rather than reported.

2. Cut a release. Everything on main since `e7d3f98` is unreleased; `RELEASE_CHECKLIST.md` has the steps.

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
- [x] Implement plan B: session handoff and body-hash freshness (ADR 0019).
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
- [x] Shipped plan B: body-hash freshness with mtime fallback, progress-aware meaningful-work predicate, and pessimistic handoff state (ADR 0019).
- [x] Made the Stop hook fail-closed on Claude Code (exit 2, once per session via `stopBlocked`), kept Codex on soft-only `stop-soft` until verified (ADR 0017).

## Blockers

None.

Two notes on state outside this repository. The global index at `~/.awesome-progress-tracker/projects.json` was refreshed: 51 entries down to 9, pruning the dead worktree entry that made `progress-tracker` ambiguous along with 41 other entries whose `Progress.md` no longer existed. This repository still will not appear in that index until `PROJECT_PROGRESS_ROOTS` includes `D:/depot`; that is configuration, not a defect.

`docs/adr/0001` through `0014`, `docs/demo-use-cases.md`, `docs/glossary.md`, `misc/`, and `.hermes/` remain untracked. They predate this work and were left alone rather than swept into the merge.

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
