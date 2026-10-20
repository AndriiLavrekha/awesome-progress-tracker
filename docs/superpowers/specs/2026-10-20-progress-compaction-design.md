# Progress Compaction Design

## Goal

Progress files must stay small enough to read at every session start. Today
they only grow. In one real project (`agenticwars-game-backup`) the
`project-progress/` folder reached 616 KB across nine files; `Progress.md`
alone was 193 KB against a 1.6 KB template, and about 94% of it was history
in sections the tracker does not recognize.

Two causes:

1. The only cleanup is the `Done` fold in the MCP tool `update_project_progress`
   (`foldDoneSection` in `src/mcp/writer.ts`). Agents that edit files directly,
   such as Codex, never trigger it. That project has no `Archive.md`.
2. The stop hook runs `validateProgressFile` but keeps only secret findings
   (the `secretErrors` filter in `src/hook/cc-adapter.ts`). Schema errors and
   missing sections were detected on every stop and never shown.

This design makes problems visible once per session, adds one explicit command
that moves old content into `Archive.md`, and fixes the guidance that let
agents invent their own archive sections.

## Scope

- The stop hook reports all validator errors, plus health findings, once per
  session. Secret findings keep showing on every stop.
- A health check that runs the compaction rules in memory and reports what
  `compact` would move, plus problems `compact` cannot fix, each with its own
  remedy. SessionStart shows it as one line.
- A CLI command, `awesome-progress-tracker compact [project-dir] [--write]`,
  backed by a pure module `src/compact.ts`.
- One fence-aware line scanner in `src/mcp/markdown.ts`, used by the existing
  section parsers in `markdown.ts` and `writer.ts` and by `compact.ts`.
- The MCP `Done` fold keeps its ADR 0020 order (Progress.md first) but no longer
  loses folded items when the archive write fails.
- Skill and template wording for where history goes and how Session Log
  entries are written.
- A one-time cleanup run on `agenticwars-game-backup` after release.

## Exclusions

- No automatic compaction. Hooks report; only `compact --write` changes files.
- No configurable budgets. Budgets are constants.
- No new MCP tool. The CLI works without the MCP server.
- No summarizing or rewriting. `compact` moves whole blocks, repairs a fixed
  table of garbled characters, and drops exact duplicate moved blocks.
- `Decisions.md` and `Open Questions.md` are never moved from. `compact` only
  repairs garbled characters in them. Choosing what is answered or superseded
  needs judgment.
- No merging of a stray `SessionLog.md` and no handling of ad-hoc
  `*-History-*.md` files. Those exist in one project; its hand pass handles
  them.
- No repair of missing spaces before digits (`after33d0196`). It cannot be
  told apart from real tokens.
- No archive split by month or by source file. One `Archive.md`.

## Design

### Words

- **Kept sections**: `ALLOWED_PROGRESS_SECTIONS` plus `Verification`. The
  template ships a `## Verification` section that the MCP write tool does not
  accept; it is still a legitimate section and is never moved or flagged. The
  MCP allow-list does not change.
- **Block**: a heading line of level 1 or 2 (`#` or `##`, outside fenced code)
  and every following line up to the next level 1 or 2 heading outside fenced
  code. Text before the first such heading is the **head**, together with any
  frontmatter.
- **Fence-aware**: every rule that looks at headings or task markers skips
  lines inside fenced code, using the shared scanner.

### Shared scanner

`src/mcp/markdown.ts` exports `scanLines(markdown)`, returning each line's
text, offset, length, and whether it is inside or is a fence line, using the
existing fence rules. It also exports `splitFrontmatter(markdown)`. The private
`sectionMatches` in `markdown.ts` is rebuilt on `scanLines`; `writer.ts` drops
its duplicate copies of `sectionMatches` and `splitLinesWithEndings` and imports
the shared ones.

### compact rules

`src/compact.ts` holds pure functions from LF text to
`{ kept: string; moved: string[]; notes: string[] }`, where each moved entry is
one block's text. Encoding repair runs first on every file. Kept output is the
kept blocks, each trimmed at its end, joined by one blank line; a file with
nothing to move and nothing to repair comes back byte-identical except for
trailing whitespace at block ends.

`Progress.md`:

- Keep the head, the first level 1 block, and the first block of each kept
  section, in file order.
- Move later level 1 blocks, blocks with unknown titles, and later duplicates
  of a kept section title.
- Fold `Done` with `foldDoneSection`. Folded lines go to the archive through
  `appendToArchive`, the same path the MCP tool uses. Skip the fold when the
  `Done` body contains fenced code: a line-based fold could split a fence and
  hide every later section from the parsers.
- `notes` never lists missing sections; the validator already does.

`Session Log.md`:

