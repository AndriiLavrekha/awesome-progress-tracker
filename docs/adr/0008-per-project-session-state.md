# ADR 0008: Track lifecycle state per initialized project touched in a session

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

A Hermes session can operate from a workspace root, change tool workdirs, or touch multiple repositories. Binding tracker behavior to session-start cwd or the first edited project would ignore real work and permit stale progress in a later repository.

## Decision

The Hermes plugin resolves the effective working directory of relevant tool calls to a project root and maintains lazy, independent session state for every initialized project it touches.

Each `ProjectSessionState` contains at minimum:

- normalized project root;
- Git/non-Git mode;
- session-start content-aware baseline when Git is available;
- structured-write fallback state;
- `Progress.md` freshness baseline/current state; and
- `meaningful_work` eligibility.

At `pre_verify`, the plugin returns a continuation action if any tracked initialized project has meaningful work and stale progress. The message lists the affected normalized project paths. The plugin tracks at most 10 projects per session; after the cap, it fails open with an explicit logged/user-visible warning rather than silently enforcing an incomplete set.

## Consequences

- The plugin must resolve Git roots and progress-file locations per effective tool cwd.
- Tests must include workspace-root and nested-project calls, multiple repositories in one session, uninitialized directories, path normalization on Windows, and project-cap behavior.
- Session cleanup removes all tracker-owned states for the session.
