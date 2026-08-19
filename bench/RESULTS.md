# Resumability Benchmark Results

## Methodology

Each scenario is a repository frozen mid-task, distributed as a git bundle so
it restores byte-exactly. `setup` clones the bundle into a temp directory and
applies a named condition; `baseline` removes `project-progress/`, `tracker`
leaves it in place, and any other name leaves the tree as restored so a
competing memory system can be configured by hand.

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

## Results

No runs recorded yet. Populate this table by running each scenario under each
condition and pasting the scores.

| scenario | condition | tokens-to-correct | duplicate-work | wrong-file-touches |
|----------|-----------|-------------------|----------------|--------------------|

## Fixture honesty

A scenario where `baseline` and `tracker` score the same is not measuring
resumption. Such a scenario is rewritten or removed rather than reported.