- Keep the head and the first level 1 block. Move later level 1 blocks.
- Entries are the level 2 blocks. An entry's sort key is the first
  `YYYY-MM-DD` in its heading, then the first `HH:MM` after it if present, then
  file position. Later sorts newer.
- Keep the 20 newest dated entries; move the older dated entries. Undated
  entries stay and are counted in `notes`.
- Kept output: head, first level 1 block, undated entries in file order, then
  kept dated entries oldest to newest. This repairs mixed ordering; the newest
  entry is last.

`Tasks.md`:

- An open task is a line matching `- [ ]` or `* [ ]` at any indent. A checked
  task is `- [x]`, `- [X]`, `* [x]`, or `* [X]`.
- A level 2 block with no open task is finished. Keep the newest 3 finished
  blocks by file position; move the rest. This includes reference sections
  without tasks; the skill says such material does not belong in `Tasks.md`.
- In what remains, a top-level checked task plus its more-indented lines
  (including indented lines after a blank line) is movable only when those
  lines contain no open task and no fence line or fenced content: moving part
  of a fence would leave an unclosed fence in both files. Keep the newest 10
  movable tasks by file position; move the rest. Moved tasks are grouped under
  their nearest preceding heading, or `Tasks` when there is none, as one block
  per group.
- Unchecked tasks never move.

Moved text:

- Encoding repair maps the UTF-8 bytes of a fixed character list, as decoded by
  Windows-1252, back to the character: `— – ‘ ’ “ ” … • · × → Ä Ö Ü ä ö ü ß é è à ç`,
  and removes a byte-order mark (U+FEFF and its garbled form `ï»¿`). Detection
  uses the same exact sequences, never a bare `Ã`. The Windows-1252 table for
  bytes 0x80–0x9F is written out in code: Node builds without full ICU decode
  `windows-1252` as Latin-1, which would make repair silently do nothing.
- Within one file in one run, a moved block whose trimmed text equals an
  earlier moved block's trimmed text is dropped. Other files and the existing
  `Archive.md` are not compared.

`Archive.md`:

- Each run adds `## Compacted YYYY-MM-DD` with `### From Progress.md`,
  `### From Session Log.md`, and `### From Tasks.md` subsections, only those
  with content. Moved headings shift down two levels, capped at `######`,
  fence-aware.
- The run is inserted before `## Archived Done Items` when that heading exists,
  else appended. Folded `Done` lines then go through `appendToArchive`, which
  appends at the end under `## Archived Done Items`. Later MCP folds also append
  at the end, so they always land under that heading.

Output:

- Default is a dry run: for each file, size before and after, moved block
  headings, and notes. Nothing is written.
- `--write` applies the same plan. Line endings are detected per file and
  preserved; `Archive.md` uses `Progress.md`'s line ending. When there is
  nothing to change, `--write` says so instead of the dry-run hint.

### compact write order

1. Read every file and record its hash.
2. Re-read and compare every source hash immediately before writing. On a
   change, or a conflict in steps 3–4, stop with
   `<file> changed while compact was running; rerun compact.`
3. Write `Archive.md`: create it with exclusive create (`wx`) when missing, else
   `writeFileAtomic` with its hash. A concurrent create (`EEXIST`) is a
   conflict like a hash mismatch.
4. Write each changed source with `writeFileAtomic` and its recorded hash. On a
   conflict, stop and tell the user to rerun.

A failure after step 3 leaves duplicated text in `Archive.md`. Text is never
lost. Running `compact --write` changes `Progress.md`'s body, so the stop hook
then treats `Progress.md` as updated this session. The skill tells agents to
compact as a separate step and still update `Resume Snapshot`, `Next Action`,
and `Blockers` when they did other work.

### MCP Done fold

The order stays as ADR 0020 decided: guarded `Progress.md` write first, so a lost
race never archives items the caller will resubmit. The archive write moves to
the shared archive writer (`wx` create or `writeFileAtomic`). If it fails after
`Progress.md` landed, the tool returns `updated: true` with
`archiveError` and `unarchivedItems` (the folded lines) instead of throwing, so
the caller can restore them. Nothing is lost silently.

### Health

`checkProgressHealth(progressDir)` in `src/hook/validator.ts` returns findings,
each `{ message, remedy }`, where `remedy` is `"compact"` or `"edit"`. It never
blocks. It runs the compaction rules in memory and reads files only.

- `compact`: one finding when a compaction would move blocks, for example
  `compact would move Progress.md 51 blocks, Tasks.md 45 blocks, 25 Done lines`,
  and one `garbled characters in <file>` finding per file to repair.
- `edit`: `Progress.md` still over 16 KB after compaction; any kept section
  over 4000 characters (`MAX_SECTION_CONTENT_LENGTH`, imported from
  `src/mcp/writer.ts`); `Session Log.md` still over 40 entries after compaction
  (undated entries).

