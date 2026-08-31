# Demo Use Cases — Awesome Progress Tracker

Working script for recording showcase GIFs/clips for the README. Every scenario is real and runnable against the actual CLI (`src/cli.ts`), hooks (`src/hook/cc-adapter.ts`), and MCP server (`src/mcp/server.ts`) — nothing aspirational. Commands are copy-pasteable.

Each entry: the pain it removes, the steps, what to put on screen, and recording caveats.

Two prerequisites, once, before recording anything:

- Build locally if demoing from this repo instead of the published package: `npm run build`
- Pick a demo home directory so `install`/`uninstall`/`state` don't touch your real `~/.claude.json` or `~/.codex/config.toml` — a scratch folder set as `HOME`/`USERPROFILE`, or a disposable container/VM.

---

## 1. Cold resume — picking up a session with zero re-explaining

**Pain solved:** every new session re-derives "what was I doing," burning the first few turns and tokens on state that already existed.

**Steps:**
1. In an already-initialized project, close the current session entirely.
2. Start a brand-new session in the same repo.
3. Say nothing about prior work — watch `SessionStart` inject the Resume Snapshot / Next Action automatically.
4. Ask "what should I do next?" — it answers from the injected snapshot, not from re-reading the repo.

**Record:** split terminal — left pane `Progress.md` in an editor, right pane the fresh session showing the injected snapshot.

**Caveat:** injection only fires on `SessionStart`; mid-session, tell the agent to read `Progress.md` directly for the same effect.

---

## 2. Reboot survival — state that outlives the OS

**Pain solved:** terminal state, shell history, and in-memory context vanish on reboot; Markdown on disk doesn't.

**Steps:**
1. Do real work, update the Resume Snapshot / Next Action (or let the agent do it as a milestone).
2. Reboot (or close every terminal/IDE window — the point is "everything that could hold state is gone").
3. Reopen the project, start a new session.
4. Show the same Resume Snapshot reappearing, unchanged.

**Record:** before/after split — a shutdown/restart moment (can be simulated in editing), then the resumed session showing identical Next Action text.

**Caveat:** only works if the milestone update happened before the reboot — no autosave timer, it saves when the agent/hook writes to `Progress.md`.

---

## 3. Cross-agent handoff — Claude Code today, Codex tomorrow

**Pain solved:** switching tools (Claude Code ↔ Codex) usually means starting from zero — each tool's memory is siloed.

**Steps:**
1. Work in Claude Code on an initialized project; let it update `Progress.md`.
2. Close Claude Code, open the same repo in Codex.
3. Codex's `SessionStart` hook reads the same `Progress.md` — same Resume Snapshot, Next Action, Blockers.

**Record:** two recordings back to back (or side by side) — Claude Code session ending with an update, Codex session starting and immediately showing it.

**Caveat:** both plugins need to be installed for this to "just work" without manual file reads — see use cases 9 and 10.

---

## 4. Multi-project juggling — five repos, zero cross-contamination

**Pain solved:** context-switching across many repos per day lets memory (agent or human) bleed between them without a hard boundary.

**Steps:**
1. Have 3–5 initialized repos on disk.
2. `cd` into each in turn, fresh session each time.
3. Show each session's injected context is specific to that repo — no leakage of Project A's Next Action into Project B's session.

**Record:** fast-cut terminal — `cd repo-a && <start agent>`, `cd repo-b && <start agent>`, `cd repo-c && <start agent>`, snapshot changes every time.

**Caveat:** relies on `project-progress/` living at each repo's root — project-local by design, no shared global state file to cross-pollinate.

---

## 5. Pre-edit nudge — catching the skill-skip on casual requests

**Pain solved:** an informal request ("just add a login button") sends the agent straight to editing code without checking `Tasks.md`/`Open Questions.md`, silently drifting from the tracked plan.

