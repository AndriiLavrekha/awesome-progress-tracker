---
project: Config Migration
progress_schema_version: 1
status: blocked
path: /fixture
agent_last_used: claude
updated: 2026-08-19
last_milestone: migrated report, export, and sync to parseConfigV2
deployed: false
deployment_url:
sensitivity: normal
commit_progress: true
---

# Config Migration

## Resume Snapshot

Three of five handlers now call `parseConfigV2`: report, export, and sync.

The remaining two, `src/handlers/legacy.ts` and `src/handlers/import.ts`, are
deliberate exceptions and must stay on `parseConfig`. Both are fed customer
configs that still carry `legacy_timeout`, and `parseConfigV2` silently drops
unknown keys rather than failing on them, so migrating those two would compile,
pass, and quietly change the timeout to the default. Nothing in the code says
this. It is only recorded here.

## Next Action

Add a deprecation warning to `parseConfig` in `src/config.ts`, naming the two
handlers that are allowed to keep using it, and record the on-hold migration as
a dated entry in `docs/decisions.md`.

Do not migrate the remaining two call sites.

## Blockers

The migration cannot finish until the customer contract that still sends
`legacy_timeout` is renegotiated. That decision sits with the account team and
has no date.