Command text: the hook builds the command from its own location, as
`node "<dist>/src/cli.js" compact "<project dir>"`, so it works for plugin
installs where the `awesome-progress-tracker` binary is not on PATH.

Surfacing:

- SessionStart: one line when there is any finding, built inside a try/catch so
  a health failure never drops the resume context, for example
  `Progress health: compact would move Progress.md 51 blocks, 25 Done lines; garbled characters in Decisions.md — run node "…/cli.js" compact "…"`.
- Stop hook: secret findings on every stop, as today. Other validator errors and
  health findings once per session, recorded as `healthShown` in session state
  like `stopBlocked`. They are summarized as the first three problems plus
  `+N more`. The stale and checkpoint messages are separate and not counted.
  The `compact` command is named only when a finding has remedy `compact`.

### Guidance

- Skill: old non-`Done` text goes to `Archive.md`, never to new `##` sections in
  `Progress.md`; never create `*-History-*.md` files or a second session log;
  append Session Log entries at the bottom with headings
  `## YYYY-MM-DD HH:MM <topic>`; run `compact` (dry run, then `--write`) when
  the health line appears, as its own step.
- Templates: the `Session Log.md` heading example gains a time and topic.
- README: a short section on `compact`.

## Testing

`tests/compact.test.ts`:

- Conservation: for each rule set, every non-blank input line appears in kept
  text or the rendered archive run, comparing lines after encoding repair with
  leading `#` marks and surrounding spaces stripped, except dropped duplicates.
- Fixtures: unknown sections, a second `#` heading, a duplicate kept title,
  `Verification` kept, headings and task markers inside fenced code ignored,
  garbled text, mixed-order Session Log with `HH:MM` ties, undated entries,
  finished Tasks blocks, a checked task with an open child, a checked task
  whose lines touch a fence, and a file under budget.
- Idempotence: a second run moves nothing.
- CLI: a dry run writes nothing; `--write` creates `Archive.md`, preserves CRLF,
  inserts the run before `## Archived Done Items`.

Hook tests:

- Stop hook shows schema and health problems once per session, secrets every
  time.
- SessionStart shows the health line only when there is a finding and still
  returns resume context when the health check throws.

MCP test:

- `archiveFoldedItems`, which the handler calls after its guarded
  `Progress.md` write and spreads into its reply, returns `unarchivedItems`
  when the archive write fails.

## Rollout

Separate commits, in order:

1. `refactor:` shared fence-aware scanner.
2. `fix:` stop hook reports all validator errors once per session.
3. `feat:` encoding repair, then compaction rules (one commit per rule group),
   then the folder plan with the shared archive writer.
4. `fix:` MCP fold keeps unarchived items.
5. `feat:` health findings in SessionStart and Stop.
6. `feat:` `compact` command.
7. `docs:` skill, template, and README wording.
8. `chore:` rebuilt `dist`. Release, by the owner.

## agenticwars cleanup

After the release, in `D:/depot/agenticwars-game-backup`, with no Codex session
active:

1. Commit `project-progress/` alone as a checkpoint, after the owner approves,
   because the repository has other uncommitted edits.
2. Run `compact` and review the dry run. The released build's read-only dry run
   on 2026-10-20 printed: `Progress.md` 188.9 KB to 5.6 KB (49 blocks and 25
   Done lines moved); `Session Log.md` 224.8 KB to 38.1 KB (191 blocks moved;
   9 undated entries kept); `Tasks.md` 66.8 KB to 3.6 KB (47 blocks moved);
   garbled characters repaired in `Progress.md`, `Session Log.md` and
   `Decisions.md`. The files keep changing while that project is active, so
   record the actual numbers.
3. Run `compact --write`.
4. Hand pass, drafted from the 2026-10-20 Session Log entry and reviewed by the
   owner:
   - Merge `SessionLog.md` entries into `Session Log.md` and delete it. Date or
     remove undated entries, then run `compact --write` again.
   - Merge the three `*-History-*.md` files into `Archive.md`; move answered
     Open Questions there.
   - `Remaining Work` and `Blockers` match the approved startup refusal.
   - `Last Session` describes the 2026-10-19/20 legacy-retirement work.
   - Fill `Current State`, `Remaining Work`, `Deployment`,
     `Completion Criteria`, and `Resume Instructions`.
   - `Resume Snapshot` becomes four bullets: state, verified, failing, next
     owner.
   - Frontmatter: `status: active`, a valid `handoff` value instead of
     `in-progress`, and fill or remove `unknown` values.
   - List `[a-z][0-9]` joins by regex and restore spaces one by one, leaving
     commit hashes intact.
   - Optional: mark superseded Decisions.
5. Verify: no validator errors, no SessionStart health line, and the diff shows
   moved lines plus the hand-pass edits only.
6. Find the source of missing spaces before digits. If a compression mode is
   active for that project's agent, exclude `project-progress/` from it.
