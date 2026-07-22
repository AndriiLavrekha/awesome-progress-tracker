# Release Checklist

- [x] Templates exist for `project-progress/`.
- [x] Fixture projects cover valid, stale, and sensitive progress states.
- [x] Hook and MCP tests pass (Node-only; no Python toolchain required).
- [x] Lifecycle hook wrappers exist for PowerShell and POSIX shells.
- [x] Codex skill exists.
- [x] AGENTS and Claude Code snippets exist.
- [x] Hook guidance exists.
- [x] MCP server exposes compact read tools.
- [x] MCP server exposes controlled write tools.
- [x] MCP tests pass.
- [x] TypeScript MCP build passes.
- [x] MCP discovery requires explicit `PROJECT_PROGRESS_ROOTS`.
- [x] MCP read responses are bounded for token-conscious use.
- [x] MCP write inputs reject unsafe structure injection and oversized content.
- [x] Final end-to-end verification has been recorded in `project-progress/Session Log.md`.
- [x] This repo's `project-progress/Progress.md` is marked release ready.
- [x] No secrets are present in progress files.
- [x] npm package exposes executable bins for `awesome-progress-tracker` and `project-progress`.
- [x] `npx` can run the packaged CLI.
- [x] `install` defaults to Claude Code bootstrap instructions.
- [x] `install -g codex` installs Codex bootstrap instructions and skill.
- [x] Installed bootstrap asks before initializing a project.
- [x] `status` reports project, bootstrap, skill, and MCP configuration state.
- [x] `uninstall` removes managed bootstrap, skill, and MCP configuration.
- [x] Install configures MCP clients for Claude Code and Codex.
- [x] MCP maintains lightweight JSON and Markdown project indexes.
- [x] MCP exposes `refresh_projects`.
- [x] `doctor` verifies setup state.
- [x] `install --verify` runs a post-install check.
- [x] `install-mcp` supports MCP-only setup.
- [x] Project-local MCP config can be generated with `--scope project`.
- [x] Manual test plan covers new, existing, initialized, uninitialized, hook, MCP, index, privacy, and uninstall scenarios.
- [x] Agent self-test instructions exist.

## Claude Code plugin

- [ ] `npm run build` was re-run and the updated `dist/` is committed (the plugin runs from the
      cloned repo with no build step, so committed `dist/` must match `src/`).
- [x] `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` agree on the plugin name.
- [x] `.mcp.json` points at `${CLAUDE_PLUGIN_ROOT}/dist/src/mcp/server.js`.
- [x] `hooks/hooks.json` wires SessionStart, PreToolUse (git commit), and Stop to the committed adapter.
- [x] `/project-progress:init` command and `project-progress` skill load under `claude plugin details`.
- [x] Plugin installs cleanly via `claude plugin marketplace add` + `claude plugin install`.

## Codex plugin

- [x] `.codex-plugin/plugin.json` references `./skills/`, `./.mcp.json`, and `./hooks/hooks-codex.json`.
- [x] `.agents/plugins/marketplace.json` lists the plugin with `source.path` "." and `ON_INSTALL` auth.
- [x] `hooks/hooks-codex.json` wires SessionStart/PreToolUse/Stop to the adapter via `${PLUGIN_ROOT}` (no Claude-only `if`).
- [x] Adapter output uses the shared `hookSpecificOutput` / `systemMessage` shape Codex and Claude Code both accept.
- [x] Installs cleanly via `codex plugin marketplace add` + `codex plugin add project-progress@<marketplace>`.
- [ ] Plugin hooks are trusted on first run (Codex prompts; document that users approve once).
