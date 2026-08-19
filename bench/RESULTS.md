# Resumability Benchmark Results

## Methodology

Each scenario is a repository frozen mid-task, distributed as a git bundle so
it restores byte-exactly. `setup` clones the bundle into a temp directory and
applies a named condition. A condition is an overlay: `conditions/<name>/` is
copied into the restored tree and committed, so every condition starts from a
clean working tree and differs only in what it added. `baseline` ships no
overlay and is the bare repository; `tracker` ships `project-progress/`; a
competing memory system is added by dropping its files under its own condition
name, with no change to the harness.

A condition adds; it never removes. The first version of this harness deleted
`project-progress/` for baseline, which left the file in the bundle's git
history — and the first baseline run opened with "Progress.md deleted in
working tree but tells me next step", having recovered the resume note with
`git log`. What a condition does not add is now absent from history too.

The clone pins `core.autocrlf=false` and `core.eol=lf`, because a machine with
the Windows default would otherwise restore CRLF content and make a score
depend on the platform that produced it.

The agent is given only the scenario prompt, which never names the task. The
run is recorded as a normalized JSONL transcript and scored offline, so a
disputed number can be recomputed by anyone holding the same file.
`npm run bench -- normalize <session.jsonl> <transcript.jsonl>` produces that
file from a Claude Code session transcript, so token counts are the run's real
billed usage rather than a hand-written estimate.

