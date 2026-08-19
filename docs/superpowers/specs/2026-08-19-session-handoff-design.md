# Session Handoff and Body-Hash Freshness Design

## Goal

Distinguish a session that ended deliberately from one whose context died
mid-task. The two demand opposite resume postures: after a clean handoff the
recorded `Next Action` is trustworthy, while after an interruption the working
tree may hold half-finished edits the prose never describes.

Nothing records this today. A resuming agent cannot tell the cases apart, so it
trusts prose that may have been written before the work that followed it.

## Scope

This design adds two optional frontmatter keys, `session_id` and `handoff`,
written by the SessionStart and Stop hooks; reports an unclean prior handoff in
resume context; and redefines the freshness check from file mtime to a hash of
the Markdown body.

The freshness change is not optional cleanup. It is required for correctness,
for reasons given below.

## Exclusions

No session table, log, or history of past sessions. Only the current and
immediately previous handoff state is retained. `Session Log.md` already holds
narrative history and git already holds the audit trail.

`base_commit` and `final_commit` pairs are excluded. Once checkpoint stamping
exists, the previous checkpoint's `base_commit` already marks where the next
session began; storing both invites the two to disagree.

## Design

### Frontmatter

```yaml
session_id: cc27106a-264d-4a30-af81-c989f856fb17
handoff: interrupted
```

`handoff` takes `clean` or `interrupted`, validated against that pair when
present. Both keys are optional, are registered in the `OPTIONAL_FRONTMATTER`
list introduced by the checkpoint design, and are not added to
`REQUIRED_FRONTMATTER`.

### Lifecycle

Interruption cannot be observed directly: when a context dies, no hook fires.
It can only be inferred from an expected write that never happened. So the
state is written pessimistically and cleared on success.

SessionStart reads the existing `handoff` value *before* overwriting it. If it
reads `interrupted`, it reports the prior session in the injected context:

```
Previous session cc27106a ended without a clean handoff. Progress.md
may predate uncommitted work in the tree.
```

It then writes `handoff: interrupted` and the current `session_id`.

The Stop hook flips `handoff` to `clean` when its gate passes, in the same
read-modify-write that stamps the checkpoint fields.

A session that dies leaves `interrupted` in place, which the next SessionStart
reports. A session that ends cleanly leaves `clean`.

A session that ends while still stale is deliberately left `interrupted`. This
is reachable: the ADR 0017 gate blocks only once per session, so a second Stop
with `Progress.md` still unchanged is allowed through. Such a session did
meaningful work and never recorded it, which is exactly the state the next
resume needs warning about, so it is treated as an interruption rather than a
clean handoff. The same condition suppresses checkpoint stamping, keeping the
two consistent: a session either records both a clean handoff and a checkpoint,
or neither.

### Freshness must stop depending on mtime

`checkFreshness` in `src/hook/freshness.ts` currently decides staleness by
comparing the file's mtime against session start. Once SessionStart writes
`handoff: interrupted` into the file, mtime always exceeds session start, so
every later freshness check reports fresh and the fail-closed Stop gate from
ADR 0017 silently stops firing.

Freshness is therefore redefined to hash the Markdown body:

- `bodyOf(markdown)` strips the leading frontmatter block and returns the rest;
- SessionStart records `sha256(bodyOf(markdown))` in the existing session-state
  file alongside `startedAt`;
- the Stop gate recomputes the hash and treats an unchanged body as stale.

Hook frontmatter writes become invisible to the gate by construction rather
than by careful coordination. The change also fixes a pre-existing false-fresh
case: today, any touch that resets mtime without changing content, such as a
formatter or a checkout, satisfies the gate.

When no hash was recorded, which happens if the temp session-state file was
cleaned up mid-session, the check falls back to the existing mtime comparison.
That preserves current behavior in the degraded case and keeps the gate
fail-closed rather than fail-open.

### The meaningful-work predicate must exclude progress files

`handleStop` currently proceeds only when `gitHasChanges(cwd)` reports a dirty
tree, which is how ADR 0006 avoids nagging read-only sessions. Once SessionStart
always writes `Progress.md`, the tree is always dirty, so the gate would fire
on every read-only session.

`gitHasChanges` must therefore filter `project-progress/` paths out of its
`git status --porcelain` output and report changes only from the rest of the
tree. This requirement is created by this design and ships with it.

## User Experience

Invisible when sessions end cleanly. After an interrupted session the next
resume opens with one extra line naming the dead session.

The visible cost is churn: every session now dirties `Progress.md` immediately,
so `git status` shows it modified even in sessions that changed nothing else.
This is accepted deliberately. The alternative, deferring the write until first
meaningful edit, cannot distinguish a session that died before its first edit
from one that never began, which is a real interruption case worth catching.

## Testing and Verification

Unit tests cover: SessionStart reports a prior `interrupted` value and then
overwrites it; SessionStart stays silent on a prior `clean` value; Stop flips
to `clean` only when its gate passes; body hashing ignores frontmatter-only
changes; freshness falls back to mtime when no hash was recorded; and
`gitHasChanges` ignores a tree dirty only under `project-progress/`.

A regression test asserts the ADR 0017 gate still blocks a stale Stop after
SessionStart has written frontmatter, which is the specific failure this design
introduces and must prove it closed.

Manual verification runs a session, kills it without a clean stop, restarts,
and confirms the interruption is reported.

## Decision

Store handoff in frontmatter rather than in the temp session-state file.
Machine-local state is lost exactly when it matters most: a fresh clone, a
different machine, or a different agent picking up the work. Durability and git
visibility are worth the churn.
