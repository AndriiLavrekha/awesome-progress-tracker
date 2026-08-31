# Demo Use Cases — Awesome Progress Tracker

Working script for recording showcase GIFs/clips for the README. Each entry is a real, runnable
scenario grounded in the actual CLI (`src/cli.ts`), hooks (`src/hook/cc-adapter.ts`), and MCP
server (`src/mcp/server.ts`) — nothing here is aspirational. Commands are copy-pasteable.

For every scenario: the pain it removes, the exact steps, what to put on screen, and the caveats
worth calling out in the recording or the surrounding README copy.

Two general prerequisites, do once before recording anything:

- Build the CLI locally if you're demoing from this repo instead of the published package:
  `npm run build`
- Pick a demo home directory so `install`/`uninstall`/`state` commands don't touch your real
  `~/.claude.json` or `~/.codex/config.toml`. Easiest: a scratch folder set as `HOME`/`USERPROFILE`
  for the recording session, or a disposable container/VM.

---

## 1. Cold resume — picking up a session with zero re-explaining

**Pain solved:** every new agent session starts by re-deriving "what was I doing," burning the
first several turns (and a chunk of tokens) on state that already existed yesterday.

**Steps:**
1. In an already-initialized project (has `project-progress/Progress.md`), close the current
   Claude Code / Codex session entirely.
2. Start a brand-new session in the same repo.
3. Don't say anything about prior work — just watch the `SessionStart` hook inject the Resume
   Snapshot / Next Action as context automatically.
4. Ask the agent "what should I do next?" — it answers from the injected snapshot, not from
   re-reading the repo.

**Record:** terminal split — left pane shows `project-progress/Progress.md` open in an editor,
right pane shows the fresh session starting with the snapshot appearing as injected context.

**Caveat:** the injection only fires on `SessionStart`; if you're mid-session and want the same
effect, tell the agent to read `project-progress/Progress.md` directly.

---

## 2. Reboot survival — state that outlives the OS

**Pain solved:** terminal state, shell history, and in-memory agent context all vanish on reboot;
Markdown files on disk don't.

**Steps:**
1. Do a bit of real work, then update `Progress.md`'s Resume Snapshot / Next Action (or let the
   agent do it as a milestone).
2. Reboot the machine (or just close every terminal/IDE window — the point that matters for the
   recording is "everything that could hold state is gone").
3. Reopen the project after the reboot, start a new agent session.
4. Show the same Resume Snapshot reappearing, unchanged by the reboot.

**Record:** before/after split — a `shutdown`/restart moment (can be simulated/cut in editing),
then the resumed session showing identical Next Action text.

**Caveat:** this only works if the milestone update actually happened before the reboot — the tool
doesn't autosave on a timer, it saves when the agent (or hook) writes to `Progress.md`.

---

## 3. Cross-agent handoff — Claude Code today, Codex tomorrow

**Pain solved:** switching tools (Claude Code ↔ Codex) usually means starting from zero because
each tool's context/memory is siloed.

**Steps:**
1. Do a work session in Claude Code on an initialized project; let it update `Progress.md`.
2. Close Claude Code. Open the same repo in Codex.
3. Codex's `SessionStart` hook (`hooks/hooks-codex.json`) reads the identical
   `project-progress/Progress.md` — same Resume Snapshot, same Next Action, same Blockers.

**Record:** two side-by-side terminal recordings (or one after another) — Claude Code session
ending with an update, Codex session starting and immediately showing that update.

**Caveat:** both plugins must be installed for this to "just work" without manual file reads —
see use cases 9 and 10.

---

## 4. Multi-project juggling — five repos, zero cross-contamination

**Pain solved:** developers context-switch across many repos per day; agent memory (or human
memory) bleeds between them without a hard per-project boundary.

**Steps:**
1. Have 3–5 different initialized repos on disk.
2. `cd` into each one in turn, starting a fresh agent session each time.
3. Show that each session's injected context is specific to that repo — no leakage of Project A's
   Next Action into Project B's session.

**Record:** fast-cut terminal recording, `cd repo-a && <start agent>`, `cd repo-b && <start agent>`,
`cd repo-c && <start agent>`, snapshot changes every time.

**Caveat:** this relies on `project-progress/` living at each repo's root — it's project-local by
design, there is no shared global state file to accidentally cross-pollinate.

---

## 5. Pre-edit nudge — catching the skill-skip on casual requests