A step's token count is `input_tokens + cache_creation_input_tokens +
output_tokens`. Cache reads are excluded: they are dominated by the unchanged
system prompt being re-read every turn, which says nothing about how well the
agent resumed. Thinking tokens are counted, because they were spent, but
thinking content is never emitted as an action and so cannot satisfy a
`correctNextAction` matcher. Where one assistant message produces several
events, its tokens are charged to the first, so `tokens-to-correct` includes
the whole message that contained the correct action.

The agent driven for a run must not have seen the fixture or its
`expected.json`. An agent that helped build the harness knows the answer key,
and its score measures recall rather than resumption.

Four metrics are reported. `tokens-to-correct` is cumulative tokens through
the first action matching the scenario's `correctNextAction` matchers, or
"never reached". `duplicate-work` counts actions that reimplement something the
frozen repository already contains. `wrong-file-touches` counts edits to files
the scenario forbids or does not list.

`steps-to-correct` is how many transcript events it took to get there. A
session charges prompt-cache creation for the whole system prompt to its first
step — roughly 18,000 tokens in the runs below, within 200 tokens across
conditions — which dwarfs the difference being measured. The step count
survives that constant. It is not the step count ADR 0021 excludes: that
exclusion is about speed, and this is about directness.

Wall-clock time is still not measured. It is dominated by model latency and
sampling variance rather than resume quality.

## Scenarios

| id | what is frozen | correct next action |
|----|----------------|---------------------|
| 01-interrupted-refactor | `foldDoneSection` implemented but never called | wire it into `updateSection` in `src/server.ts` |
| 02-deliberate-exception | a config-parser migration stopped at three of five handlers | warn on the legacy parser and record the on-hold decision, leaving the last two handlers alone |

Scenario 02 is built as a trap. A half-finished migration invites finishing it,
and `parseConfigV2` ignores unknown keys instead of rejecting them, so
migrating the last two handlers compiles, passes, and silently resets a timeout
those two callers still send. Nothing in the code marks them as exceptions; the
reason exists only in the resume note. An agent without the note is expected to
finish the migration, which `mustNotTouch` scores as two wrong-file touches,
and to never reach the recorded next action.

This is the property scenario 01 lacked. There, the correct action was
inferable from an unused import, so the baseline needed no resume note to find
it.

## Discarded runs

The first pair of runs, on 2026-08-20, is not reported. Three defects made the
numbers meaningless, and all three are fixed:

- Baseline was not blind. `project-progress/Progress.md` was deleted from the
  working tree but remained in git history, and the baseline agent read it from
  there.
- `wrong-file-touches` counted every edit. Transcript paths are absolute while
  `mustTouch` entries are repo-relative, so no edit could ever match the allow
  list. `normalize` now takes `--root` and relativizes.
- `tokens-to-correct` reported "never reached" for a run that had edited the
  correct file, for the same path mismatch. The scenario's third matcher is now
  anchored against the relative path.

The scenario's `mustTouch` list is now empty. A run legitimately writes a test
file, a `package.json`, and its own `Progress.md`; none of that speaks to how
well it resumed, and the deny list carries the whole signal.

## Results

Run on 2026-08-20, Claude Opus 5 via Claude Code, one session per condition,
no steering and no answered questions.

| scenario | condition | tokens-to-correct | steps-to-correct | duplicate-work | wrong-file-touches | total tokens |
|----------|-----------|-------------------|------------------|----------------|--------------------|--------------|
| 01-interrupted-refactor | baseline | 30279 | 11 of 14 | 0 | 0 | 31659 |
| 01-interrupted-refactor | tracker | 31635 | 9 of 14 | 0 | 0 | 35861 |
| 02-deliberate-exception | baseline | never reached | never reached of 7 | 0 | 0 | 25222 |
| 02-deliberate-exception | tracker | 21471 | 5 of 20 | 0 | 0 | 32692 |

### What this shows, and what it does not

Both conditions reached the correct action, neither redid finished work, and
neither touched `src/writer.ts`. The tracker run got there in 9 steps against
11, and spent 1,356 more tokens doing it, plus 4,202 more overall — the cost of
reading `Progress.md` and writing it back.

**This scenario does not measure resumption, and its numbers should not be
quoted as evidence that the tracker helps.** The fixture is two files in which
a finished `foldDoneSection` is imported and never called. The unused import
is a giveaway: the baseline agent read both files and inferred the task
immediately, without needing a resume note. A two-step advantage on a task the
baseline solves unaided is not a resumption signal, and the honesty rule below
applies to it.

What the run did establish is that the harness works end to end, and that the
tracker's overhead on a trivial task is real and measurable: about 4,000 tokens
to read and maintain a resume note that saved two steps.

### Scenario 02: what separated, and what did not

The conditions separated cleanly. The tracker run read the note, added the
deprecation warning, logged the dated decision, and updated `Progress.md`. The
baseline run surveyed the repository, concluded it was already consistent, did
not edit anything, and asked whether to add a docs note — in its own words,
"Nothing to do here — three handlers correctly migrated, two correctly held
back for legacyTimeout dependency, matches decisions.md."

That is a real resumption result: the recorded next action was not recoverable
from the code, and without the note the agent could not find it. It is also the
weaker of the two things this scenario was built to show.

**The trap did not fire, because the fixture leaked.** The design assumed a
blind agent would finish the migration and silently break the two holdouts. It
cannot: both handlers read `config.legacyTimeout`, and `parseConfigV2` does not
return that field, so migrating them fails to typecheck rather than passing
quietly. `docs/decisions.md` also documents the pin-an-older-parser convention.
The baseline agent read both and reasoned correctly. `wrong-file-touches` is 0
in both conditions, and the deny list went untested.

The note claimed the migration "would compile, pass, and quietly change the
timeout" — which was false about its own fixture. That sentence has been
corrected. The correction postdates the run above and cannot have produced it:
the `Next Action` text is byte-identical, and only the justification paragraph
changed.

Neither condition took a wrong turn, so what this pair measures is narrower
than intended: whether the agent finds the recorded next action at all, not
whether the note prevents a plausible mistake. A fixture that tests the deny
list needs the exception to be invisible in types as well as in prose.

### Incidental finding

The tracker run spent four tool calls trying to update `Progress.md` through
the MCP server before giving up and editing the file directly: the fixture
lives in a temp directory outside `PROJECT_PROGRESS_ROOTS`, so
`update_project_progress` could not resolve the project and
`refresh_projects` did not help. Its own words: "Index don't cover this repo
path. Edit Progress.md direct." Part of the tracker condition's 32,692 tokens
is that detour rather than resume work.

### Next scenario

Scenario 02 was built from the first candidate and has been run. Two candidates
remain unbuilt: a refactor abandoned mid-way for a reason recorded nowhere in
the diff, and work blocked on a decision the code cannot express.

A third is now motivated by scenario 02's failure to fire: an exception that is
invisible to the type checker, where finishing the obvious work compiles and
passes and is still wrong. That is what would put `mustNotTouch` under real
test.

## Fixture honesty

A scenario where `baseline` and `tracker` score the same is not measuring
resumption. Such a scenario is rewritten or removed rather than reported.
