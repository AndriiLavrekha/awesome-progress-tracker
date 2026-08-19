# ADR 0020: Content-hash write guard and mergeable conflicts

## Status

Accepted. Refines the optimistic-concurrency check already present in
`writeFileAtomic`.

## Context

`writeFileAtomic` compared `stat().mtimeMs` against the value captured before
the read and threw a bare string on mismatch. Two gaps remained.

mtime resolution is coarse: one second on some network and FAT mounts, and
whole milliseconds elsewhere. Two writes inside the same tick compared equal
and the second silently won, which is exactly the overwrite the guard exists to
prevent.

The error also carried nothing actionable. A caller knew only that it had lost,
and recovering cost a full re-read.

## Decision

Compare a SHA-256 of the file's full content instead of its mtime, and throw a
typed `ProgressConflictError`. Every MCP write path catches it, re-reads the
file, and returns a structured payload: the current content of the section the
caller tried to write, or the current values of the frontmatter keys it tried
to set.

Writes to one path are also serialized within the process. The hash compare and
the rename are separated by awaits, so two concurrent callers holding the same
expected hash both passed the compare and the second clobbered the first — the
hash closed the resolution window but not the check-then-act window. A promise
chain keyed by the resolved path makes read-compare-rename atomic per path, so
the loser re-reads the winner's content and raises the conflict.

That queue is not a lease: it has no TTL, no renewal, and no steal path, and it
cannot outlive the process holding it. Leases over the file itself were
rejected — a lease needs all three, and fails badly when the holder dies still
holding it. The problem is detection and recovery, and optimistic concurrency
solves both without a stale-lock mode.

Automatic merging of writes to different sections was also rejected. It assumes
sections are independent, and `Next Action` and `Remaining Work` routinely are
not.

## Consequences

Content hashing correctly permits a rewrite that produces identical bytes,
which the mtime check rejected as a spurious conflict.

Each write now costs one extra file read. `Progress.md` is a small document
bounded by the ADR 0016 fold, so this is not material.

Writers in other processes remain ordered only by the compare. Their race is
narrowed to the rename itself rather than closed; a cross-process guarantee
would need an on-disk lock, with the stale-lock mode this ADR rejects.

The archive append in `update_project_progress` moved after the guarded write.
Archiving before knowing the write would land could have moved `Done` entries
into `Archive.md` that were never removed from `Progress.md`.

`conflictResult` deliberately does not route through `textResult`. That helper
collapses any payload carrying a string `error` into
`errorResult("invalid_request", ...)`, which would discard `currentContent` and
`currentFrontmatter` — the entire reason the payload exists. The MCP result is
built directly so the merge data survives, with `isError` still set.
