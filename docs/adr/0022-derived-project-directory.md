# ADR 0022: Derive a project's directory from its Progress.md location

## Status

Accepted.

## Context

`parseProjectSummary` took the project's directory from the frontmatter `path`
key. That key is written once by `init` and never reconciled afterwards, so it
records where the project was, not where it is.

The consequences showed up in this repository. Its `Progress.md` still claimed
`C:/Users/nkinc/Documents/progress-tracker` after the repository moved to
`D:/depot/awesome-progress-tracker`. Selecting the project by its real path
returned "project not found", because no indexed entry carried that path.
Selecting it by name returned an ambiguity error listing the same stale
directory twice, because a second checkout under the old location shared the
identical frontmatter value. Neither message named anything the caller could
act on, and every worktree of a project reported its main checkout's directory.

## Decision

Derive the directory from `progressPath` instead. Discovery only ever finds a
`Progress.md` at `<projectDir>/project-progress/Progress.md`, so the directory
is that path minus its last two segments, with separators normalized to forward
slashes. The frontmatter `path` remains a fallback for a summary parsed without
a known location on disk, which is the only case where nothing better exists.

The frontmatter key is not rewritten on read. A read path that repairs files it
touches would turn every listing into a write, and the derived value already
makes the stored one unnecessary for resolution.

The ambiguity message now lists each candidate's `progressPath` rather than its
directory. A worktree checkout puts a second `Progress.md` under one project,
so directories are not unique among candidates and printing them told the
caller nothing about how to choose.

## Consequences

Moving or cloning a project no longer breaks selection by path, and each
worktree reports its own directory rather than its main checkout's.

Existing index entries keep their stale `path` until the entry is rewritten by
a discovery refresh or a write to that project. `refresh_projects` re-derives
every entry it rediscovers and prunes entries whose `Progress.md` no longer
exists, so one refresh repairs an index accumulated under the old behavior.

The frontmatter `path` key is now informational. It is still written by `init`
and still read as a fallback, but nothing depends on it staying accurate.
