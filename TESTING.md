# Awesome Progress Tracker Test Plan

Use this plan to validate a real install with Claude Code and Codex. Prefer temporary projects first, then repeat the important scenarios on one real existing project.

## Preflight

Run the installer and health check for the agent you want to test.

Claude Code:

```bash
npx github:AndriiLavrekha/awesome-progress-tracker install --verify
npx github:AndriiLavrekha/awesome-progress-tracker doctor
```

Codex:

```bash
npx github:AndriiLavrekha/awesome-progress-tracker install -g codex --verify
npx github:AndriiLavrekha/awesome-progress-tracker doctor -g codex
```

For native Codex plugin testing, also verify the plugin path:

```bash
codex plugin list
```

Then start a new Codex session and open `/hooks` to review and trust the bundled
`project-progress` hooks if Codex marks them as untrusted.

Expected:

- `doctor_ok: true`
- bootstrap instructions installed
- MCP config installed
- index directory available
- Codex skill installed when checking Codex

If `doctor_ok` is false, fix that before testing project behavior.

## Scenario 1: Brand New Empty Project

1. Create an empty temporary folder.
2. Start Claude Code or Codex in that folder.
3. Ask: `Create a tiny hello-world project here.`

Expected:

- The agent notices `project-progress/Progress.md` is missing.
- The agent asks before initializing Awesome Progress Tracker.
- If you answer no, no `project-progress/` folder is created.
- If you answer yes, `project-progress/` is created before or alongside meaningful project work.
- After work, `Progress.md`, `Tasks.md`, and `Session Log.md` are current.

Broken if:

- The agent silently creates `project-progress/` without asking.
- The agent never asks and does meaningful multi-step work without progress tracking.
- The progress files are created but remain generic template text after the session.

## Scenario 1A: Opted-Out Project Stays Quiet

1. Create or pick a project without `project-progress/`.
2. Record an opt-out:

```bash
npx github:AndriiLavrekha/awesome-progress-tracker state set /path/to/repo --state opted-out
```

3. Start a new Codex session in that repo.
4. Ask a normal multi-step request.

Expected:

- The `SessionStart` hook does not inject initialization guidance.
- The agent does not repeatedly ask to initialize unless you explicitly invoke the skill or reset state.
- `project-progress/` is not created.

Reset after the test:

```bash
npx github:AndriiLavrekha/awesome-progress-tracker state reset /path/to/repo
```

## Scenario 2: Existing Project Without Progress Tracker

1. Pick or create a project that already has code but no `project-progress/`.
2. Start Claude Code or Codex in the project.
3. Ask: `Continue this project by adding a small README improvement.`

Expected:

- The agent recognizes the project is not initialized.
- The agent asks whether to initialize Awesome Progress Tracker.
- If yes, it creates `project-progress/` with project-specific metadata.
- The progress files describe the existing project and the requested continuation task.

Broken if:

- It assumes a new project instead of inspecting the existing code.
- It initializes without asking.
- It writes progress files that do not match the existing project.

## Scenario 3: Existing Initialized Project

1. Use a project that already has `project-progress/Progress.md`.
2. Start Claude Code or Codex in that project.
3. Ask: `Resume this project and make one small safe documentation change.`

Expected:

- The agent reads `Progress.md` first, starting with frontmatter and `Resume Snapshot`.
- It loads only additional progress sections it needs.
- It updates `Progress.md`, `Tasks.md`, and `Session Log.md` before finishing.
- It does not reinitialize or overwrite existing progress files.

Broken if:

- It ignores the existing progress files.
- It overwrites user-maintained progress history.
- It reads every progress file unnecessarily before knowing it needs them.

## Scenario 4: MCP Project Index

Use a root that contains at least one initialized project.

```bash
npx github:AndriiLavrekha/awesome-progress-tracker install-mcp --roots "C:/path/to/projects"
```

From Claude/Codex, ask:

