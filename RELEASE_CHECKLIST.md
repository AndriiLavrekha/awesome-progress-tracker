# Release Checklist

## Breadcrumbs v0.7.0 candidate

- [x] Owner confirmed npm account `andriilavrekha`; `npm whoami` confirms the same CLI login. Package is `@andriilavrekha/breadcrumbs`.
- [x] All three CLI aliases run from the packed artifact and share project data and saved opt-out state.
- [x] Legacy Claude/Codex install, reinstall and uninstall preserve unrelated configuration and project files.
- [x] Global npm upgrade is verified in an isolated prefix without `--force` or data migration.
- [x] Full tests, typecheck, build and packed MCP handshake pass; package and manifest versions agree.
- [x] Review remaining old names as compatibility identifiers or historical references.
- [ ] Authorize the concrete candidate before repository rename, push/tag or publication.
- [ ] After tagging, verify real Hermes, raw skill URL, GitHub install and existing plugin update routes.
- [ ] Publish and verify the scoped package; bridge/deprecate an old npm package only if owned.
- [ ] Publish `Breadcrumbs v0.7.0` on GitHub and remove the README release-candidate notice.

### Local verification, 2026-10-21

- WSL Node `20.20.0`, npm `10.8.2`: `npm test -- --no-color` passed **403/403** tests; `npm run typecheck` and `npm run build` passed.
- `npm pack` produced `andriilavrekha-breadcrumbs-0.7.0.tgz`; inspected the allowlist and new compiled `dist/src/package.js`.
- Installed that tarball into disposable npm prefixes. `breadcrumbs`, `awesome-progress-tracker` and `project-progress` printed identical help; explicit `npm exec --package=<tarball> -- breadcrumbs help` passed. Init, dry-run compact and opt-out state stayed shared across aliases.
- Packed Claude/Codex install twice, status, doctor and uninstall passed with disposable homes. Unrelated MCP configuration, project progress and opt-out state survived. Unit tests separately seed the legacy managed markers and installed skill path.
- Packed stdio MCP initialization advertised `project-progress` / `0.7.0` and listed the expected tools from a working directory outside the checkout.
- A local fixture with the old package identity and two legacy bins reproduced npm `EEXIST` against the actual scoped tarball. Package-specific uninstall followed by scoped install passed without `--force`; data/configuration/state survived. This checks bin ownership, not a public legacy npm publication.
- Windows Node `24.14.0`: `node dist/src/cli.js help` passed. Full Windows Vitest and Windows symlink privileges were not checked; native test dependencies in this checkout are Linux bindings.
- Independent code review: no blocking issues after documentation corrections. `git diff --check` passed.
- Authenticated registry reads return 404 for both package identities; neither public npm publication was found. GitHub admin access is confirmed and the target repository URL currently returns 404. No rename, push, tag, publication or live provider update has occurred.

## Previous release verification (v0.6.0 and earlier)

The checked items below are historical evidence, not verification of the Breadcrumbs v0.7.0 candidate. In particular, the new `v0.7.0` raw skill URL and live Hermes/plugin routes must pass the candidate gates above after tagging.

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
- [x] Hermes docs match the supported surface: skill + MCP only; lifecycle hooks are deferred.
- [x] Disposable Hermes verification uses a temporary `HERMES_HOME`.
- [x] `install -g hermes`, `doctor -g hermes`, and `uninstall -g hermes` work against the packaged tarball.
- [x] `hermes skills list --source hub`, `hermes mcp list`, and `hermes mcp test awesome-progress-tracker` pass.
- [x] Hermes agent tool discovery/read/update smoke tests pass in a disposable Codex OAuth profile.
- [x] Hermes opt-out and uninstall paths are verified.

## Claude Code plugin

- [x] `npm run build` was re-run and the updated `dist/` is committed (the plugin runs from the
      cloned repo with no build step, so committed `dist/` must match `src/`).
- [x] `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` agree on the plugin name.
- [x] `.mcp.json` points at `${CLAUDE_PLUGIN_ROOT}/dist/src/mcp/server.js`.
- [x] `hooks/hooks.json` wires SessionStart, UserPromptSubmit, PreToolUse (git commit), and Stop to the committed adapter.
- [x] `/project-progress:init` command and `project-progress` skill load under `claude plugin details`.
- [x] Plugin installs cleanly via `claude plugin marketplace add` + `claude plugin install`.

## Codex plugin

- [x] `.codex-plugin/plugin.json` references `./skills/`, `./.mcp.json`, and `./hooks/hooks-codex.json`.
- [x] `.agents/plugins/marketplace.json` lists the plugin with `source.path` "." and `ON_INSTALL` auth.
- [x] `hooks/hooks-codex.json` wires SessionStart/UserPromptSubmit/PreToolUse/Stop to the adapter via `${PLUGIN_ROOT}` (no Claude-only `if`).
- [x] Adapter output uses the shared `hookSpecificOutput` / `systemMessage` shape Codex and Claude Code both accept.
- [x] Installs cleanly via `codex plugin marketplace add` + `codex plugin add project-progress@<marketplace>`.
- [ ] Plugin hooks are trusted on first run (Codex prompts; document that users approve once).
