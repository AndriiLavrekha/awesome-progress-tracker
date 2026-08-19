---
name: project-progress
description: Maintain project-local Markdown progress state in project-progress/ for multi-step work, resumability, lifecycle checkpoints, and token-conscious agent handoff.
---

# Project Progress

Use this skill for multi-step features, investigations, refactors, project setup, debugging, deployment, and release work. The goal is to preserve enough project state for a future agent or human to resume without rereading chat history.

## Source Of Truth

Treat `project-progress/` as the canonical source of truth for project progress. Dashboards, hooks, MCP tools, and global notes may summarize or point to these files, but they must not replace them.

Read `project-progress/Progress.md` first. Start with the frontmatter and `Resume Snapshot`, then load more sections only as needed.

## Kickoff

1. Check whether `project-progress/Progress.md` exists.
2. If it exists, read the frontmatter and `Resume Snapshot` before changing project files.
3. If it is missing and the work is a multi-step feature, investigation, refactor, project setup, debugging session, deployment, or release, ask the user before initializing: `This project is not initialized with Awesome Progress Tracker. Do you want me to create project-progress/ here?`
4. Only initialize from the templates after the user says yes. Use `awesome-progress-tracker init . --project "<project name>"` or `project-progress init . --project "<project name>"` when the CLI is available.
5. If the user says no, record the per-project opt-out outside the project with `awesome-progress-tracker state set . --state opted-out` or `project-progress state set . --state opted-out`. Continue without creating progress files and do not ask again unless the user explicitly invokes this skill or changes the state.
6. If kickoff changes the project state, update the progress files immediately.

For a trivial one-off or read-only command, do not initialize progress files unless the user asks.

Codex lifecycle hooks may inject initialization guidance, but hooks cannot force an interactive prompt and must not create files. The agent performs the user-facing ask and initialization.

A `PreToolUse` hook on `Edit`/`Write` fires once per session (skipped for edits inside `project-progress/` itself) to remind the agent to check `Tasks.md` and `Open Questions.md` before changing project files, covering casual "add a feature"/"do a pass" requests that don't explicitly invoke this skill.

## Mandatory Checkpoints

Update the relevant progress files at these meaningful work checkpoints:

- kickoff when state changes
- major decision
- milestone complete
- blocker found
- scope changed
- verification complete
- session ending

Meaningful work includes code changes, documentation changes, configuration changes, tests or verification, design decisions, implementation planning, deployment work, discovering blockers, and changing scope.

## Token-Conscious Reads

Use this default read order:

1. `project-progress/Progress.md` frontmatter and `Resume Snapshot`
2. `Next Action`, `Blockers`, and `Remaining Work`
3. `Tasks.md` only if needed
4. `Decisions.md` only if needed
5. `Open Questions.md` only if needed
6. latest `Session Log.md` entry only if needed

Do not read every progress file or the full project history by default. Load the smallest set of sections that can answer the current question or unblock the next action.

## Required Fields

Every `project-progress/Progress.md` must include:

```yaml
progress_schema_version: 1
sensitivity: normal
commit_progress: true
```

Allowed `sensitivity` values are `normal`, `private`, and `sensitive`. `commit_progress` must be a boolean.

If `sensitivity: private`, progress files may be updated and committed, but avoid personal, customer, business, proprietary, or identifying details that are not needed to resume work.

Never write secrets to progress files. This includes API keys, passwords, tokens, private certificates, seed phrases, production credentials, and other confidential material.

If `sensitivity: sensitive` or `commit_progress: false`, update local progress files when needed but avoid staging or committing them unless the user explicitly instructs you to do so.

## What To Update

- `Progress.md`: current state, `Resume Snapshot`, next action, blockers, deployment state, and `Completion Criteria` status. `Resume Snapshot` and `Last Session` are replaced wholesale on every update — never prepend or append prior text onto them. If old narrative is worth keeping, put it in a dated `Session Log.md` entry instead of accumulating it in these two fields.
- `Tasks.md`: active, remaining, and completed tasks.
- `Decisions.md`: durable decisions with a short reason.
- `Open Questions.md`: unresolved questions that need user input, research, access, credentials, or a later decision.
- `Session Log.md`: dated summary of what changed, what was verified, and where to resume.

Keep entries compact. Prefer links to files over pasted logs or long code blocks.

When `Done` grows large, the `update_project_progress` MCP tool automatically folds the oldest completed items out of `Progress.md` into `Archive.md`, keeping the most recent items in place. `Archive.md` is not part of the default token-conscious read order; read it only when explicitly asked about older completed work.

Set verification gates with `set_project_gates` whenever you learn something
about the project's state: after running the test suite, after a review, after
a deploy. Gates are how a resuming session learns that implementation was
finished but tests were failing, which prose reliably loses.

If resume context reports checkpoint drift, verify the recorded Next Action
against the listed changed files before acting on it.

If resume context reports that the previous session ended without a clean
handoff, inspect the working tree before trusting Next Action: that session did
work it never wrote down.

## Completion Rules

Only mark `done` when remaining work is empty, verification is recorded, blockers are none, and `Completion Criteria` is satisfied.

Only mark `deployed` when `done` is satisfied and deployment status or URL is recorded.

Only mark `paused` when work is intentionally stopped before completion and the resume trigger or reason is recorded.

Only mark `blocked` when a specific blocker prevents the next action and the blocker is recorded.

Only mark `archived` when there is no active plan to resume and the reason is recorded.
