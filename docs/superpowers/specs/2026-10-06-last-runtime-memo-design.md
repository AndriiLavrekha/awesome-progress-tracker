# Last Runtime Memo Design

## Goal

When you return to a project, `project-progress/Progress.md` tells you which
app's chat to reopen, and which agent, model, and effort that session used.
Today `agent_last_used` is a required free-text field. SessionStart does not
show it, and nothing records provider, model, or effort.

The memo is one current line. It is replaced when a session updates
`Progress.md`. Opening another app without updating progress leaves the line
alone.

## Scope

This design adds three optional frontmatter keys, a shared renderer, a
SessionStart line, a blank-provider fill inside the existing clean-handoff
write, skill and snippet instructions, a template default, one README bullet,
one glossary sentence, and ADR 0024.

`progress_schema_version` stays `1`. The new keys are not added to
`REQUIRED_FRONTMATTER`, so every existing `Progress.md` stays valid without
migration. An absent key means unknown.

## Exclusions

No history of earlier runtimes. Git and `Session Log.md` already keep narrative
history. No new MCP write tool. Agents already edit `Progress.md` frontmatter
directly. No schema-version bump. No error or block when the current app
differs from the memo. The line is information.

Benchmark fixtures and the test fixtures under `tests/fixtures/` are not
migrated. They stay valid because the keys are optional.

`commands/init.md` gains no new step. Init copies the template, which carries
the keys, and the skill's update rule covers the initializing session.

## Design

### Words

| Field | Meaning | Example |
| --- | --- | --- |
| `provider_last_used` | The app that holds the chat | `grok` |
| `agent_last_used` | The agent role or product agent name | `grok` |
| `model_last_used` | The model id | `grok-4.7` |
| `effort_last_used` | The effort name that host uses | `high` |
| `updated` | The date of that progress update | `2026-10-06` |

Provider slugs suggested in the skill: `claude-code`, `codex`, `grok`,
`cursor`, `chatgpt`, `hermes`, `gemini`, `copilot`. The list is not closed and
is not validated. The Claude Code manifest passes `claude-code`. The Codex
manifest passes `codex`. Those two strings are exact, so an agent in that host
and the hook write the same token.

### Frontmatter

```yaml
agent_last_used: grok
provider_last_used: grok
model_last_used: grok-4.7
effort_last_used: high
updated: 2026-10-06
```

`agent_last_used` and `updated` already exist. `provider_last_used`,
`model_last_used`, and `effort_last_used` join `OPTIONAL_FRONTMATTER` in
`src/hook/schema.ts`. Any parsed scalar is accepted. There is no enum and no
pattern check, matching `session_id`.

`parseFrontmatter` yields `string | boolean | number`. `renderLastRuntime` and
the Stop fill both coerce with `String(...)` before any trim or compare, so a
boolean or integer never throws and cannot drop the rest of the SessionStart
context. After that coercion, a value is unknown when it is missing, blank
after trim, or `unknown` in any letter case. `Unknown` and `UNKNOWN` are
unknown. `parseScalar` strips one pair of matching quotes before either caller
sees the value, so `provider_last_used: "unknown"` and
`provider_last_used: 'unknown'` are unknown too. `true`, `false`, and integer
tokens stay known and display as `String(...)` of the parsed value (`true`,
`false`, `10`). The skill still tells the agent to write the bare token
`unknown`.

The template `templates/project-progress/Progress.md` sets the three new keys
to `unknown` so a new project shows the slots. Those defaults do not produce a
SessionStart line.

### Who writes

The agent writes all five fields in the same edit that updates `Progress.md`
for a meaningful checkpoint. Each value comes from that session's own context.
A value the session cannot see is `unknown`. The five fields are replaced
together. A previous session's model or effort is not kept. Each stored value
is one unquoted YAML scalar: no newline and no `#`. Slashes, dots, and hyphens
in a model id are fine. The tracker does not add a quoting layer.

The stop hook fills `provider_last_used` only, and only inside the existing
`bestEffortRecordSessionEnd` write. That write already runs only when Stop has
seen git changes outside `project-progress/` and the progress body is fresh.
This design does not add a new reason for Stop to write the file. A session
that updates only `Progress.md` still records the memo, because the agent
wrote it. If that session left the provider unknown, the hook does not invent
a later write to fill it.

The fill runs when the caller passed a provider and the current value is
unknown. It uses `replaceFrontmatterValue`, which adds the key when it is
absent. It does not change `agent_last_used`, `model_last_used`,
`effort_last_used`, or `updated`. A failed atomic write swallows the whole
handoff stamp, provider included, as it does today.

SessionStart does not write these fields.

### How the hook learns the provider

`src/hook/cc-adapter.ts` `main` reads an optional `--provider <slug>` after the
subcommand. The slug must match `^[a-z0-9][a-z0-9-]{0,40}$`. A missing or
invalid slug disables the fill and does not fail the hook.

