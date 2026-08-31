# ADR 0007: Detect terminal-originated changes through a content-aware Git baseline

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

The meaningful-work predicate must catch project changes made through `terminal` without treating every terminal command as a write or relying on brittle shell-command parsing. A plain `git status --porcelain` snapshot is insufficient: a file already marked modified can change again while retaining the same porcelain status.

## Decision

For initialized Git projects, the Hermes plugin captures a content-aware working-tree baseline at session start and compares it at `pre_verify`. A new or changed content delta outside `project-progress/` establishes meaningful work, including changes created through terminal commands.

For initialized non-Git projects, the plugin falls back to successful structured file-write/edit tool events outside `project-progress/`.

The implementation must not parse terminal command text to infer writes. Changes confined to `project-progress/` do not establish meaningful work. Updating `Progress.md` later satisfies the freshness condition but does not erase the recorded fact that meaningful work occurred.

## Consequences

- The plugin needs a bounded Git snapshot representation that distinguishes content changes even when initial porcelain states are identical.
- Tests must include: terminal edits, structured edits, pre-existing dirty files edited again, untracked files, progress-only edits, and non-Git fallback behavior.
- If Git inspection fails after session start, the plugin must degrade safely to structured-write tracking rather than block verification based on unknown state.
