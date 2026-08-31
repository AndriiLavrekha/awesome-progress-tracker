# ADR 0009: Fail closed for indeterminate restricted-progress commit checks

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

The Hermes plugin must prevent commits that stage progress files governed by `sensitivity: sensitive` or `commit_progress: false`. Inspection may fail because Git is unavailable, frontmatter is malformed, the progress file cannot be read, or the tool workdir cannot be resolved.

## Decision

For an unambiguous Git commit attempt, the plugin fails closed when it cannot determine whether a restricted progress file is staged. It returns a block action with a remediation message.

This failure policy applies only to commands the guard can confidently classify as a Git commit attempt. It does not block non-commit terminal calls or unrelated Hermes tools when inspection fails.

## Consequences

- The guard preserves the privacy policy even under degraded inspection conditions.
- Users may need to correct a malformed/unreadable `Progress.md`, restore Git/workdir access, or explicitly change the progress policy before committing.
- The implementation needs narrow commit-command classification to avoid blocking `git status`, `git commit-graph`, text mentioning `git commit`, and unrelated shell activity.
- Tests must cover successful allowed/restricted commit cases and all indeterminate inspection paths.
