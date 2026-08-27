# Prompt-Time Project Initialization Guidance

## Goal

Ensure uninitialized projects receive the existing opt-in initialization guidance when a user submits a prompt after session startup in both Codex and Claude Code.

## Design

Add a `UserPromptSubmit` hook entry to each runtime manifest. The entry invokes a new adapter subcommand that checks the current working directory and emits the same guidance currently produced by `SessionStart` when `project-progress/Progress.md` is absent and the project is not opted out. It remains silent for initialized or opted-out projects. The hook does not inspect or classify the prompt; the existing agent instructions decide whether the request is meaningful work and ask for consent.

The adapter will share the guidance-building logic with `SessionStart` to keep wording and consent rules identical. The event-specific output will identify itself as `UserPromptSubmit`, which both runtimes inject as additional context before processing the prompt. No hook creates project files.

## Verification

Add adapter tests for prompt-time guidance, initialized silence, and opted-out silence. Update manifest tests to require the new event and subcommand. Run focused tests, the complete Vitest suite, typecheck, build, package dry-run, and a manual adapter probe.
