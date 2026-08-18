# ADR 0016: Fold oversized Done sections into an Archive.md, replace-not-append for narrative fields

- **Status:** Accepted
- **Date:** 2026-08-18

## Context

`project-progress/Progress.md` grows without bound on long-running projects.
`Resume Snapshot` and `Last Session` are meant to hold current state, but
nothing told agents these are replace-only fields, so agents have been
resubmitting `old content + new paragraph` as the "new" section content every
session. `Done` is a legitimate append-as-you-go checklist, but nothing ever
pruned it, so every completed item lived in the file forever, eventually
hitting `MAX_SECTION_CONTENT_LENGTH` with no recovery path other than manual
edits.

The write path is already centralized: `update_project_progress` always
replaces a named section wholesale (`replaceSectionWithOperation` in
`src/mcp/writer.ts`), so growth of `Resume Snapshot`/`Last Session` is a skill
instruction gap, not a write-path bug. `Done` growth is different: agents
legitimately keep appending completed items, so the skill can't self-police it
without losing history.

## Decision

1. `skills/project-progress/SKILL.md` now states that `Resume Snapshot` and
   `Last Session` are replaced wholesale on every update, and that old
   narrative belongs in dated `Session Log.md` entries instead.
2. `update_project_progress` auto-folds the `Done` section: when the submitted
   content exceeds `FOLD_THRESHOLD` (2800 chars, under the 4000-char hard
   cap), the oldest lines are moved into a new `project-progress/Archive.md`
   file under a dated heading, and only the newest lines stay in
   `Progress.md`. The tool response reports how many items were archived.
3. `Archive.md` is a new template file, copied automatically by `init` like
   the other template files. It is excluded from the skill's default
   token-conscious read order — read on request only.

## Consequences

- `Progress.md` stops growing unbounded for the two most common causes
  (accumulating narrative, unpruned checklists) without losing history —
  folded items and superseded narrative move to files the skill only reads on
  demand.
- Folding only covers the MCP write path. An agent that edits `Progress.md`
  directly via `Edit`/`Write`, bypassing the MCP tool, only gets the
  SKILL.md instruction fix; enforcing folding there would need a larger hook
  rework and is out of scope here.
- `Remaining Work`, `Decisions.md`, and `Session Log.md` are unchanged: active
  work stays small by nature, and `Decisions.md`/`Session Log.md` are already
  append-by-design, token-conscious-opt-in files.
