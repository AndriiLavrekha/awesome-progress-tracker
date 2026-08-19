# ADR 0019: Session handoff state and body-hash freshness

- **Status:** Accepted
- **Date:** 2026-08-19

## Context

`project-progress/Progress.md` recorded what the last session did, but nothing
recorded how it ended. A session that runs `handleStop`, updates the file, and
exits cleanly, and a session whose context dies mid-edit, left the same file
behind. The two demand opposite resume postures: after a clean handoff the
recorded `Next Action` is trustworthy on its face, but after an interruption
the working tree may hold half-finished edits that the prose never describes,
because there was never a chance to describe them. `SessionStart` had no way
to tell a resuming agent which situation it was walking into.

## Decision

`src/hook/schema.ts` adds two optional frontmatter keys, `session_id` and
`handoff` (`clean` | `interrupted`), to `OPTIONAL_FRONTMATTER`. Neither is
required, so existing `Progress.md` files stay valid without migration.

Interruption cannot be observed directly: a session that dies mid-task fires
no hook, so there is no event to catch it on the way out. The only workable
strategy is pessimism written on the way in. `handleSessionStart` calls
`bestEffortMarkHandoff` to stamp `handoff: interrupted` and the current
`session_id` before it returns control to the agent. If the session later
ends cleanly, `handleStop` calls `bestEffortRecordSessionEnd`, which flips
`handoff` back to `clean` and stamps the four ADR 0018 checkpoint fields in
the same write. A session that dies before `Stop` runs never clears the flag,
so the next `SessionStart` finds `interrupted` still set and reports it
alongside the previous `session_id`.

A stale `Stop` — meaningful work happened but `Progress.md`'s body is
unchanged — is deliberately left at `interrupted` rather than flipped to
`clean`. `bestEffortRecordSessionEnd` only runs when `checkFreshness` reports
the file fresh; the ADR 0017 fail-closed gate blocks only once per session, so
a second stale `Stop` in the same session means the agent did work it never
recorded and then talked its way past the warning. Recording `clean` in that
case would assert a verification that never happened, the same reasoning ADR
0018 already applied to the checkpoint fields. So a session leaves behind
either a clean handoff and a checkpoint together, or neither — there is no
state where one is stamped and the other is not.

## Consequences

Two mechanisms that predate this ADR had to change first, and both were
load-bearing rather than incidental.

First, freshness moved from comparing `Progress.md`'s file mtime against
session start to comparing a hash of its Markdown body (`bodyHash` in
`src/hash.ts`, consumed by the new `sessionBodyHash` option on
`checkFreshness`). `bestEffortRecordBodyHash` captures the hash at
`SessionStart`, before `bestEffortMarkHandoff` writes the `interrupted`
stamp; `Stop` compares against it instead of mtime whenever a hash was
recorded, and only falls back to the mtime comparison when it was not. This
was not a nice-to-have: `SessionStart` now writes frontmatter to
`Progress.md` on every session, which would have pushed the file's mtime past
session start every single time. Every freshness check would have reported
fresh, and the ADR 0017 fail-closed gate would have silently stopped firing —
with the existing suite still fully green, because nothing in it exercised a
`SessionStart` write landing before a `Stop` freshness check. Hashing the body
rather than the whole file also incidentally fixes a pre-existing false-fresh
case: any touch that reset mtime without changing content (a checkout, a
`touch`, a tool that rewrites a file byte-for-byte) used to satisfy the gate;
it no longer does.

Second, the meaningful-work predicate (`gitHasChanges` in
`src/hook/cc-adapter.ts`) stopped counting changes under `project-progress/`.
Both handoff writes and the ADR 0018 checkpoint stamp now touch
`Progress.md` on effectively every session, so without this exclusion the
tracker's own bookkeeping would make `git status --porcelain` non-empty on
every session — precisely the nagging-on-read-only-sessions failure mode ADR
0006 exists to prevent. The filter classifies each porcelain line with
`porcelainPathKey`, which strips git's `"..."` quoting and normalizes
separators but deliberately does not unescape git's octal byte-escaping for
non-ASCII paths; it returns a classification key good enough to test an ASCII
prefix against, not a path safe to open. `gitHasChanges` also switched to
`--untracked-files=all`, because without it git collapses a wholly-untracked
directory to a single `?? sub/` porcelain line, which would hide a nested
`project-progress/` inside another untracked directory and make the whole
directory look like tracker noise. Measured cost was negligible in the normal
case — no measurable difference (~39ms either way) in a repo whose build
output is gitignored, since gitignored trees are pruned regardless of the
flag — and only reached roughly +240ms in the pathological case of about
30,000 untracked, non-gitignored files.

Both the handoff write and the checkpoint write go through `writeFileAtomic`,
never a plain `fs.writeFile`, for the same reason ADR 0018 already required
it for the checkpoint stamp alone: a plain write racing a concurrent MCP
`update_project_progress` call could truncate the canonical resume file, and
`writeFileAtomic` throwing "Progress file changed on disk" is the correct,
swallowed outcome when that race is lost.

Stamping `handoff: interrupted` at every `SessionStart` adds roughly two
frontmatter lines to `Progress.md` on the first session that adopts this
schema, then only replaces existing values in place on every session after.
That per-session git noise under `project-progress/` is accepted
deliberately: the alternative, deferring the write until the first meaningful
edit, cannot distinguish a session that died before making any edit from one
that never started doing anything at all, which is exactly the ambiguity this
ADR exists to resolve.

The read-before-write ordering in `handleSessionStart` — read the file, hash
the body, then write the `interrupted` stamp — is guarded by three tests;
moving the stamp write before the body-hash read fails them, because the
recorded hash would then include the write's own frontmatter.
