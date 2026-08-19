# Checkpoint Validation and Verification Gates Design

## Goal

Make `project-progress/Progress.md` carry machine-verifiable freshness so a
resuming agent can tell whether the recorded `Next Action` still applies. Today
the file records only a `updated` date; nothing ties its prose to a commit. An
agent resuming after four intervening commits reads a plan that may already be
done and re-does the work.

Two facts are added: where the checkpoint was taken (`base_commit`,
`base_branch`, `worktree_dirty`, `checkpoint_at`) and what had been verified at
that point (`gate_implementation`, `gate_tests`, `gate_review`, `gate_deploy`).

## Scope

This design adds eight optional frontmatter keys, one MCP tool for writing
gates, automatic checkpoint stamping in the Stop hook, and drift reporting in
the SessionStart hook.

All eight keys are optional. `REQUIRED_FRONTMATTER` in `src/hook/schema.ts` is
not extended, so every existing `Progress.md` stays valid without migration. An
absent key means unknown, never a failure.

## Exclusions

Gates are not inferred. The tracker never runs a test suite, never parses test
output, and never sets `gate_tests` on its own. Gates are agent-asserted state.

Drift never blocks. SessionStart has no block semantics, and drift after a pull
is normal, not an error.

Gate values are not auto-downgraded on drift. Resetting `gate_tests` to unknown
because HEAD moved was considered and rejected: it makes the hook mutate
semantic state the agent owns, and the drift report already tells the agent the
gates predate the current tree.

## Design

### Frontmatter

```yaml
base_commit: e7d3f98a1b2c3d4e5f60718293a4b5c6d7e8f900
base_branch: main
worktree_dirty: true
checkpoint_at: 2026-08-19T14:02:11Z
gate_implementation: done
gate_tests: failing
gate_review: pending
gate_deploy: not-started
```

`base_commit` stores the full 40-character SHA because it is a machine field;
every human-facing rendering shortens it to seven characters. `base_branch`
holds the branch name or the literal `(detached)`. `checkpoint_at` is ISO 8601
in UTC.

Gate keys are a fixed set of four. Gate values are a fixed set of five:
`not-started`, `in-progress`, `done`, `failing`, `blocked`. `src/hook/schema.ts`
gains `ALLOWED_GATE_VALUES` and `OPTIONAL_FRONTMATTER`, and `validateFrontmatter`
checks these keys only when present. `OPTIONAL_FRONTMATTER` is introduced here
as the shared registry of non-required keys; the session handoff design extends
the same list rather than adding a parallel one. A fixed vocabulary is what lets
SessionStart state "tests were failing at checkpoint" as fact rather than
quoting prose.

### Writing checkpoints

The Stop hook stamps the four checkpoint fields, and only when its freshness
check concludes the agent actually updated `Progress.md` this session. Stamping
a checkpoint onto an unchanged file would assert a verification that never
happened.

Stamping reuses the existing `replaceFrontmatterValue` in `src/mcp/writer.ts`
as a single read-modify-write over all four keys, then one atomic write.

The hook derives values from `git rev-parse HEAD`, `git rev-parse
--abbrev-ref HEAD`, and `git status --porcelain`. The existing `git()` helper
returns `null` outside a repository; in that case all four fields are skipped
and no error surfaces. The whole stamp is best-effort and wrapped: a stamping
failure must never fail a session, consistent with the adapter's existing
"never break a session" contract.

### Writing gates

Nothing today writes arbitrary frontmatter from MCP. `mark_project_status`
handles `status` and `last_milestone` only. This design adds one tool:

```
set_project_gates(project, gates: { implementation?, tests?, review?, deploy? })
```

It validates each supplied value against `ALLOWED_GATE_VALUES`, writes only the
keys supplied, and leaves the rest untouched. Partial updates are the common
case: an agent that just ran the suite sets `tests` alone.

### Reading drift

SessionStart resolves the stored checkpoint against the current repository and
appends at most one drift block to its injected context, capped at roughly 400
characters so the resume budget stays bounded.

Five cases:

- no `base_commit`, or not a git repository: emit nothing;
- `base_commit` equals HEAD: emit nothing;
- `base_commit` is an ancestor of HEAD, the ordinary case: emit the
  commits-behind count from `git rev-list --count base..HEAD` and the changed
  files from `git diff --name-only base..HEAD`, capped at ten entries with a
  `(+N more)` suffix;
- `base_commit` exists but is not an ancestor, meaning the checkpoint and HEAD
  have diverged, as after switching branches: report divergence rather than a
  behind-count, using `git rev-list --left-right --count base...HEAD` for both
  sides, and list changed files against the merge base;
- `base_commit` is unknown to git, having been squashed, rebased away, or
  garbage collected: say so plainly and skip the file list, which cannot be
  computed.

Ancestry is decided with `git merge-base --is-ancestor base HEAD`, and
existence with `git cat-file -e base^{commit}`, so the diverged and missing
cases are told apart rather than both falling through to a wrong behind-count.

The rendered block reads:

```
Checkpoint drift: stored base_commit e7d3f98 is 4 commits behind
HEAD def456a (branch main).
Changed since checkpoint:
  src/mcp/writer.ts
  src/hook/cc-adapter.ts
Verify Next Action still applies before acting.
```

Gates emit a single additional line, and only when at least one gate is present
and not `done`, so a fully verified project adds nothing:

```
Gates at checkpoint: tests=failing, review=pending
```

The changed-file list is the load-bearing part. A commits-behind count says the
plan might be stale; the file list says what made it stale.

## User Experience

Nothing is required of the user. Checkpoints appear on their own once the Stop
hook stamps them, and drift reporting starts working on the next session.
Projects that never adopt gates see no change at all.

An agent that wants gates calls `set_project_gates` when it learns something:
after a test run, after a review, after a deploy.

## Testing and Verification

Unit tests cover: optional-key validation accepts absence and rejects an
out-of-vocabulary gate value; stamping writes all four fields on a fresh
Progress.md and skips them outside a repository; stamping is suppressed when
the freshness check reports stale; `set_project_gates` writes only supplied
keys; and drift rendering across all four cases, including the squashed-base
case and the ten-file cap.

Manual verification stamps a checkpoint, commits twice, starts a session, and
confirms the injected context names both commits and the changed files.

## Decision

Ship checkpoint fields and gates together as one frontmatter change. They share
a write path, a validation surface, and a rendering surface, and each is far
less useful alone: a checkpoint without gates says the plan is old but not what
was proven, and gates without a checkpoint say what was proven but not against
what.