**Steps:**
1. In an initialized project, ask an informal one-off change (don't mention "progress" or "tasks").
2. Let the agent attempt an `Edit`/`Write` on a project file.
3. The `PreToolUse` hook (`handlePreEdit`) fires a one-time-per-session reminder to check `Tasks.md`/`Open Questions.md` first.

**Record:** the casual request, then the reminder `systemMessage` appearing right before the first edit.

**Caveat:** once-per-session by design (shares session-state JSON with other hooks) — it won't repeat on later edits in the same session.

---

## 6. Forgot-to-log catch — flagging silent progress drift

**Pain solved:** real code changes land and `Progress.md` never gets updated; next session starts from stale state.

**Steps:**
1. In an initialized project, edit a non-`project-progress/` file, don't touch `Progress.md`.
2. End the session, triggering the `Stop` hook.
3. It compares `git status --porcelain` against whether `Progress.md` changed, and reminds you if the tree moved but the tracker didn't.

**Record:** edit a file, end the session, show the Stop-hook reminder.

**Caveat:** a nudge, not a blocker — it won't stop the session or refuse to exit.

---

## 7. Secret-scan catch — before it ever reaches git history

**Pain solved:** it's easy to accidentally paste a real credential into a progress note while writing a session log.

**Steps:**
1. Write a secret-shaped line into a progress file for the demo, e.g. `password: hunter2`.
2. Trigger the `Stop` hook.
3. `validateProgressFile` (`SECRET_PATTERNS`) flags `secret-like value` before you'd commit it.

**Record:** inject the fake secret line, trigger the hook, show the `Progress file may contain secrets (...); remove them.` warning.

**Caveat:** pattern-based, not a full secret scanner — catches obvious `password:`/`token:` assignments, not every credential shape. State that explicitly so it isn't mistaken for a real scanner.

---

## 8. Instant scaffold — zero to tracked in one command

**Pain solved:** hand-building a consistent progress structure (five files, correct frontmatter, consistent sections) is boilerplate nobody wants to write twice.

**Steps:**
```bash
npx awesome-progress-tracker init . --project "My Project"
```
or from this repo directly:
```bash
node dist/src/cli.js init /path/to/some/repo --project "Demo Project"
```

**Record:** empty repo → run the command → `project-progress/` appears with all 5 files (`Progress.md`, `Tasks.md`, `Decisions.md`, `Session Log.md`, `Open Questions.md`) populated with the project name and today's date.

**Caveat:** `init` refuses to overwrite an existing `project-progress/` without `--force` — show the refusal once so viewers know it's non-destructive by default.

---

## 9. Claude Code plugin install — one marketplace add, full feature set

**Pain solved:** wiring a skill + MCP server + three lifecycle hooks by hand is exactly the setup friction that makes people give up.

**Steps:**
```text
/plugin marketplace add AndriiLavrekha/awesome-progress-tracker
/plugin install project-progress@awesome-progress-tracker
```
or from a shell:
```bash
claude plugin marketplace add AndriiLavrekha/awesome-progress-tracker
claude plugin install project-progress@awesome-progress-tracker
```

**Record:** the two commands, then restart the session and show the skill, MCP tools, and hooks all present (`claude plugin list`).

**Caveat:** requires a session restart to reload — call this out, it's the one-time gotcha people hit immediately.

---

## 10. Codex plugin install — same deal, Codex-native path

**Pain solved:** identical friction as #9, for Codex's own plugin/hook/MCP format.

**Steps:**
```bash
codex plugin marketplace add AndriiLavrekha/awesome-progress-tracker
codex plugin add project-progress@awesome-progress-tracker
```

**Record:** the two commands, then `codex plugin list` confirming it's installed and enabled.

**Caveat:** Codex does **not** auto-trust plugin-bundled hooks — the first time they fire, Codex prompts you to review and trust them. Show that prompt so it isn't mistaken for a bug.

---

## 11. `status` dashboard — is this actually wired up?

**Pain solved:** after any install, checking whether it actually worked by hand-inspecting config files is tedious.

**Steps:**
```bash
npx awesome-progress-tracker status
npx awesome-progress-tracker status -g codex
```

**Record:** run on a fully-configured repo (all fields present), then again after removing one piece (e.g. the bootstrap block) to show the field flip to `false`.

**Caveat:** `status` reports per-agent (`-g claude` vs `-g codex`) — make clear which agent's state is shown, since they're tracked independently.

---

## 12. `doctor` diagnostics — pinpointing what's broken, not just that something is

**Pain solved:** "it doesn't work" is the most common support request; `doctor` turns that into an itemized checklist.

**Steps:**
```bash
npx awesome-progress-tracker doctor
npx awesome-progress-tracker doctor -g codex --json
```

**Record:** break something first (delete `~/.codex/config.toml`'s MCP block, or point `PROJECT_PROGRESS_ROOTS` at a nonexistent directory), run `doctor`, show the exact failing check, then fix and re-run to green.

**Caveat:** exit code is `1` on any failing check — useful for CI or setup scripts.

---

## 13. Clean `uninstall` — no residue left behind

**Pain solved:** many dev tools leave orphaned config behind after uninstall; trust goes up when removal is provably complete.

**Steps:**
```bash
npx awesome-progress-tracker install
npx awesome-progress-tracker status        # confirm installed
npx awesome-progress-tracker uninstall
npx awesome-progress-tracker status        # confirm removed
```

**Record:** the four commands back to back, `status` flipping from all-present to all-absent. Optionally diff `~/.claude.json` before/after to show the key is fully gone, not commented out.

**Caveat:** `uninstall --scope project` only removes the project-local `.mcp.json` entry, not the global bootstrap — call out the distinction if demoing both scopes.

---

## 14. MCP `list_projects` — a dashboard across every tracked repo

**Pain solved:** with several repos each tracking locally, there's no way to answer "what am I working on across everything" without opening each one — until now.

**Steps:**
1. `init` 3+ repos so the local index (`~/.awesome-progress-tracker/projects.json`) has entries.
2. Connect an MCP client. Standalone, MCP Inspector is easiest:
   ```bash
   PROJECT_PROGRESS_ROOTS="C:/path/to/repos-parent" npx @modelcontextprotocol/inspector node dist/src/mcp/server.js
   ```
3. Call `list_projects` (optionally with a `status` filter) and show the compact summary.

**Record:** Inspector's tool-call panel — `list_projects` request on the left, response with several projects on the right.

**Caveat:** reads the **cached index**, not a live scan — a just-added project needs `refresh_projects` first (#15).

---

## 15. MCP `refresh_projects` — picking up a brand-new repo

**Pain solved:** the index is a speed cache; without an explicit refresh it either goes stale or forces a full rescan on every read.

**Steps:**
1. With the MCP server connected (#14), `init` a new project under a configured root.
2. Call `list_projects` — show the new project isn't there yet.
3. Call `refresh_projects` — rescans configured roots for `Progress.md`.
4. Call `list_projects` again — it now appears.

**Record:** three sequential Inspector calls: missing → refresh → present.

**Caveat:** scans configured roots only — projects outside `PROJECT_PROGRESS_ROOTS` never appear, no matter how many refreshes.

---

## 16. MCP `read_project_progress` — pull one project's state without opening it

**Pain solved:** checking "what's the status of Project X" shouldn't require opening an editor and finding the file by hand.

**Steps:** call `read_project_progress` with a project identifier (path or name from `list_projects`) and show the compact, bounded summary returned — Resume Snapshot, Next Action, Blockers, not the whole file.

**Record:** Inspector call and response — or, more relatable, the same interaction inside a Claude Code/Codex chat when you ask "what's the status of my other project?"

**Caveat:** responses are intentionally bounded/truncated — don't demo it returning full session logs; reading the file directly is for that.

---

## 17. MCP `update_project_progress` — remote writes without opening the file

**Pain solved:** routine updates (appending Next Action, logging a milestone) are annoying by hand across many repos, easy for an agent via a typed tool call.

**Steps:** call `update_project_progress` to replace or append a named section (e.g. `Next Action`), then open `Progress.md` and show the change landed.

**Record:** Inspector call with section name/content, cut to the Markdown file showing the new text.

**Caveat:** replaces/appends a *named section*, not arbitrary regex edits — the write path validates structure and rejects unsafe/oversized content. Don't demo it as a generic file-editing tool.

---

## 18. MCP `mark_project_status` — flipping status from anywhere

**Pain solved:** frontmatter `status` (active/blocked/done) is the fastest "should I care about this right now" signal, but it rots if nobody flips it.

**Steps:** call `mark_project_status` with a new status (and optionally `last_milestone`), then call `list_projects` and show the change reflected immediately.

**Record:** two-call sequence — `mark_project_status` then `list_projects` — status column visibly different.

**Caveat:** updates frontmatter only; doesn't touch the Resume Snapshot or other prose — pair with #17 if the demo needs both a status flip and a narrative update.

---

## 19. Privacy opt-out — keeping sensitive notes out of git history

**Pain solved:** progress notes for client or confidential work shouldn't end up permanently in git history by default.

**Steps:**
1. Set `sensitivity: sensitive` or `commit_progress: false` in a project's `Progress.md` frontmatter.
2. Edit, then `git add -A` / `git status`.
3. Show `project-progress/` either isn't staged, or — with the Claude Code plugin's `PreToolUse` guard — that `git commit` is actively blocked while those files are staged.

**Record:** the frontmatter toggle, then `git status`/`git commit` behavior changing accordingly.

**Caveat:** doesn't auto-gitignore sensitive projects — the frontmatter is a signal the agent and hooks respect; a human running raw `git add -A` outside agent-mediated workflows can still stage it. State that boundary honestly rather than overselling it as enforced privacy.

---

## 20. Stale-project detection — catching a tracker that's quietly rotted

**Pain solved:** a `Progress.md` untouched for weeks while the repo keeps moving is worse than no tracker at all — it actively misleads the next resume.

**Steps:**
1. Use the `tests/fixtures/stale-project/project-progress/Progress.md` fixture pattern: an old `updated:` date next to recent git activity.
2. Run the freshness check (`src/hook/freshness.ts`, via the `Stop`/session hooks, or `tests/hook/freshness.test.ts`) and show the staleness warning.

**Record:** the fixture's frontmatter date next to `git log -1` showing much more recent commits, then the freshness warning firing.

**Caveat:** a nudge based on "meaningful work" heuristics, not a hard gate — it flags the mismatch, doesn't block anything.

---

## Recording matrix (quick reference)

| # | Best captured as |
| --- | --- |
| 1, 2, 3, 4 | Terminal-cast, agent session start/end |
| 5, 6, 7 | Terminal-cast, hook output snippet |
| 8, 9, 10, 11, 12, 13 | Terminal-cast, console-only |
| 14, 15, 16, 17, 18 | MCP Inspector (or in-chat tool call) screen recording |
| 19, 20 | Terminal-cast, frontmatter + git status/log side by side |
