# Task 2 Report

## Summary

Implemented the Hermes installer path in `src/cli.ts` and covered it with focused command-contract tests in `tests/mcp/cli.test.ts`.

The new behavior:

- installs the managed Hermes skill as `project-progress`
- installs the managed Hermes MCP server as `awesome-progress-tracker`
- checks `hermes skills list --source hub` and `hermes mcp list` before any mutation
- skips skill operations in `mcpOnly` mode
- rolls back the Hermes skill with `hermes skills uninstall project-progress` and `stdin: "y\n"` if `hermes mcp add` fails

## RED evidence

Command:

```text
npm test -- tests/mcp/cli.test.ts
```

Result before implementation:

- failed in the four new Hermes tests
- `installAgent({ agent: "hermes" })` still returned Codex file paths
- collision and rollback tests resolved instead of rejecting

This showed the Hermes installer branch was missing and the new tests were exercising real unmet behavior.

## GREEN evidence

Focused command:

```text
npm test -- tests/mcp/cli.test.ts
```

Result after implementation:

- passed
- `Test Files 1 passed`
- `Tests 18 passed`

## Additional verification

Command:

```text
npm run typecheck
```

Result:

- passed

## Files changed

- `src/cli.ts`
- `tests/mcp/cli.test.ts`

## Self-review

- Kept the change isolated to the requested installer surface and tests.
- Added exact-name Hermes list parsers with ANSI stripping so collision checks stay command-output driven.
- Used the normalized roots value directly in the Hermes `--env` argument and kept `--args` last.
- Preserved existing Claude, Codex, and project-scope install behavior.

## Concerns

- The Hermes list parsers currently treat the first whitespace-delimited token as the name column; this matches the task contract and tests, but if Hermes changes its table format later, these helpers may need to be tightened.