`hooks/hooks.json` Stop command appends `--provider claude-code`.
`hooks/hooks-codex.json` Stop command appends `--provider codex`. The first
token after `cc-adapter.js` stays `stop` or `stop-soft`, so the existing
subcommand-set assertions keep passing. SessionStart commands do not gain the
flag. `runHook` passes the slug only into `handleStop`.

### What you see

`renderLastRuntime` lives in `src/mcp/markdown.ts` so the hook can import it
without the MCP layer importing the hook. It takes parsed frontmatter and
returns either `""` or one line:

```text
Last runtime: provider grok · agent grok · model grok-4.7 · effort high · updated 2026-10-06
```

The line is emitted only when at least one of `provider_last_used`,
`model_last_used`, and `effort_last_used` is known. `agent_last_used` and
`updated` are included when they are known, and they do not trigger the line
on their own. A legacy file with only `agent_last_used: claude` stays quiet.

Order is provider, agent, model, effort, updated. Unknown parts are omitted.
The separator is ` · `. Each displayed value is at most 80 characters. A longer
value is shown as its first 79 characters plus `…`. The stored value is not
cut.

SessionStart inserts the line, when non-empty, immediately after the
`Project: … | Status: … | Updated: …` line and before drift, the handoff
warning, and the Resume Snapshot.

`parseProjectSummary` sets `lastRuntime` on `ProjectSummary` to that same
string, or `""`. `boundProjectSummaries` truncates it like the other strings.
`compactProjectListItem` and the generated `Projects.md` table do not include
it. `read_project_progress` returns the indexed summary, so `lastRuntime`
appears there on the same freshness as `resumeSnapshot`. A missing
`lastRuntime` on an older index entry is read as `""`.

### Instructions

`skills/project-progress/SKILL.md`, under What To Update, tells the agent to
set the five fields on every meaningful `Progress.md` update, with the
definitions and the slug examples above, and to write `unknown` rather than
guess.

`agent-instructions/AGENTS-snippet.md` and
`agent-instructions/CLAUDE-snippet.md` each gain one sentence: when updating
`Progress.md`, set `provider_last_used`, `agent_last_used`, `model_last_used`,
and `effort_last_used`, using `unknown` for anything this session cannot see.

README Features gains one bullet: `Progress.md` records the provider, agent,
model, and effort of the session that last updated it, and SessionStart
repeats that line.

`docs/glossary.md` defines "Last runtime" as that one line.

ADR 0024 records the decision: one current runtime memo, optional frontmatter,
agent-written on progress update, hook fills a blank provider only inside the
clean-handoff write.

## Testing

Behavior to lock in:

- The three keys are optional. Files with them and files without them
  validate. An arbitrary slug such as `some-new-app` validates.
- SessionStart with a known provider, model, and effort emits the exact line
  after the project status line and before the Resume Snapshot.
- SessionStart omits unknown parts, emits nothing when the three new fields
  are absent or unknown, and emits nothing for a legacy `agent_last_used`
  alone.
- A displayed value longer than 80 characters is cut to 79 plus `…`.
- SessionStart does not write `provider_last_used`.
- A fresh-body Stop with an unknown provider and `--provider claude-code`
  writes `provider_last_used: claude-code` in the same write as
  `handoff: clean`.
- A fresh-body Stop leaves a known provider such as `grok` unchanged.
- A stale-body Stop does not write the provider.
- On a fresh-body Stop, blank, any letter-case of `unknown`, and a quoted
  `"unknown"` or `'unknown'` are filled. An invalid slug is not written.
- A boolean `true` or an integer provider is displayed with `String(...)` and
  is not filled. Neither the renderer nor the fill calls `.trim()` on the raw
  parsed scalar.
- `session-start --provider claude-code` does not write the provider.
- The Claude Stop command contains `--provider claude-code`. The Codex Stop
  command contains `--provider codex`. Neither SessionStart command contains
  `--provider`.
- `parseProjectSummary` sets `lastRuntime`, and the compact project list does
  not include it.
- Every `ProjectSummary` object literal typechecks with `lastRuntime`. The
  known constructors are `summary()` in `tests/mcp/index.test.ts`,
  `indexSummary()` in `tests/mcp/server.test.ts`, and the inline array in that
  file's bounded-summary test. Default the field to `""`.
- The skill and both snippets contain `provider_last_used`.

## Files

- `src/hook/schema.ts`
- `src/mcp/markdown.ts`
- `src/mcp/schema.ts`
- `src/mcp/server.ts`
- `src/hook/cc-adapter.ts`
- `hooks/hooks.json`
- `hooks/hooks-codex.json`
- `templates/project-progress/Progress.md`
- `skills/project-progress/SKILL.md`
- `agent-instructions/AGENTS-snippet.md`
- `agent-instructions/CLAUDE-snippet.md`
- `README.md`
- `docs/glossary.md`
- `docs/adr/0024-last-runtime-memo.md`
- `tests/hook/schema.test.ts`
- `tests/plugin/cc-adapter.test.ts`
- `tests/plugin/manifests.test.ts`
- `tests/hook/instruction-pack.test.ts`
- `tests/mcp/markdown.test.ts`
- `tests/mcp/server.test.ts`
- `tests/mcp/index.test.ts`
