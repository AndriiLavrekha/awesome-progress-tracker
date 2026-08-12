# Task 3 Report

## Summary

Implemented the Hermes lifecycle-management surface in `src/cli.ts` and covered it with focused tests in `tests/mcp/cli.test.ts`.

The new Hermes behavior now:

- reports status from `hermes skills list --source hub` and `hermes mcp list`
- returns conceptual Hermes-managed component labels instead of Codex config paths
- runs doctor checks for `hermes`, `skill`, `mcp`, `mcp-connection`, `index`, and `project`
- runs `hermes mcp test awesome-progress-tracker` only when the Hermes MCP entry is present
- uninstalls only present managed components, removing MCP before skill with `stdin: "y\n"`
- wraps Hermes lifecycle command failures with the exact failing subcommand text

## RED evidence

Command:

```text
npm test -- tests/mcp/cli.test.ts
```

Result before implementation:

- failed in the five new Hermes lifecycle tests
- `readStatus({ agent: "hermes" })` still fell through to Codex paths and reported Codex files
- `uninstallAgent({ agent: "hermes" })` removed Codex-managed files instead of Hermes-managed components
- `runDoctor({ agent: "hermes" })` still used the generic Claude/Codex checks and never produced Hermes-specific check names
- lifecycle errors did not identify the failing Hermes subcommand

This confirmed the Hermes status, doctor, and uninstall branches were still missing.

## GREEN evidence

Focused command:

```text
npm test -- tests/mcp/cli.test.ts
```

Result after implementation:

- passed
- `Test Files 1 passed`
- `Tests 23 passed`

## Additional verification

Commands:

```text
npm test
npm run typecheck
```

Results:

- passed: full Vitest suite (`Test Files 12 passed`, `Tests 106 passed`)
- passed: TypeScript test-program typecheck

## Files changed

- `src/cli.ts`
- `tests/mcp/cli.test.ts`
- `.superpowers/sdd/task-3-report.md`

## Self-review

- Reused the existing `CommandRunner` seam and Hermes list parsers from Tasks 1–2 instead of introducing a second execution path.
- Kept Hermes lifecycle behavior command-driven and avoided any profile-path assumptions, per the task brief.
- Added one shared Hermes command wrapper so failing lifecycle commands now report the exact subcommand that failed.
- Preserved Claude, Codex, and project-scope flows outside the Hermes-specific branches.
- Verified both the focused CLI suite and the full repository suite before finishing.

## Concerns

- Hermes list parsing still assumes the managed name is the first whitespace-delimited column; that matches current command contracts and tests, but a future Hermes table-format change would require tightening the parser.
