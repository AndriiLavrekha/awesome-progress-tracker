# Concurrent Write Hardening Design

## Goal

Make a conflicting write to `Progress.md` both reliably detected and cheaply
recoverable. Two agents working the same repository, or one agent and a human
editor, must not silently overwrite each other's notion of the next action.

## Scope

This design replaces the mtime comparison in `writeFileAtomic` with a
full-content hash comparison, and turns the resulting failure from an opaque
thrown string into a structured result carrying the current content of the
section the caller tried to write.

It applies to both MCP write paths, `update_project_progress` and
`mark_project_status`.

## Exclusions

No leases, no ownership, no workstream assignment. A lease is a distributed
lock over a text file: it needs a TTL, renewal, and a steal path, and it fails
badly when the holder dies still holding it. The problem here is detection and
recovery, and optimistic concurrency solves both without a stale-lock mode.

No automatic merging of writes to different sections. Applying both writes
because they touched different headings assumes the sections are independent,
and `Next Action` and `Remaining Work` routinely are not. A conflict the agent
resolves is safer than a merge the tracker guesses at.

## Design

Detection already exists in part. `writeFileAtomic` in `src/mcp/writer.ts`
compares `stat().mtimeMs` against the value captured before the read and throws
`"Progress file changed on disk; reread it before writing."` on mismatch. Two
gaps remain.

First, mtime resolution is coarse. It is one second on some network and FAT
mounts, and Node reports whole-millisecond values elsewhere. Two writes inside
the same tick compare equal, and the second silently wins. The signature
becomes:

```ts
writeFileAtomic(filePath: string, content: string, expectedHash: string)
```

where `expectedHash` is `sha256` of the full file content as read. Content
hashing has no resolution window. It also correctly permits a rewrite that
produces identical bytes, which the mtime check rejects as a spurious conflict.

Second, the error carries nothing actionable. The agent knows only that it
lost; recovering costs a re-read of the whole file. `writeFileAtomic` now
throws a typed `ProgressConflictError`. The server catches it, re-reads the
file, extracts the section the caller was writing, and returns:

```json
{
  "error": "conflict",
  "section": "Next Action",
  "currentContent": "...",
  "hint": "merge your content with currentContent and retry"
}
```

The agent merges from the payload and retries, without a round trip. The
existing temp-file-plus-rename write remains unchanged; only the guard in front
of it changes.

Hashing is shared with the freshness change: both use one `sha256` helper, and
the body-hash variant is the same function applied to the frontmatter-stripped
body.

## User Experience

Invisible in single-agent use, which is every session that does not conflict.
When a conflict does occur, the agent sees the current content instead of a
bare instruction to start over.

## Testing and Verification

Unit tests cover: a write succeeds when content is unchanged; a write is
rejected when another writer modified the file between read and write; a
rewrite producing identical bytes is permitted where the old mtime check would
have failed it; the conflict result carries the requested section's current
content; and `mark_project_status` returns the same structured conflict.

A concurrency test drives two interleaved writes through the real code path and
asserts exactly one succeeds and the loser receives current content.

## Decision

Harden the existing optimistic-concurrency check rather than adding a locking
layer. The mechanism is already correct in shape; it needs a sound comparison
basis and a useful failure payload.
