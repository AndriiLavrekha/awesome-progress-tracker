# Repository Guidelines

## Project Structure & Module Organization

The TypeScript implementation is in `src/`: `cli.ts` provides the package CLI, `hook/` contains lifecycle validation and adapters, and `mcp/` implements the MCP server, Markdown parsing, and project index. Tests mirror those areas in `tests/hook/`, `tests/mcp/`, and `tests/plugin/`. Keep reusable project files in `templates/project-progress/`; agent-facing guidance belongs in `skills/`, `agent-instructions/`, and `hooks/`. Built JavaScript is emitted to `dist/` and should not be edited directly.

## Build, Test, and Development Commands

- `npm ci` installs the locked dependency set.
- `npm run build` compiles TypeScript to `dist/`.
- `npm test` runs the complete Vitest suite once.
- `npm run test:mcp` runs only MCP tests while iterating on server behavior.
- `npm run typecheck` checks source and tests without producing a release artifact.

Use `npm run mcp` or `npm run hook` only after building when manually exercising compiled entry points.

## Coding Style & Naming Conventions

Write TypeScript as ESM with explicit `.js` import specifiers, two-space indentation, semicolons, and double-quoted strings. Use `camelCase` for values and functions, `PascalCase` for types and interfaces, and kebab-case for Markdown and config files. Follow the surrounding code; this repository has no configured formatter or linter. Keep Markdown progress templates human-readable and avoid placing secrets in them.

## Testing Guidelines

Add or update a focused Vitest test for each behavior change. Name test files `*.test.ts`, group cases with `describe`, and state observable behavior in `it` descriptions. There is no configured coverage threshold, but run the relevant focused command plus `npm test` and `npm run typecheck` before opening a pull request.

## Commit & Pull Request Guidelines

Recent history favors short, imperative Conventional Commit-style subjects: `feat: add ...`, `fix: ...`, `docs: ...`, and `chore: ...`. Keep commits narrowly scoped. Pull requests should explain the problem and behavior change, link related issues when available, list verification commands and results, and include screenshots or command output for user-visible plugin, hook, or documentation changes.
