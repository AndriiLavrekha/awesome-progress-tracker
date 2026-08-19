# ADR 0021: Resumability benchmark

## Status

Accepted.

## Context

The project claims that Markdown progress tracking improves agent resumption,
with no measurement behind the claim. A benchmark is both the strongest
evidence for the claim and a regression test for the resume surface built in
ADRs 0018 through 0020.

## Decision

Build an in-repository harness with git-bundle fixtures, named conditions, and
offline transcript scoring, rather than a one-off study. A rerunnable suite
catches regressions; a published number ages out.

Runs are human-driven. Programmatic driving would need API credentials, couple
the benchmark to one vendor's SDK, and could not exercise Codex or Hermes,
which this project already supports. The harness sets up the fixture and scores
the transcript; it never launches an agent.

Three metrics: tokens to the first correct action, duplicate work, and wrong
file touches. Wall-clock time and step counts are excluded as model-speed
confounded. Completion accuracy is excluded because it needs a full task oracle
per fixture.

Fixture checkouts pin `core.autocrlf=false` and `core.eol=lf`. A bundle
restores its objects byte-exactly, but the working tree git writes from them is
subject to the local line-ending configuration, so without the pin the same
fixture yields different file contents on a Windows default checkout and a
score that cannot be compared across machines.

The harness is built after ADRs 0018 through 0020, because benchmarking a
resume surface before it exists measures the wrong thing.

## Consequences

A benchmark authored by the tool's own maintainer is only credible if its tasks
and grading are inspectable, so fixtures, expectations, and methodology are
published alongside every number.

The suite is run before a release or after a change to resume context, not in
CI, because runs are manual.

`bench/` compiles through its own tsconfig and is excluded from `package.json`'s
`files`, so nothing benchmark-related ships to consumers.