**Pain solved:** a user says something informal like "just add a login button," the agent jumps
straight to editing code and never checks `Tasks.md` / `Open Questions.md`, silently drifting away
from the tracked plan.

**Steps:**
1. In an initialized project, start a session and immediately ask for an informal one-off change
   (skip mentioning "progress" or "tasks" at all).
2. Let the agent attempt an `Edit` or `Write` on a project file.
3. The `PreToolUse` hook (`handlePreEdit` in `src/hook/cc-adapter.ts`) fires a one-time-per-session
   reminder to check `Tasks.md` / `Open Questions.md` before continuing.

**Record:** terminal showing the casual request, then the reminder `systemMessage` appearing right
before the first edit.

**Caveat:** it's once-per-session by design (uses the same session-state JSON as other hooks) —
don't expect it to repeat on every subsequent edit in the same session.

---

## 6. Forgot-to-log catch — flagging silent progress drift

**Pain solved:** the agent (or you) makes real code changes and just... never updates
`Progress.md`. Next session starts from stale state.

**Steps:**
1. In an initialized project, make a code change (edit any non-`project-progress/` file) and
   commit or just leave it in the working tree — don't touch `Progress.md`.
2. Trigger the `Stop` hook (end the agent turn/session).
3. It compares `git status --porcelain` against whether `project-progress/Progress.md` changed,
   and reminds you to update it since the tree changed but the tracker didn't.

**Record:** terminal — edit a file, end the session, show the Stop-hook reminder text.

**Caveat:** this is a nudge, not a blocker — it won't stop the session or refuse to exit, just
flags it.

---

## 7. Secret-scan catch — before it ever reaches git history

**Pain solved:** progress notes are meant to be human-readable summaries, but it's easy to
accidentally paste a real credential into them while writing a session log.

**Steps:**
1. Deliberately write something secret-shaped into a progress file for the demo, e.g. add a line
   `password: hunter2` to `project-progress/Progress.md`.
2. Trigger the `Stop` hook.
3. It runs `validateProgressFile` (`src/hook/validator.ts`, `SECRET_PATTERNS`) and flags
   `secret-like value` before you'd commit it.

**Record:** terminal — inject the fake secret line, run/trigger the hook, show the
`Progress file may contain secrets (...); remove them.` warning.

**Caveat:** pattern-based, not a full secret scanner — it catches obvious `password:`/`token:`
style assignments, not every possible credential shape. Say that explicitly in the README so
nobody treats it as a substitute for a real secret scanner.

---

## 8. Instant scaffold — zero to tracked in one command

**Pain solved:** setting up a consistent progress-tracking structure by hand (five files, correct
frontmatter, consistent sections) is exactly the kind of boilerplate nobody wants to write twice.

**Steps:**
```bash
npx awesome-progress-tracker init . --project "My Project"
```
or, testing from this repo directly:
```bash
node dist/src/cli.js init /path/to/some/repo --project "Demo Project"
```

**Record:** empty repo → run the command → `project-progress/` appears with all 5 files
(`Progress.md`, `Tasks.md`, `Decisions.md`, `Session Log.md`, `Open Questions.md`) already
populated with the project name and today's date substituted in.

**Caveat:** `init` refuses to overwrite an existing `project-progress/` unless you pass `--force`
— worth showing the refusal once so viewers know it's non-destructive by default.

---

## 9. Claude Code plugin install — one marketplace add, full feature set

**Pain solved:** wiring a skill + MCP server + three lifecycle hooks by hand across
`CLAUDE.md`/`~/.claude.json`/hook config is exactly the kind of setup friction that makes people
give up before trying a tool.

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

**Record:** the two commands running, then restart the session and show the skill, MCP tools, and
hooks all present (e.g., `claude plugin list` showing it installed and enabled).

**Caveat:** requires a session restart to reload — say so on screen, it's a one-time gotcha people
hit immediately.

---

## 10. Codex plugin install — same deal, Codex-native path

**Pain solved:** identical setup friction as #9, but for Codex, which has its own plugin/hook/MCP
config format (`.codex-plugin/plugin.json`, `.mcp.codex.json`, `hooks/hooks-codex.json`).

**Steps:**
```bash
codex plugin marketplace add AndriiLavrekha/awesome-progress-tracker
codex plugin add project-progress@awesome-progress-tracker
```

**Record:** the two commands, then `codex plugin list` confirming
`project-progress@awesome-progress-tracker` is installed and enabled.

