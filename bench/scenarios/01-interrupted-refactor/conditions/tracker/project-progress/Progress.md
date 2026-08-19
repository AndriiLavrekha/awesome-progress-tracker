---
project: Fold Demo
progress_schema_version: 1
status: active
path: /fixture
agent_last_used: claude
updated: 2026-08-19
last_milestone: implemented foldDoneSection
deployed: false
deployment_url:
sensitivity: normal
commit_progress: true
---

# Fold Demo

## Resume Snapshot

`foldDoneSection` is fully implemented and tested in `src/writer.ts`. It is not
yet called from `updateSection` in `src/server.ts`, so the fold never runs.

## Next Action

Wire foldDoneSection into updateSection in src/server.ts.

## Blockers

None.
