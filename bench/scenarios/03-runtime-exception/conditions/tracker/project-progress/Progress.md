---
project: Webhook Migration
progress_schema_version: 1
status: blocked
path: /fixture
agent_last_used: claude
updated: 2026-08-20
last_milestone: migrated modern webhook payloads to serializeV2
deployed: false
deployment_url:
sensitivity: normal
commit_progress: true
---

# Webhook Migration

## Resume Snapshot

The modern webhook handlers now use `serializeV2`. The legacy webhook still
uses `serializeV1` deliberately: a partner sends `x-legacy-signature` only at
runtime, and `serializeV2` drops that signature from the wire payload. The
TypeScript request type does not encode the header, so the exception is
invisible to the type checker and ordinary unit tests.

## Next Action

Record the compatibility exception and the blocked migration in
`docs/decisions.md`. Add a runtime-fixture test only if the decision needs
executable coverage.

Do not migrate `src/webhooks/legacy.ts` until the partner contract changes.

## Blockers

The partner contract still requires the legacy signature. The account team
owns that change and has not supplied a date.
