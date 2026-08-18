# ADR 0017: Fail-closed Stop gate, capped once per session

- **Status:** Accepted
- **Date:** 2026-08-18

## Context

The `Stop` hook (`handleStop` in `src/hook/cc-adapter.ts`) only ever printed
an advisory `systemMessage` when meaningful work happened but
`project-progress/Progress.md` stayed stale. Nothing stopped an agent from
ignoring it and ending the session anyway, so real sessions produced no
resumable record — the exact failure the tracker exists to prevent.

A `shouldBlock` path already existed in `freshness.ts`, but it was only wired
into an unused standalone CLI (`src/hook/cli.ts`), never into the actual
`hooks.json`/`hooks-codex.json` `Stop` entries. `handleStop` duplicated a
simpler version of the same staleness check inline instead of reusing it.

Claude Code's documented mechanism to block its `Stop` event is exit code 2
with the message on stderr, which Claude Code feeds back to the agent and
continues the conversation instead of ending the turn. Codex's exit-code-2
semantics for its equivalent hook are not documented anywhere we could
confirm, so treating both adapters identically risked either breaking Codex
sessions (if exit 2 is fatal there) or silently doing nothing.

## Decision

1. `handleStop` now calls `checkFreshness` (reusing the existing
   `freshness.ts` logic) instead of duplicating a staleness check.
2. On Claude Code (`hooks.json`, subcommand `stop`), the first stale Stop in a
   session returns `{ code: 2, stderr: "..." }`, blocking the stop. A
   `stopBlocked` flag in the existing per-session state file caps this to once
   per session — a second stale Stop in the same session falls back to the
   original soft `systemMessage` warning, so a session that genuinely can't
   update `Progress.md` never loops forever.
3. Codex (`hooks-codex.json`) is switched to a new `stop-soft` subcommand,
   which calls the same `handleStop` with `{ allowBlock: false }` and always
   uses the soft-warning path. It is only promoted to the hard-blocking `stop`
   subcommand once Codex's exit-code-2 behavior for its Stop-equivalent hook
   is manually verified.

## Consequences

- Claude Code sessions that do meaningful work without updating
  `Resume Snapshot`/`Next Action`/`Blockers` are forced to address it once
  before the agent can end its turn, closing the silent-context-loss gap.
- Codex behavior is unchanged (soft warning only) until its hook semantics are
  confirmed — same "verify per-agent before enabling" precedent as ADR 0002
  and ADR 0015.
- Tests must cover: first stale Stop blocks; second stale Stop in the same
  session falls back to warning; `allowBlock: false` never blocks; secret-like
  content warnings still surface in whichever channel (stderr or stdout) is
  active for that call.
