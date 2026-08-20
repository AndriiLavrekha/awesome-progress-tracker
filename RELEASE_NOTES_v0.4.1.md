# Awesome Progress Tracker v0.4.1

This release extends resumable project tracking with stronger checkpoint,
session, write-safety, and benchmark support across the Claude Code and Codex
plugins.

## Highlights

- Adds checkpoint validation, drift reporting, gate summaries, and Stop-hook
  checkpoint stamping.
- Adds session handoff state, body-hash freshness checks, and a
  progress-aware meaningful-work predicate.
- Adds content-hash write guards, mergeable conflict payloads, and serialized
  progress writes.
- Adds the resumability benchmark harness, including the runtime-exception
  fixture in `bench/scenarios/03-runtime-exception`.
- Resolves explicitly named `Progress.md` files outside
  `PROJECT_PROGRESS_ROOTS`, allowing fresh clones and temporary fixtures to
  use MCP updates safely.
- Keeps package, Claude plugin, Codex plugin, and Claude marketplace metadata
  on version `0.4.1`.

## Verification

- 306 Vitest tests passing
- TypeScript typecheck passing
- Production build passing
- Benchmark harness build passing
- `npm pack --dry-run --ignore-scripts` passing

Hermes-specific verification is deferred and is not part of this release
note's supported validation scope.
