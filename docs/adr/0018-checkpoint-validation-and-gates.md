# ADR 0018: Checkpoint validation and verification gates

- **Status:** Accepted
- **Date:** 2026-08-19

## Context

`project-progress/Progress.md` recorded only an `updated` date. A resuming
agent had no way to tell whether the `Next Action` it was about to follow had
already been done in a session it never saw, or whether the tree it was
looking at was even the tree the file described. Nothing distinguished "the
project moved forward since this was written" from "the project was reset
backwards past this," and nothing distinguished either from the ordinary case
of resuming exactly where the last session left off.

Status was similarly coarse in a different way: `status: active` and prose
like "implementation done" said nothing about whether tests passed, whether
the change had been reviewed, or whether it had been deployed. A session
could read "done" in `Last Session` and skip verification a human would have
insisted on, because the file conflated "I finished writing the code" with
"I confirmed it works."

## Decision

1. `src/hook/schema.ts` adds eight optional frontmatter keys: `base_commit`,
   `base_branch`, `worktree_dirty`, `checkpoint_at`, and four gates
   (`gate_implementation`, `gate_tests`, `gate_review`, `gate_deploy`) over a
   shared vocabulary (`not-started`, `in-progress`, `done`, `failing`,
   `blocked`). All eight are optional and absence always means "unknown," so
   `REQUIRED_FRONTMATTER` is untouched and every existing `Progress.md` stays
   valid without migration.
2. The `Stop` hook (`bestEffortStampCheckpoint` in `src/hook/cc-adapter.ts`)
   stamps the four checkpoint fields, but only after the existing freshness
   check confirms the agent actually updated `Progress.md` this session. A
   session that ends without touching the file gets no checkpoint stamp,
   because a checkpoint is a claim about state that was just written, not
   state that happened to exist.
3. Gates are agent-asserted, never inferred. The MCP `set_project_gates` tool
   is the only sanctioned way to set them; nothing in the hook or CLI runs
   tests or infers gate values from git or CI output.
4. `SessionStart` (`handleSessionStart`) resolves drift between the stored
   `base_commit` and the current `HEAD` via `resolveDrift` in
   `src/hook/checkpoint.ts`, and reports it before the `Resume Snapshot`,
   `Next Action`, and `Blockers` it would otherwise inject — the agent learns
   its recorded state may be stale before it absorbs that state, not after.
   Drift is advisory only; `SessionStart` never blocks on it the way `Stop`
   can block on staleness.

## Consequences

- `DriftStatus` has six variants, not the four an initial pass assumed:
  `none`, `ahead`, `behind`, `diverged`, `missing`, and `unknown`. Collapsing
  them produced visibly wrong output in review. `behind` exists because a
  tree can be reset backwards past a checkpoint, which is not "no drift" and
  is not "ahead" either. `unknown` exists because git can fail to compare two
  commits outright, as in a shallow clone, and that case deliberately reports
  no commit counts at all — an earlier version fabricated "0 commits" in that
  situation, which was a real bug caught in review, not a hypothetical one.
- `renderDrift` bounds itself to `MAX_DRIFT_LENGTH` by trimming its own
  changed-files list rather than being wrapped in the generic external
  truncation helper used elsewhere in the hook. Truncating the rendered
  string from the end kept the file names and cut the closing "verify before
  acting" instruction, which is backwards: the instruction is the part that
  must survive.
- The `Stop` hook now writes to `Progress.md`, which it never did before this
  work. It writes through `writeFileAtomic` rather than a plain write, both
  to avoid clobbering a concurrent `update_project_progress` MCP write that
  won the race, and to avoid a partial write truncating the file that
  `SessionStart` treats as the canonical resume source.
- Worst-case injected `SessionStart` context (drift block, gates line, and
  the existing snapshot/next-action/blockers) measured 2178 characters,
  roughly 550 tokens, per session start.
- Drift resolution costs about 15-20ms in the common case where the stored
  checkpoint already matches `HEAD` (a single `rev-parse` short-circuits the
  rest), and up to about 100ms in the divergent or ahead/behind cases that
  require additional `merge-base` and `diff` calls.
- Gate values are only as honest as the agent that set them; nothing verifies
  a claimed `gate_tests: done` against reality. Running the project's test
  suite from within a hook to infer gate state was considered and rejected:
  it is far more invasive than a hook should be, and it still cannot work for
  projects whose test command the tracker has no way to discover or run
  safely.
- A known consequence was deliberately deferred rather than fixed here:
  stamping a checkpoint leaves `Progress.md` dirty in the working tree, and
  the meaningful-work predicate that gates the `Stop` warning counts changes
  under `project-progress/` as meaningful work. That means a session can end
  with only the previous session's own checkpoint stamp dirty in the tree,
  and the next session's freshness check sees that dirt and treats it as
  unaddressed. A separate plan is expected to address this.