```text
Use the Awesome Progress Tracker MCP tools to refresh projects, then list active and blocked projects.
```

Expected:

- MCP `refresh_projects` updates:
  - `~/.awesome-progress-tracker/projects.json`
  - `~/.awesome-progress-tracker/Projects.md`
- `list_projects`, `list_active_projects`, and `list_blocked_projects` return compact summaries from the index.
- Individual project reads still reflect the actual `project-progress/Progress.md`.

Broken if:

- MCP tools are unavailable after restart.
- `refresh_projects` does not discover initialized projects under configured roots.
- Index files are missing after refresh.

## Scenario 5: Progress Update Through MCP

Ask the agent:

```text
Use Awesome Progress Tracker MCP to update the Next Action for project <project name> to "Manual MCP update test".
```

Expected:

- The matching project `Progress.md` changes.
- The global index is updated with the new summary.
- No unrelated project files change.

Broken if:

- MCP updates the wrong project.
- The Markdown file changes but the index does not.
- The index changes but the Markdown source of truth does not.

## Scenario 6: Hook Check

Inside this repository or an initialized test project:

Windows:

```powershell
./hooks/project-progress-check.ps1 -ProjectRoot . -SessionStartedAt 2026-06-28T00:00:00+00:00 -MeaningfulWork -CompletionBoundary
```

POSIX:

```bash
./hooks/project-progress-check.sh --project-root . --session-started-at 2026-06-28T00:00:00+00:00 --meaningful-work --completion-boundary
```

Expected:

- Exit code `0` when progress files are valid and current.
- Nonzero exit when required progress files are missing at a completion boundary.
- Warnings or failures for stale progress after meaningful work.

## Scenario 6A: Codex SessionStart Hook Smoke

After `npm run build`, run the adapter directly with JSON input.

Initialized repo:

```powershell
'{"cwd":"D:/depot/awesome-progress-tracker","session_id":"smoke-initialized","source":"startup"}' | node dist/src/hook/cc-adapter.js session-start
```

Expected: JSON with `hookSpecificOutput.additionalContext` containing `Resume Snapshot`.

Uninitialized repo:

```powershell
'{"cwd":"C:/path/to/uninitialized-repo","session_id":"smoke-uninitialized","source":"startup"}' | node dist/src/hook/cc-adapter.js session-start
```

Expected: JSON with initialization guidance and the exact user-facing ask.

Opted-out repo:

```powershell
npx github:AndriiLavrekha/awesome-progress-tracker state set C:/path/to/uninitialized-repo --state opted-out
'{"cwd":"C:/path/to/uninitialized-repo","session_id":"smoke-optout","source":"startup"}' | node dist/src/hook/cc-adapter.js session-start
```

Expected: no stdout from the hook.

## Scenario 7: Privacy And Commit Policy

Create or edit a test `Progress.md` with:

```yaml
sensitivity: sensitive
commit_progress: false
```

Ask the agent to do a small task.

Expected:

- The agent may update local progress files.
- The agent does not stage or commit those progress files unless explicitly told to do so.
- No secrets are written to progress files.

## Scenario 8: Uninstall

Claude Code:

```bash
npx github:AndriiLavrekha/awesome-progress-tracker uninstall
npx github:AndriiLavrekha/awesome-progress-tracker status
```

Codex:

```bash
npx github:AndriiLavrekha/awesome-progress-tracker uninstall -g codex
npx github:AndriiLavrekha/awesome-progress-tracker status -g codex
```

Expected:

- Managed bootstrap block is removed.
- Managed MCP config is removed.
- Codex skill is removed for Codex uninstall.
- Project-local `project-progress/` folders are not deleted.

## Report Format

For each scenario, record:

```text
Scenario:
Agent:
Result: PASS | FAIL | PARTIAL | NOT TESTED
Evidence:
Broken behavior:
Likely cause:
Recommended fix:
```

Treat any silent initialization, missing end-of-session progress update, MCP/index mismatch, or secret leakage as release-blocking.
