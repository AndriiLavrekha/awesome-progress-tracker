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

Three metrics are reported. `tokens-to-correct` is cumulative tokens through
the first action matching the scenario's `correctNextAction` matchers, or
"never reached". `duplicate-work` counts actions that reimplement something the
frozen repository already contains. `wrong-file-touches` counts edits to files
the scenario forbids or does not list.

Wall-clock time and step counts are deliberately not measured: both are
dominated by model latency and sampling variance rather than resume quality.

## Scenarios

| id | what is frozen | correct next action |
|----|----------------|---------------------|
| 01-interrupted-refactor | `foldDoneSection` implemented but never called | wire it into `updateSection` in `src/server.ts` |

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

No valid runs recorded yet. Populate this table by running each scenario under
each condition and pasting the scores.

| scenario | condition | tokens-to-correct | duplicate-work | wrong-file-touches |
|----------|-----------|-------------------|----------------|--------------------|

## Fixture honesty

A scenario where `baseline` and `tracker` score the same is not measuring
resumption. Such a scenario is rewritten or removed rather than reported.
