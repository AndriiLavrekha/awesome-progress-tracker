# Prompt-Time Project Initialization Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trigger opt-in project initialization guidance at prompt time in Codex and Claude Code, then publish the fix as v0.4.2.

**Architecture:** Reuse one adapter helper for the existing `SessionStart` guidance and the new `UserPromptSubmit` event. Add manifest entries for both runtimes and keep initialization agent-mediated and consent-based.

**Tech Stack:** TypeScript, Node.js ESM, Vitest, JSON hook manifests, npm, GitHub releases.

## Global Constraints

- Never create or overwrite `project-progress/` from a hook.
- Stay silent for initialized and opted-out projects.
- Preserve the exact user-consent workflow for meaningful work.
- Keep Codex and Claude hook commands runtime-specific only where their plugin-root variables differ.
- Release version must be `0.4.2` in package and both plugin/marketplace metadata.

### Task 1: Prompt Hook Regression Coverage

**Files:**
- Modify: `tests/plugin/cc-adapter.test.ts`
- Modify: `tests/plugin/manifests.test.ts`

- [ ] Write tests that call `handleUserPromptSubmit` for an empty project and assert `UserPromptSubmit` plus the consent text, and tests that initialized/opted-out projects produce no stdout.
- [ ] Run `npm test -- tests/plugin/cc-adapter.test.ts tests/plugin/manifests.test.ts` and observe the expected missing-export/missing-manifest failures.

### Task 2: Shared Adapter Implementation

**Files:**
- Modify: `src/hook/cc-adapter.ts`

- [ ] Extract the existing uninitialized guidance into a helper parameterized by hook event name.
- [ ] Add `handleUserPromptSubmit(event)` and dispatch `user-prompt-submit` from `runHook`.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Runtime Manifest Wiring

**Files:**
- Modify: `hooks/hooks.json`
- Modify: `hooks/hooks-codex.json`

- [ ] Add `UserPromptSubmit` command entries invoking `user-prompt-submit` with the correct plugin-root variable.
- [ ] Update manifest tests for the event and command set.
- [ ] Run focused tests and the manual prompt-hook probe.

### Task 4: Release Metadata and Documentation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`
- Modify: `.codex-plugin/plugin.json`
- Modify: `README.md`
- Create: `RELEASE_NOTES_v0.4.2.md`

- [ ] Bump all package/plugin/marketplace versions and README release badge/link to `0.4.2`.
- [ ] Document prompt-time initialization behavior and update the Codex trust wording to include `UserPromptSubmit`.
- [ ] Add release notes listing the bug fix and verification.

### Task 5: Full Verification and Publication

**Files:**
- Modify: `project-progress/Progress.md`

- [ ] Run `npm run build`, `npm test`, `npm run typecheck`, `npm run bench:build`, and `npm pack --dry-run --ignore-scripts`.
- [ ] Commit with `fix: trigger project init on prompts`.
- [ ] Push `main` and create annotated tag `v0.4.2`; publish the GitHub release using `RELEASE_NOTES_v0.4.2.md`.
- [ ] Verify the remote commit, tag, release, and packed contents.
- [ ] Update `Progress.md` Resume Snapshot, Next Action, and Blockers with final evidence.
