# Awesome Progress Tracker Test Plan

Validate a real install with Claude Code and Codex. Use temporary projects first, then repeat the important scenarios on one real project.

## Preflight

```bash
# Claude Code
npx github:AndriiLavrekha/awesome-progress-tracker install --verify
npx github:AndriiLavrekha/awesome-progress-tracker doctor

# Codex
npx github:AndriiLavrekha/awesome-progress-tracker install -g codex --verify
npx github:AndriiLavrekha/awesome-progress-tracker doctor -g codex
```

For native Codex plugin testing, also check `codex plugin list`, then start a new Codex session and trust the bundled `project-progress` hooks in `/hooks` if marked untrusted.

Expected: `doctor_ok: true`, bootstrap instructions installed, MCP config installed, index directory available, Codex skill installed (Codex only). Fix any failure before testing project behavior.

## Scenario 1: Brand New Empty Project

1. Empty temporary folder → start Claude Code or Codex.
2. Ask: `Create a tiny hello-world project here.`

**Expected:** agent notices `project-progress/Progress.md` is missing and asks before initializing. No → no `project-progress/` created. Yes → `project-progress/` created before/alongside the work; `Progress.md`, `Tasks.md`, `Session Log.md` are current afterward.

**Broken if:** it silently creates `project-progress/`, never asks and does multi-step work untracked, or leaves generic template text after the session.

## Scenario 1A: Opted-Out Project Stays Quiet

1. Pick/create a project without `project-progress/`.
2. `npx github:AndriiLavrekha/awesome-progress-tracker state set /path/to/repo --state opted-out`
3. New Codex session in that repo, ask a normal multi-step request.

**Expected:** `SessionStart` injects no initialization guidance; agent doesn't re-ask unless you invoke the skill or reset state; `project-progress/` stays absent.

Reset after: `npx github:AndriiLavrekha/awesome-progress-tracker state reset /path/to/repo`

## Scenario 2: Existing Project Without Progress Tracker

1. Project with code but no `project-progress/` → start Claude Code or Codex.
2. Ask: `Continue this project by adding a small README improvement.`

**Expected:** agent recognizes it's uninitialized, asks before initializing, and (if yes) creates `project-progress/` with project-specific metadata matching the existing code and the requested task.

**Broken if:** it assumes a new project instead of inspecting existing code, initializes without asking, or writes progress files that don't match the project.

## Scenario 3: Existing Initialized Project

1. Project with existing `project-progress/Progress.md` → start Claude Code or Codex.
2. Ask: `Resume this project and make one small safe documentation change.`

**Expected:** agent reads `Progress.md` first (frontmatter + Resume Snapshot), loads only the additional sections it needs, and updates `Progress.md`/`Tasks.md`/`Session Log.md` before finishing — without reinitializing or overwriting history.

**Broken if:** it ignores existing progress files, overwrites history, or reads every progress file before it knows it needs them.

## Scenario 4: MCP Project Index

```bash
npx github:AndriiLavrekha/awesome-progress-tracker install-mcp --roots "C:/path/to/projects"
```

Ask the agent: `Use the Awesome Progress Tracker MCP tools to refresh projects, then list active and blocked projects.`

**Expected:** `refresh_projects` updates `~/.awesome-progress-tracker/projects.json` and `Projects.md`; `list_projects`/`list_active_projects`/`list_blocked_projects` return compact summaries; individual reads still reflect the real `Progress.md`.

**Broken if:** MCP tools are unavailable after restart, `refresh_projects` misses initialized projects under configured roots, or index files are missing after refresh.

## Scenario 5: Progress Update Through MCP

Ask: `Use Awesome Progress Tracker MCP to update the Next Action for project <project name> to "Manual MCP update test".`

**Expected:** the matching project's `Progress.md` and the global index both update; no unrelated project changes.

**Broken if:** MCP updates the wrong project, or the Markdown and index fall out of sync in either direction.

## Scenario 6: Hook Check

```powershell
# Windows
./hooks/project-progress-check.ps1 -ProjectRoot . -SessionStartedAt 2026-06-28T00:00:00+00:00 -MeaningfulWork -CompletionBoundary
```

```bash
# POSIX
./hooks/project-progress-check.sh --project-root . --session-started-at 2026-06-28T00:00:00+00:00 --meaningful-work --completion-boundary
```