**Caveat:** Codex does **not** auto-trust plugin-bundled hooks — the first time
`SessionStart`/`UserPromptSubmit`/`PreToolUse`/`Stop` fire, Codex prompts you to review and trust them. Show that
one-time trust prompt in the recording so it isn't mistaken for a bug.

---

## 11. `status` dashboard — is this actually wired up?

**Pain solved:** after any install, the natural next question is "did that actually work," and
digging through config files by hand to check is tedious.

**Steps:**
```bash
npx awesome-progress-tracker status
npx awesome-progress-tracker status -g codex
```

**Record:** run on a fully-configured repo (all fields `true`/present), then run again after
manually deleting one piece (e.g. remove the bootstrap block) to show the field flip to `false`.

**Caveat:** `status` reports per-agent (`-g claude` vs `-g codex`) — make sure the recording makes
clear which agent's state is being shown, since they're tracked independently.

---

## 12. `doctor` diagnostics — pinpointing what's broken, not just that something is

**Pain solved:** "it doesn't work" with no further detail is the most common support request for
any dev tool; `doctor` turns that into a concrete, itemized checklist.

**Steps:**
```bash
npx awesome-progress-tracker doctor
npx awesome-progress-tracker doctor -g codex --json
```

**Record:** intentionally break something first (e.g. delete `~/.codex/config.toml`'s MCP block,
or point `PROJECT_PROGRESS_ROOTS` at a directory that doesn't exist), run `doctor`, show the exact
failing check (`fail mcp: MCP config is missing`) and its label, then fix it and re-run to green.

**Caveat:** `doctor`'s exit code is `1` on any failing check — useful to mention for anyone who
wants to script it into CI or a setup script.

---

## 13. Clean `uninstall` — no residue left behind

**Pain solved:** a lot of dev tools leave orphaned config blocks behind after uninstall; trust in a
tool goes up a lot when removal is provably complete.

**Steps:**
```bash
npx awesome-progress-tracker install
npx awesome-progress-tracker status        # confirm installed
npx awesome-progress-tracker uninstall
npx awesome-progress-tracker status        # confirm removed
```

**Record:** the four commands back to back, with `status` output visibly flipping from
all-`true` to all-`false`/absent between the two runs. Optionally `git diff`/`diff` on
`~/.claude.json` before/after to show the managed block/JSON key is fully gone, not just commented
out.

**Caveat:** `uninstall --scope project` only removes the project-local `.mcp.json` entry, not the
global bootstrap — call out the distinction if you demo both scopes.

---

## 14. MCP `list_projects` — a dashboard across every tracked repo

**Pain solved:** with several repos each doing their own local tracking, there's no way to answer
"what am I working on across everything" without opening every one of them — until now.

**Steps:**
1. `init` 3+ repos so the local project index (`~/.awesome-progress-tracker/projects.json`) has
   entries.
2. Connect an MCP client to the server. For a standalone recording (outside Claude Code/Codex),
   the MCP Inspector is the easiest way to show raw tool calls on screen:
   ```bash
   PROJECT_PROGRESS_ROOTS="C:/path/to/repos-parent" npx @modelcontextprotocol/inspector node dist/src/mcp/server.js
   ```
3. Call `list_projects` (optionally with a `status` filter) and show the compact multi-project
   summary come back.

**Record:** MCP Inspector's tool-call panel — the `list_projects` request on the left, the
JSON/summary response with several projects on the right.

**Caveat:** `list_projects` reads the **cached index**, not a live filesystem scan — if a project
was just added, run `refresh_projects` first (#15) or the new one won't show up yet.

---

## 15. MCP `refresh_projects` — picking up a brand-new repo

**Pain solved:** the index is a cache for speed; without an explicit refresh tool, it would either
go stale forever or require a full rescan on every single read.

**Steps:**
1. With the MCP server already connected (see #14), `init` a brand-new project under one of the
   configured `PROJECT_PROGRESS_ROOTS`.
2. Call `list_projects` first — show the new project is *not* there yet.
3. Call `refresh_projects` — it rescans the configured roots for `project-progress/Progress.md`
   files.
4. Call `list_projects` again — the new project now appears.

**Record:** three sequential Inspector calls, with the "missing → refresh → present" progression
clearly visible.

**Caveat:** refresh scans configured roots only (`PROJECT_PROGRESS_ROOTS`), by design — projects
outside those roots never appear, no matter how many times you refresh. Worth a line in the README
so people don't assume it's a full-disk scan.

---

## 16. MCP `read_project_progress` — pull one project's state without opening it

**Pain solved:** checking "what's the status of Project X" shouldn't require opening an editor,
finding the repo, and reading a file by hand.

**Steps:** call `read_project_progress` with a project identifier (path or name from
`list_projects`) and show the compact, bounded summary returned — Resume Snapshot, Next Action,
Blockers, without the entire file's contents.

**Record:** Inspector call and response, or — better for a relatable demo — the same interaction
happening naturally inside a Claude Code/Codex chat where the agent calls the tool because you
asked "what's the status of my other project?"

**Caveat:** responses are intentionally bounded/truncated for token-conscious use — don't expect
(or demo) it returning full session logs; that's what reading the file directly is for.

---

## 17. MCP `update_project_progress` — remote writes without opening the file

**Pain solved:** routine progress updates (appending to Next Action, logging a milestone) are
exactly the kind of small edits that are annoying to do by hand across many repos, but easy for an
agent or automation to do via a typed tool call instead of raw file editing.

**Steps:** call `update_project_progress` to replace or append a named section (e.g. `Next Action`)
on a target project, then open that project's `Progress.md` and show the change landed.

**Record:** Inspector call with the section name/content in the request, cut to the Markdown file
now showing the new text.

**Caveat:** it replaces/appends a *named section*, not arbitrary regex edits — the write path
validates structure and rejects unsafe/oversized content by design, so don't demo it as a generic
file-editing tool.

---

## 18. MCP `mark_project_status` — flipping status from anywhere

**Pain solved:** frontmatter `status` (active/blocked/done) is the fastest signal for "should I
care about this project right now," but it rots if nobody ever flips it.

**Steps:** call `mark_project_status` with a new status (and optionally `last_milestone`), then
call `list_projects` again and show the status change reflected immediately in the dashboard.

**Record:** two-call sequence — `mark_project_status` then `list_projects` — status column visibly
different.

**Caveat:** this updates frontmatter only (`status`, `last_milestone`); it does not touch the
Resume Snapshot or other prose sections — pair it with #17 if the demo needs both a status flip
and a narrative update.

---

## 19. Privacy opt-out — keeping sensitive notes out of git history

**Pain solved:** progress notes for client work or anything confidential shouldn't end up
permanently in git history just because the tool defaults to committing them.

**Steps:**
1. In a project's `Progress.md` frontmatter, set `sensitivity: sensitive` or
   `commit_progress: false`.
2. Make an edit, run `git add -A` / `git status`.
3. Show that `project-progress/` either isn't staged, or — if using the Claude Code plugin's
   `PreToolUse` guard — that `git commit` is actively blocked while those files are staged.

**Record:** frontmatter toggle on screen, then `git status`/`git commit` behavior changing
accordingly.

**Caveat:** the tool doesn't gitignore sensitive projects automatically — the frontmatter is a
signal the agent and hooks respect; a human running raw `git add -A` outside agent-mediated
workflows can still stage it, so mention that boundary honestly rather than overselling it as
enforced privacy.

---

## 20. Stale-project detection — catching a tracker that's quietly rotted

**Pain solved:** a `Progress.md` that hasn't been touched in weeks while the repo has kept moving
is worse than no tracker at all — it actively misleads the next resume.

**Steps:**
1. Use (or recreate) the `tests/fixtures/stale-project/project-progress/Progress.md` fixture
   pattern: an old `updated:` frontmatter date next to recent git activity.
2. Run the freshness check path (`src/hook/freshness.ts` logic, exercised via the `Stop`/session
   hooks or the underlying test in `tests/hook/freshness.test.ts`) and show the staleness warning.

**Record:** the fixture's frontmatter date next to `git log -1` showing much more recent commits,
then the freshness warning firing.

**Caveat:** freshness is a nudge based on "meaningful work" heuristics, not a hard gate — it won't
block anything, just flags the mismatch so a human or agent chooses to update it.

---

## Recording matrix (quick reference)

| # | Best captured as |
| --- | --- |
| 1, 2, 3, 4 | Terminal-cast, agent session start/end |
| 5, 6, 7 | Terminal-cast, hook output snippet |
| 8, 9, 10, 11, 12, 13 | Terminal-cast, console-only |
| 14, 15, 16, 17, 18 | MCP Inspector (or in-chat tool call) screen recording |
| 19, 20 | Terminal-cast, frontmatter + git status/log side by side |
