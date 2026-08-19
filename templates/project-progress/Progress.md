---
project: Example Project
progress_schema_version: 1
status: active
path: C:/path/to/project
agent_last_used: unknown
updated: 2026-06-26
last_milestone: initialized project progress
deployed: false
deployment_url:
sensitivity: normal
commit_progress: true
---

# Example Project

## Resume Snapshot

This project uses `project-progress/` as the canonical source of progress state. Replace this paragraph with a 150-300 word summary containing current status, next action, active blocker if any, and the one or two files or notes most likely needed next.

## Current State

Project progress tracking has been initialized.

## Last Session

Project progress tracking was initialized.

## Next Action

Replace this sentence with the single best next action.

## Remaining Work

- [ ] Define the next project task.

## Done

- [x] Initialized project progress tracking.

## Blockers

None.

## Deployment

Not deployed.

## Completion Criteria

- Required progress files exist.
- Resume snapshot is concise and current.
- Remaining work and blockers are accurate.

## Verification

Gates are set with the `set_project_gates` tool, not edited by hand. Each of
`implementation`, `tests`, `review`, and `deploy` takes one of `not-started`,
`in-progress`, `done`, `failing`, or `blocked`. An unset gate means unknown.

Checkpoint fields (`base_commit`, `base_branch`, `worktree_dirty`,
`checkpoint_at`) are stamped automatically when a session ends with this file
updated. Do not edit them by hand.

## Resume Instructions

Open this repository, read `project-progress/Progress.md`, then follow `Next Action`.
