# Awesome Progress Tracker v0.4.2

This release fixes project initialization guidance for prompts submitted after
Codex or Claude Code startup.

## Highlights

- Adds `UserPromptSubmit` lifecycle wiring to the Codex and Claude plugins.
- Reuses the existing consent-based initialization guidance for uninitialized projects.
- Keeps initialized and opted-out projects silent.
- Updates package, Codex plugin, Claude plugin, and marketplace metadata to
  `0.4.2`.

## Verification

- Focused plugin tests passing
- Full Vitest suite passing
- TypeScript typecheck passing
- Production build passing
- Benchmark harness build passing
- Package dry-run passing