**Expected:** exit `0` when progress is valid/current; nonzero when required files are missing at a completion boundary; warnings/failures for stale progress after meaningful work.

## Scenario 6A: Codex SessionStart Hook Smoke

After `npm run build`, run the adapter directly with JSON input:

```powershell
# Initialized repo — expect additionalContext containing "Resume Snapshot"
'{"cwd":"D:/depot/awesome-progress-tracker","session_id":"smoke-initialized","source":"startup"}' | node dist/src/hook/cc-adapter.js session-start

# Uninitialized repo — expect initialization guidance with the exact user-facing ask
'{"cwd":"C:/path/to/uninitialized-repo","session_id":"smoke-uninitialized","source":"startup"}' | node dist/src/hook/cc-adapter.js session-start

# Opted-out repo — expect no stdout
npx github:AndriiLavrekha/awesome-progress-tracker state set C:/path/to/uninitialized-repo --state opted-out
'{"cwd":"C:/path/to/uninitialized-repo","session_id":"smoke-optout","source":"startup"}' | node dist/src/hook/cc-adapter.js session-start
```

## Scenario 7: Privacy And Commit Policy

Set in a test `Progress.md`:

```yaml
sensitivity: sensitive
commit_progress: false
```

Ask the agent to do a small task.

**Expected:** it may update local progress files but doesn't stage or commit them unless explicitly told to; no secrets get written to progress files.

## Scenario 8: Uninstall

```bash
# Claude Code
npx github:AndriiLavrekha/awesome-progress-tracker uninstall
npx github:AndriiLavrekha/awesome-progress-tracker status

# Codex
npx github:AndriiLavrekha/awesome-progress-tracker uninstall -g codex
npx github:AndriiLavrekha/awesome-progress-tracker status -g codex
```

**Expected:** managed bootstrap block and MCP config removed; Codex skill removed (Codex uninstall); project-local `project-progress/` folders untouched.

## Scenario 9: Hermes Disposable Profile Verification

Use a temporary `HERMES_HOME` so the test never touches your real Hermes profile.

### POSIX (Bash/Zsh)

```bash
PACKAGE_TGZ="$(npm pack --silent)"
export HERMES_HOME="$(mktemp -d)"

npx --yes --package="$PACKAGE_TGZ" awesome-progress-tracker install -g hermes --roots "C:/path/to/projects"

hermes skills list --source hub
hermes mcp list
hermes mcp test awesome-progress-tracker
npx --yes --package="$PACKAGE_TGZ" awesome-progress-tracker doctor -g hermes

# Start Hermes against a temp initialized project and smoke the agent-facing tool flow:
# list projects, read project progress, update the Next Action.

npx --yes --package="$PACKAGE_TGZ" awesome-progress-tracker state set /path/to/repo --state opted-out
npx --yes --package="$PACKAGE_TGZ" awesome-progress-tracker uninstall -g hermes
```

**Expected:** the temp `HERMES_HOME` holds all managed state, real profile untouched. `hermes skills list --source hub` shows `project-progress`; `hermes mcp list` shows `awesome-progress-tracker`; `hermes mcp test awesome-progress-tracker` passes. The Hermes agent can list/read/update projects through the MCP tools. Opt-out suppresses future prompts for that repo. `uninstall -g hermes` cleanly removes the managed skill and MCP server.

### PowerShell

Equivalent recipe from the repo root — creates a unique disposable Hermes home under the system temp directory, leaves your normal profile untouched.

```powershell
$packageTgz = npm pack --silent
$hermesHome = Join-Path ([System.IO.Path]::GetTempPath()) ("apt-hermes-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $hermesHome | Out-Null
$env:HERMES_HOME = $hermesHome

npx --yes --package="$packageTgz" awesome-progress-tracker install -g hermes --roots "C:/path/to/projects"
hermes skills list --source hub
hermes mcp list
hermes mcp test awesome-progress-tracker
npx --yes --package="$packageTgz" awesome-progress-tracker doctor -g hermes

# Run the initialized-project agent smoke and disposable-repo opt-out checks described above.
npx --yes --package="$packageTgz" awesome-progress-tracker state set C:/path/to/disposable-repo --state opted-out
npx --yes --package="$packageTgz" awesome-progress-tracker uninstall -g hermes

Remove-Item Env:HERMES_HOME
Write-Host "Disposable Hermes profile remains at $hermesHome for inspection or manual cleanup."
```

## Report Format

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
