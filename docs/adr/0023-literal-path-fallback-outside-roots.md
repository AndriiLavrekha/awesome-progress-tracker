# ADR 0023: Resolve an exact Progress.md path even outside PROJECT_PROGRESS_ROOTS

## Status

Accepted.

## Context

`resolveProject` only ever looked in two places: the cached index, and a fresh
scan of `PROJECT_PROGRESS_ROOTS`. Both are populated by root scanning, and
root scanning is deliberately opt-in — an unconfigured server must not silently
read the launch cwd (see the existing test "does not scan the launch cwd when
PROJECT_PROGRESS_ROOTS is unset or blank").

That guarantee had a cost nothing was paying attention to. A fresh clone, a
benchmark fixture, or any checkout living outside the configured roots was
invisible to `update_project_progress` and `read_project_progress`, even when
the caller passed its exact path. Bench suite 305's tracker run hit this
directly: its fixture sits in a temp directory, `resolveProject` returned
"project not found" for both the directory and the literal `Progress.md`
path, and `refresh_projects` did not help because it only re-scans the same
roots. The agent burned four tool calls discovering this, then fell back to
editing the file directly — a usability defect in the shipped server, not in
the benchmark.

## Decision

Add one more fallback, tried only after the index and root scan both come up
empty: treat the selector itself as a filesystem path. Try it as a
`Progress.md` file directly, as a `project-progress` directory, and as a
project directory containing `project-progress/Progress.md`. If any of those
exists, parse it and use it — no different from what discovery would have
produced had the path been under a configured root.

This does not weaken the opt-in guarantee. Root scanning still never touches
anything the caller didn't configure. This fallback only ever reads the exact
path the caller supplied in the tool call; it can't surface a project the
caller didn't already name. The resolved project is written into the index
via `upsertIndexedProject` so later calls in the same session — and
`list_projects` — see it without re-resolving from disk each time.

## Consequences

`update_project_progress` and `read_project_progress` now work against any
checkout the caller can name a path to, configured root or not. This is what
the ambiguity error already told callers to do ("Pass an exact path
instead"); it just didn't work for paths outside the roots before now.

`refresh_projects` and `list_projects` are unaffected — they still only ever
see configured roots plus whatever `resolveProject` has upserted into the
index from a prior literal-path call.
