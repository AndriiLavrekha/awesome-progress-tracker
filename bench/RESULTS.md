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
