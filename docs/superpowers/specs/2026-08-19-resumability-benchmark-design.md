# Resumability Benchmark Design

## Goal

Measure whether a progress tracker actually improves how well an agent resumes
interrupted work, and make the measurement repeatable so it functions as a
regression test rather than a one-time claim.

The question is narrow and answerable: given a project frozen mid-task, how
many tokens does an agent spend before it takes the correct next action, how
often does it redo finished work, and how often does it edit the wrong files?

## Scope

An in-repository harness under `bench/` with a small set of fixture scenarios,
a setup command that materializes a fixture under a named condition, and a
scoring command that grades a recorded agent transcript against expectations.

Three metrics: `tokensToCorrectNextAction`, `duplicateWorkCount`,
`wrongFileTouches`.

## Exclusions

Wall-clock time and step counts are excluded. Both are dominated by model
latency and sampling variance rather than by resume quality, so they would make
results noisier without making them more informative.

Automated agent driving is excluded from this version. Programmatic runs need
API credentials, couple the benchmark to one vendor's SDK, and cannot exercise
Codex or Hermes, which are targets this project already supports.

Completion accuracy is excluded. Grading whether the agent finished the task
correctly requires a full task oracle per fixture, which is a much larger build
than grading its first correct action.

## Design

### Layout

```
bench/
  scenarios/
    01-interrupted-refactor/
      repo.bundle
      expected.json
      README.md
    02-failing-tests/
  harness/
    setup.ts
    score.ts
  RESULTS.md
```

Each fixture is a `git bundle` so a scenario is one file, restores byte-exactly,
and carries its own history for drift and checkpoint scenarios to exercise.

### Expectations

```json
{
  "correctNextAction": ["wire foldDoneSection into update_project_progress"],
  "mustTouch": ["src/mcp/server.ts"],
  "mustNotTouch": ["src/mcp/writer.ts"],
  "alreadyDone": ["foldDoneSection is already implemented in writer.ts"]
}
```

`correctNextAction` holds accepted matchers rather than one exact string,
because a correct action has many correct phrasings. `mustNotTouch` and
`alreadyDone` encode the failure modes worth catching: editing a file the task
does not involve, and reimplementing work the frozen repository already
contains.

### Conditions

`setup <id> --condition <name>` clones the bundle into a temporary directory and
applies a named condition. `tracker` leaves `project-progress/` in place;
`baseline` removes it. Conditions are arbitrary names, so a competitor's memory
system is added by defining a new condition without changing the harness.

The command prints the working directory and the task prompt to give the agent,
then stops. It never launches an agent.

### Scoring

`score <id> <transcript>` reads a recorded transcript and reports:

- `tokensToCorrectNextAction`: cumulative tokens consumed up to the first
  action matching `correctNextAction`, or unbounded if never reached;
- `duplicateWorkCount`: actions that reimplement an `alreadyDone` item;
- `wrongFileTouches`: edits to files in `mustNotTouch` or outside `mustTouch`.

Scoring is deterministic given a transcript, so a disputed result can be
recomputed by anyone holding the same file.

### Reporting

`RESULTS.md` publishes the methodology, the fixture definitions, and the raw
per-scenario numbers together. A benchmark authored by the tool's own maintainer
is only credible if the tasks and grading are inspectable, so the fixtures ship
alongside the numbers and the conditions are reproducible by a reader.

## User Experience

```
npm run bench -- setup 01 --condition tracker
  -> fixture at /tmp/bench-01-tracker, prompt printed
<run your agent there, save the transcript>
npm run bench -- score 01 transcript.jsonl
  -> tokens: 4210  duplicate-work: 0  wrong-files: 1
```

Runs are deliberate rather than continuous. The suite is exercised before a
release or after a change to resume context, not on every commit.

## Testing and Verification

The harness itself is tested: setup restores a bundle and applies each
condition correctly; scoring returns known values for hand-written transcripts
covering the correct-action, never-correct, duplicate-work, and wrong-file
cases; and an unparseable transcript fails loudly rather than scoring zero.

Fixtures are verified by running the `baseline` condition and confirming it
scores materially worse than `tracker`. A fixture where both conditions score
the same is not measuring resumption and is rewritten or removed.

## Decision

Build the benchmark after checkpoint validation, session handoff, and
concurrency hardening ship. Benchmarking resume quality before those exist
measures the current surface, not the designed one, and would have to be rerun
immediately.
