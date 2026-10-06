# Last Runtime Memo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record the provider, agent, model, and effort of the session that last updated `Progress.md`, and show that as one line at the next session start.

**Architecture:** Three optional frontmatter keys join the existing `agent_last_used` and `updated`. `renderLastRuntime` in `src/mcp/markdown.ts` turns parsed frontmatter into the line or `""`. SessionStart prints that line. The Stop hook fills a blank `provider_last_used` only inside the existing clean-handoff write, and only with a slug passed by the manifest. The agent writes the fields when it updates progress. The skill, snippets, template, README, glossary, and ADR 0024 say so.

**Tech Stack:** TypeScript ESM with `.js` import specifiers, Vitest, Node built-ins, existing hook adapter and MCP summary types. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-06-last-runtime-memo-design.md`

## Global Constraints

- `progress_schema_version` stays `1`. The new keys are not added to `REQUIRED_FRONTMATTER`. An absent key means unknown.
- No enum and no pattern check on the stored values. Any parsed scalar is accepted.
- `parseFrontmatter` yields `string | boolean | number` and strips one pair of matching quotes. Callers coerce with `String(...)` before trim or compare. They never call `.trim()` on the raw scalar.
- After that coercion, unknown means missing, blank after trim, or `unknown` in any letter case. Quoted `"unknown"` and `'unknown'` are unknown because the quotes are already gone.
- `true`, `false`, and integer tokens, including `0`, stay known and display as `String(...)` of the parsed value (`true`, `false`, `10`, `0`).
- The line is emitted only when at least one of `provider_last_used`, `model_last_used`, and `effort_last_used` is known. `agent_last_used` and `updated` do not trigger it. Unknown parts are omitted. Order is provider, agent, model, effort, updated. Separator is ` · `.
- Each displayed value is at most 80 characters: the first 79 plus `…` when longer. The stored value is not cut.
- The Stop fill runs only inside `bestEffortRecordSessionEnd`, which already requires git changes outside `project-progress/` and a fresh progress body. Do not add a new reason for Stop to write the file.
- A provider slug matches `^[a-z0-9][a-z0-9-]{0,40}$`. Anything else disables the fill and does not fail the hook. The fill does not change `agent_last_used`, `model_last_used`, `effort_last_used`, or `updated`.
- Claude Code's Stop command passes `--provider claude-code`. Codex's passes `--provider codex`. SessionStart commands do not. SessionStart does not write these fields.
- No runtime history, no new MCP write tool, no schema bump, no block when the current app differs, no fixture migration, no `commands/init.md` change.

## Review Focus

These are the inputs most likely to be implemented almost right and still be wrong. Each one has a test in the task that owns the code.

- A progress-only body edit must not fill the provider. Stop returns before the handoff write when `gitHasChanges` is false, and changes under `project-progress/` do not count. Expected: `provider_last_used` stays unknown and `handoff` stays `interrupted`. Task 3.
- Quoted `"unknown"`, `'unknown'`, `UNKNOWN`, and a quoted string of spaces are unknown and get filled. `false`, `0`, and `10` are known, are displayed with `String(...)`, and are not filled. Task 1 asserts the display. Task 3 asserts the fill.
- An 81-character model displays as 79 characters plus `…` and the stored frontmatter is unchanged. Task 1 asserts the renderer. Task 2 asserts SessionStart does not rewrite the file's model.
- A known model with an unknown provider still emits the line and omits the provider. A legacy file with only `agent_last_used` emits nothing. Task 1 and Task 2.
- A fresh-body Stop with a known provider `grok` leaves `grok`, the model, the effort, the agent, and `updated` unchanged. An invalid slug such as `Claude Code` writes nothing. Task 3.

## File Structure

- `src/mcp/markdown.ts` owns `isKnownRuntimeValue` and `renderLastRuntime`. The hook imports them. MCP does not import the hook.
- `src/mcp/schema.ts` adds `lastRuntime: string` to `ProjectSummary`. `parseProjectSummary` sets it. `boundProjectSummaries` truncates it. The project list and `Projects.md` do not show it.
- `src/hook/schema.ts` registers the three optional keys. It does not validate their contents.
- `src/hook/cc-adapter.ts` prints the line in `handleSessionStart`, parses `--provider` in `main`, and fills a blank provider inside `bestEffortRecordSessionEnd`.
- `hooks/hooks.json` and `hooks/hooks-codex.json` pass the slug on Stop only.
- `templates/project-progress/Progress.md`, `skills/project-progress/SKILL.md`, `agent-instructions/AGENTS-snippet.md`, `agent-instructions/CLAUDE-snippet.md`, `README.md`, `docs/glossary.md`, and `docs/adr/0024-last-runtime-memo.md` are the human and agent instructions.
- Tests stay next to the code they cover: `tests/hook/schema.test.ts`, `tests/mcp/markdown.test.ts`, `tests/mcp/server.test.ts`, `tests/mcp/index.test.ts`, `tests/plugin/cc-adapter.test.ts`, `tests/plugin/manifests.test.ts`, `tests/hook/instruction-pack.test.ts`.

---

### Task 1: Runtime line and summary field

**Files:**
- Modify: `src/hook/schema.ts` (`OPTIONAL_FRONTMATTER`)
- Modify: `src/mcp/markdown.ts` (add `isKnownRuntimeValue`, `renderLastRuntime`; set `lastRuntime` in `parseProjectSummary`)
- Modify: `src/mcp/schema.ts` (`ProjectSummary.lastRuntime`)
- Modify: `src/mcp/server.ts` (`boundProjectSummaries`, around the field mapping near line 121)
- Modify: `tests/hook/schema.test.ts`
- Modify: `tests/mcp/markdown.test.ts`
- Modify: `tests/mcp/index.test.ts` (`summary()`, lines 14-30)
- Modify: `tests/mcp/server.test.ts` (`indexSummary()` lines 27-43, and the inline array near line 175)
- Test: `tests/hook/schema.test.ts`, `tests/mcp/markdown.test.ts`, `tests/mcp/server.test.ts`

**Interfaces:**
- Consumes: `parseFrontmatter` / `parseScalar` in `src/mcp/markdown.ts`. `OPTIONAL_FRONTMATTER` in `src/hook/schema.ts`. `ProjectSummary` in `src/mcp/schema.ts`.
- Produces:
  - `export function isKnownRuntimeValue(value: string | boolean | number | undefined): string | null`
  - `export function renderLastRuntime(frontmatter: Record<string, string | boolean | number | undefined>): string`
  - `ProjectSummary.lastRuntime: string`
  - `parseProjectSummary` sets `lastRuntime` to `renderLastRuntime(frontmatter)`

- [ ] **Step 1: Write the failing tests**

Add this describe block to `tests/hook/schema.test.ts`:

```ts
describe("last runtime frontmatter", () => {
  it("registers the three runtime keys as optional and accepts any scalar", () => {
    expect(OPTIONAL_FRONTMATTER).toContain("provider_last_used");
    expect(OPTIONAL_FRONTMATTER).toContain("model_last_used");
    expect(OPTIONAL_FRONTMATTER).toContain("effort_last_used");
    expect(validateFrontmatter(baseFrontmatter())).toEqual([]);
    expect(
      validateFrontmatter(
        baseFrontmatter({
          provider_last_used: "some-new-app",
          model_last_used: "grok-4.7",
          effort_last_used: "high"
        })
      )
    ).toEqual([]);
    expect(validateFrontmatter(baseFrontmatter({ provider_last_used: true, model_last_used: 10 }))).toEqual([]);
  });
});
```

In `tests/mcp/markdown.test.ts`, import `parseFrontmatter` and `renderLastRuntime` from `../../src/mcp/markdown.js` and add:

```ts
describe("renderLastRuntime", () => {
  it("renders the full line in field order", () => {
    expect(
      renderLastRuntime({
        provider_last_used: "grok",
        agent_last_used: "grok",
        model_last_used: "grok-4.7",
        effort_last_used: "high",
        updated: "2026-10-06"
      })
    ).toBe("Last runtime: provider grok · agent grok · model grok-4.7 · effort high · updated 2026-10-06");
  });

  it("omits unknown parts and stays quiet when none of the three new fields is known", () => {
    expect(
      renderLastRuntime({
        provider_last_used: "UNKNOWN",
        agent_last_used: "grok",
        model_last_used: "grok-4.7",
        effort_last_used: "   ",
        updated: "2026-10-06"
      })
    ).toBe("Last runtime: agent grok · model grok-4.7 · updated 2026-10-06");
    expect(renderLastRuntime({ agent_last_used: "claude", updated: "2026-08-20" })).toBe("");
    expect(
      renderLastRuntime({
        provider_last_used: "unknown",
        model_last_used: "Unknown",
        effort_last_used: ""
      })
    ).toBe("");
  });

  it("treats quoted unknown as unknown and displays booleans and integers", () => {
    const quoted = parseFrontmatter('---\nprovider_last_used: "unknown"\nmodel_last_used: grok-4\n---\n');
    expect(renderLastRuntime(quoted)).toBe("Last runtime: model grok-4");
    const single = parseFrontmatter("---\nprovider_last_used: 'unknown'\neffort_last_used: high\n---\n");
    expect(renderLastRuntime(single)).toBe("Last runtime: effort high");
    const scalars = parseFrontmatter("---\nprovider_last_used: false\nmodel_last_used: 0\n---\n");
    expect(renderLastRuntime(scalars)).toBe("Last runtime: provider false · model 0");
    const ten = parseFrontmatter("---\nprovider_last_used: 10\n---\n");
    expect(renderLastRuntime(ten)).toBe("Last runtime: provider 10");
  });

  it("cuts a displayed value to 79 characters plus an ellipsis", () => {
    const model = "m".repeat(81);
    expect(renderLastRuntime({ model_last_used: model })).toBe(`Last runtime: model ${"m".repeat(79)}…`);
  });

  it("sets lastRuntime on the project summary", () => {
    const markdown = `---
project: MCP Fixture
progress_schema_version: 1
status: active
path: C:/repo
agent_last_used: codex
provider_last_used: grok
model_last_used: grok-4.7
updated: 2026-06-26
last_milestone: parser test
deployed: false
deployment_url:
sensitivity: normal
commit_progress: true
---

# MCP Fixture

## Resume Snapshot

Compact summary.

## Next Action

Continue.

## Blockers

None.
`;
    const summary = parseProjectSummary(markdown, "C:/repo/project-progress/Progress.md");
    expect(summary.lastRuntime).toBe(
      "Last runtime: provider grok · agent codex · model grok-4.7 · updated 2026-06-26"
    );
    expect(parseProjectSummary("---\nproject: Quiet\nstatus: active\n---\n", "C:/repo/project-progress/Progress.md").lastRuntime).toBe("");
  });
});
```

In `tests/mcp/server.test.ts`, extend the existing "caps project summaries and truncates long compact fields" test after `boundProjectSummaries(...)`:

```ts
expect(bounded[0].lastRuntime).toBe("abcdefghi...");
expect("lastRuntime" in compactProjectListItem(indexSummary({}))).toBe(false);
const missingRuntime = boundProjectSummaries([
  { ...indexSummary({}), lastRuntime: undefined as never }
]);
expect(missingRuntime[0].lastRuntime).toBe("");
```

The inline summaries in that test must include `lastRuntime: longText` once the field exists. Do not add it in this step. The test file will not typecheck until Step 3, and the new `lastRuntime` expectation fails until Step 3 because the field is missing.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/hook/schema.test.ts tests/mcp/markdown.test.ts tests/mcp/server.test.ts`

Expected: FAIL. `OPTIONAL_FRONTMATTER` does not contain `provider_last_used`. `renderLastRuntime` is not exported from `src/mcp/markdown.ts`, so `tests/mcp/markdown.test.ts` fails to load.

- [ ] **Step 3: Write the minimal implementation**

In `src/hook/schema.ts`, add the three keys to `OPTIONAL_FRONTMATTER` after `handoff`:

```ts
  "session_id",
  "handoff",
  "provider_last_used",
  "model_last_used",
  "effort_last_used",
  ...GATE_KEYS
```

Do not add a validation branch for them.

In `src/mcp/schema.ts`, add `lastRuntime: string` to `ProjectSummary` after `blockers`.

In `src/mcp/markdown.ts`, add this above `parseProjectSummary` and set the field inside the returned object:

```ts
const RUNTIME_PARTS = [
  ["provider", "provider_last_used"],
  ["agent", "agent_last_used"],
  ["model", "model_last_used"],
  ["effort", "effort_last_used"],
  ["updated", "updated"]
] as const;

const RUNTIME_TRIGGERS = ["provider_last_used", "model_last_used", "effort_last_used"] as const;

export function isKnownRuntimeValue(value: string | boolean | number | undefined): string | null {
  if (value === undefined) return null;
  const text = String(value).trim();
  if (text === "" || text.toLowerCase() === "unknown") return null;
  return text;
}

function displayRuntimeValue(value: string): string {
  if (value.length <= 80) return value;
  return `${value.slice(0, 79)}…`;
}

export function renderLastRuntime(
  frontmatter: Record<string, string | boolean | number | undefined>
): string {
  const triggered = RUNTIME_TRIGGERS.some((key) => isKnownRuntimeValue(frontmatter[key]) !== null);
  if (!triggered) return "";
  const parts: string[] = [];
  for (const [label, key] of RUNTIME_PARTS) {
    const known = isKnownRuntimeValue(frontmatter[key]);
    if (known) parts.push(`${label} ${displayRuntimeValue(known)}`);
  }
  return `Last runtime: ${parts.join(" · ")}`;
}
```

Inside `parseProjectSummary`'s returned object:

```ts
    blockers: extractSection(markdown, "Blockers"),
    lastRuntime: renderLastRuntime(frontmatter)
```

In `src/mcp/server.ts`, inside the object returned by `boundProjectSummaries`, add:

```ts
    blockers: boundString(project.blockers, maxStringLength),
    lastRuntime: boundString(project.lastRuntime, maxStringLength)
```

`boundString` already turns `undefined` into `""`, so an older index entry without the field displays as empty.

Add `lastRuntime: ""` to the object returned by `summary()` in `tests/mcp/index.test.ts` and by `indexSummary()` in `tests/mcp/server.test.ts`. Add `lastRuntime: longText` to the inline `ProjectSummary` array in the bounded-summary test.

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run tests/hook/schema.test.ts tests/mcp/markdown.test.ts tests/mcp/server.test.ts tests/mcp/index.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0. If typecheck reports another `ProjectSummary` literal missing `lastRuntime`, add `lastRuntime: ""` there. Do not make the field optional.

- [ ] **Step 5: Commit**

```text
git add src/hook/schema.ts src/mcp/markdown.ts src/mcp/schema.ts src/mcp/server.ts tests/hook/schema.test.ts tests/mcp/markdown.test.ts tests/mcp/server.test.ts tests/mcp/index.test.ts
git commit -m "feat: render the last runtime line"
```

### Task 2: SessionStart shows the line and does not write it

**Files:**
- Modify: `src/hook/cc-adapter.ts` (`handleSessionStart`, the `lines` array near line 267)
- Test: `tests/plugin/cc-adapter.test.ts`

**Interfaces:**
- Consumes: `renderLastRuntime(frontmatter)` from `src/mcp/markdown.ts`. `handleSessionStart` already calls `parseFrontmatter`.
- Produces: SessionStart `additionalContext` contains the runtime line, when non-empty, immediately after the `Project:` status line and before drift, the handoff warning, and `Resume Snapshot:`. SessionStart does not add or change `provider_last_used`, `model_last_used`, or `effort_last_used`.

- [ ] **Step 1: Write the failing test**

Add this describe block to `tests/plugin/cc-adapter.test.ts`. `progressDoc`, `makeRepo`, `writeProgress`, `withTrackerHome`, and `commitAll` already exist in that file.

```ts
describe("cc-adapter last runtime", () => {
  it("injects the runtime line after the project status and before the snapshot", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      const model = "m".repeat(81);
      const file = await writeProgress(
        dir,
        progressDoc({
          project: "Runtime",
          provider_last_used: "grok",
          agent_last_used: "grok",
          model_last_used: model,
          effort_last_used: "unknown",
          updated: "2026-10-06"
        })
      );
      await commitAll(dir, "init");

      const result = await handleSessionStart({ cwd: dir, session_id: "runtime-one" });
      const context = JSON.parse(result.stdout!).hookSpecificOutput.additionalContext as string;
      const line = `Last runtime: provider grok · agent grok · model ${"m".repeat(79)}… · updated 2026-10-06`;
      expect(context).toContain(line);
      expect(context.indexOf(line)).toBeGreaterThan(context.indexOf("Project:"));
      expect(context.indexOf(line)).toBeLessThan(context.indexOf("Resume Snapshot:"));

      const frontmatter = parseFrontmatter(await fs.readFile(file, "utf-8"));
      expect(frontmatter.provider_last_used).toBe("grok");
      expect(frontmatter.model_last_used).toBe(model);
      expect(frontmatter.effort_last_used).toBe("unknown");
    });
  });

  it("stays quiet for a legacy file and for unknown runtime fields", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      await writeProgress(dir, progressDoc({ project: "Legacy", agent_last_used: "claude", updated: "2026-08-20" }));
      await commitAll(dir, "init");

      const legacy = await handleSessionStart({ cwd: dir, session_id: "runtime-legacy" });
      expect(JSON.parse(legacy.stdout!).hookSpecificOutput.additionalContext).not.toContain("Last runtime:");
    });
  });

  it("shows a model-only line and a boolean provider without rewriting them", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      const file = await writeProgress(
        dir,
        progressDoc({ project: "Scalars", provider_last_used: "false", model_last_used: "grok-4.7" })
      );
      await commitAll(dir, "init");

      const result = await handleSessionStart({ cwd: dir, session_id: "runtime-bool" });
      const context = JSON.parse(result.stdout!).hookSpecificOutput.additionalContext as string;
      expect(context).toContain("Last runtime: provider false · model grok-4.7");
      const frontmatter = parseFrontmatter(await fs.readFile(file, "utf-8"));
      expect(frontmatter.provider_last_used).toBe(false);
      expect(frontmatter.model_last_used).toBe("grok-4.7");
    });
  });

  it("shows a model-only line and omits an unknown provider", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      await writeProgress(
        dir,
        progressDoc({
          project: "ModelOnly",
          provider_last_used: "unknown",
          model_last_used: "grok-4.7",
          effort_last_used: "unknown"
        })
      );
      await commitAll(dir, "init");

      const result = await handleSessionStart({ cwd: dir, session_id: "runtime-model" });
      const context = JSON.parse(result.stdout!).hookSpecificOutput.additionalContext as string;
      expect(context).toContain("Last runtime: model grok-4.7");
      expect(context).not.toContain("provider unknown");
    });
  });
});
```

`progressDoc` writes values raw, so `provider_last_used: "false"` becomes the YAML token `false`, which `parseScalar` returns as a boolean.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/plugin/cc-adapter.test.ts -t "cc-adapter last runtime"`

Expected: FAIL. The context does not contain `Last runtime:`.

- [ ] **Step 3: Write the minimal implementation**

Import `renderLastRuntime` from `../mcp/markdown.js` next to the existing `parseFrontmatter` import.

In `handleSessionStart`, immediately after the `lines` array is created and before the drift block, add:

```ts
  const runtime = renderLastRuntime(frontmatter);
  if (runtime) lines.push(`\n${runtime}`);
```

Do not write `provider_last_used`, `model_last_used`, or `effort_last_used` anywhere in `handleSessionStart` or `bestEffortMarkHandoff`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/plugin/cc-adapter.test.ts -t "cc-adapter last runtime"`

Expected: PASS.

- [ ] **Step 5: Commit**

```text
git add src/hook/cc-adapter.ts tests/plugin/cc-adapter.test.ts
git commit -m "feat: show last runtime at session start"
```

### Task 3: Stop fills a blank provider

**Files:**
- Modify: `src/hook/cc-adapter.ts` (`HandleStopOptions`, `bestEffortRecordSessionEnd`, `handleStop`, `runHook`, `main`)
- Modify: `hooks/hooks.json` (Stop command)
- Modify: `hooks/hooks-codex.json` (Stop command)
- Test: `tests/plugin/cc-adapter.test.ts`
- Test: `tests/plugin/manifests.test.ts`

**Interfaces:**
- Consumes: `isKnownRuntimeValue` from `src/mcp/markdown.ts`. `replaceFrontmatterValue` from `src/mcp/writer.ts`. `bestEffortRecordSessionEnd(cwd, progressPath, now)` in `src/hook/cc-adapter.ts`.
- Produces:
  - `export function normalizeProviderSlug(value: string | undefined): string | undefined`
  - `export function providerFromArgv(argv: string[]): string | undefined`
  - `HandleStopOptions.provider?: string`
  - `runHook(sub, event, options?: { provider?: string })`
  - `bestEffortRecordSessionEnd` gains an optional fourth argument `provider?: string` and fills `provider_last_used` only when the slug is valid and the current value is unknown.

- [ ] **Step 1: Write the failing tests**

Add these tests inside the `cc-adapter last runtime` describe from Task 2. Import `providerFromArgv` and `runHook` from `../../src/hook/cc-adapter.js`.

```ts
  async function freshStop(
    fields: Record<string, string>,
    provider: string | undefined,
    changeBody: boolean,
    extraFile: boolean
  ): Promise<{ frontmatter: Record<string, string | boolean | number>; code: number }> {
    const dir = await makeRepo();
    const file = await writeProgress(dir, progressDoc({ project: "Fill", ...fields }));
    await commitAll(dir, "init");
    if (extraFile) await fs.writeFile(path.join(dir, "src.txt"), "work", "utf-8");
    const sessionId = `fill-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await handleSessionStart({ cwd: dir, session_id: sessionId });
    if (changeBody) {
      const current = await fs.readFile(file, "utf-8");
      await fs.writeFile(file, current.replace("Wire the widget.", "Ship the widget."), "utf-8");
    }
    const result = await handleStop(
      { cwd: dir, session_id: sessionId },
      provider === undefined ? {} : { provider }
    );
    return { frontmatter: parseFrontmatter(await fs.readFile(file, "utf-8")), code: result.code };
  }

  it("fills an unknown provider on a fresh stop and leaves the other runtime fields", async () => {
    await withTrackerHome(async () => {
      const filled = await freshStop(
        {
          provider_last_used: "unknown",
          agent_last_used: "grok",
          model_last_used: "grok-4.7",
          effort_last_used: "high",
          updated: "2026-10-06"
        },
        "claude-code",
        true,
        true
      );
      expect(filled.frontmatter.handoff).toBe("clean");
      expect(filled.frontmatter.provider_last_used).toBe("claude-code");
      expect(filled.frontmatter.agent_last_used).toBe("grok");
      expect(filled.frontmatter.model_last_used).toBe("grok-4.7");
      expect(filled.frontmatter.effort_last_used).toBe("high");
      expect(filled.frontmatter.updated).toBe("2026-10-06");
    });
  });

  it("fills blank, any letter-case, quoted unknown, and quoted spaces", async () => {
    await withTrackerHome(async () => {
      for (const provider of ["", "UNKNOWN", '"unknown"', "'unknown'", '"   "']) {
        const filled = await freshStop({ provider_last_used: provider }, "codex", true, true);
        expect(filled.frontmatter.provider_last_used).toBe("codex");
      }
      const missing = await freshStop({}, "codex", true, true);
      expect(missing.frontmatter.provider_last_used).toBe("codex");
    });
  });

  it("keeps a known provider, including false and integers, and ignores an invalid slug", async () => {
    await withTrackerHome(async () => {
      const kept = await freshStop(
        {
          provider_last_used: "grok",
          model_last_used: "grok-4.7",
          effort_last_used: "high",
          agent_last_used: "grok",
          updated: "2026-10-06"
        },
        "claude-code",
        true,
        true
      );
      expect(kept.frontmatter.provider_last_used).toBe("grok");
      expect(kept.frontmatter.model_last_used).toBe("grok-4.7");

      const boolProvider = await freshStop({ provider_last_used: "false" }, "claude-code", true, true);
      expect(boolProvider.frontmatter.provider_last_used).toBe(false);
      const zero = await freshStop({ provider_last_used: "0" }, "claude-code", true, true);
      expect(zero.frontmatter.provider_last_used).toBe(0);
      const ten = await freshStop({ provider_last_used: "10" }, "claude-code", true, true);
      expect(ten.frontmatter.provider_last_used).toBe(10);

      const invalid = await freshStop({ provider_last_used: "unknown" }, "Claude Code", true, true);
      expect(invalid.frontmatter.provider_last_used).toBe("unknown");
    });
  });

  it("does not fill when the body is stale or when only progress files changed", async () => {
    await withTrackerHome(async () => {
      const stale = await freshStop({ provider_last_used: "unknown" }, "claude-code", false, true);
      expect(stale.frontmatter.handoff).toBe("interrupted");
      expect(stale.frontmatter.provider_last_used).toBe("unknown");

      const progressOnly = await freshStop({ provider_last_used: "unknown" }, "claude-code", true, false);
      expect(progressOnly.frontmatter.handoff).toBe("interrupted");
      expect(progressOnly.frontmatter.provider_last_used).toBe("unknown");
    });
  });

  it("ignores a provider flag on session start", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      const file = await writeProgress(dir, progressDoc({ project: "NoStartWrite" }));
      await commitAll(dir, "init");

      await runHook("session-start", { cwd: dir, session_id: "runtime-start" }, { provider: "claude-code" });

      expect(parseFrontmatter(await fs.readFile(file, "utf-8")).provider_last_used).toBeUndefined();
      expect(providerFromArgv(["--provider", "claude-code"])).toBe("claude-code");
      expect(providerFromArgv(["--provider", "Claude Code"])).toBeUndefined();
      expect(providerFromArgv(["--provider"])).toBeUndefined();
      expect(providerFromArgv([])).toBeUndefined();
    });
  });
```

Add this test to the Claude describe in `tests/plugin/manifests.test.ts`, and the Codex twin in the Codex describe:

```ts
  it("passes the runtime provider only on Stop", async () => {
    const hooks = await readJson("hooks/hooks.json");
    const commands: string[] = [];
    for (const groups of Object.values<any>(hooks.hooks)) {
      for (const group of groups) {
        for (const hook of group.hooks) commands.push(hook.command);
      }
    }
    const stop = commands.find((command) => /cc-adapter\.js"?\s+stop\b/.test(command));
    expect(stop).toContain("--provider claude-code");
    expect(commands.filter((command) => command.includes("session-start")).every((command) => !command.includes("--provider"))).toBe(true);
  });
```

Codex copy reads `hooks/hooks-codex.json`, matches `stop-soft`, and expects `--provider codex`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/plugin/cc-adapter.test.ts tests/plugin/manifests.test.ts -t "fills an unknown provider|passes the runtime provider|ignores a provider flag"`

Expected: FAIL. `handleStop` has no `provider` option, so the provider stays `unknown`. The Stop command does not contain `--provider`. `providerFromArgv` is not exported.

- [ ] **Step 3: Write the minimal implementation**

Add to `src/hook/cc-adapter.ts`:

```ts
export function normalizeProviderSlug(value: string | undefined): string | undefined {
  if (!value || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(value)) return undefined;
  return value;
}

export function providerFromArgv(argv: string[]): string | undefined {
  const index = argv.indexOf("--provider");
  if (index === -1) return undefined;
  return normalizeProviderSlug(argv[index + 1]);
}
```

Import `isKnownRuntimeValue` from `../mcp/markdown.js`.

Extend `HandleStopOptions`:

```ts
  allowBlock?: boolean;
  provider?: string;
```

Change `bestEffortRecordSessionEnd` to accept `provider?: string` as the fourth parameter. After the checkpoint fields are applied and before `writeFileAtomic`, add:

```ts
    const slug = normalizeProviderSlug(provider);
    if (slug && isKnownRuntimeValue(parseFrontmatter(markdown).provider_last_used) === null) {
      updated = replaceFrontmatterValue(updated, "provider_last_used", slug);
    }
```

Use the markdown read at the start of the function, not `updated`, so the decision sees the pre-stamp value. `replaceFrontmatterValue` adds the key when it is absent.

In `handleStop`, pass the provider into the existing fresh-body call:

```ts
    const recorded = await bestEffortRecordSessionEnd(cwd, progressPath, new Date(), options.provider);
```

Do not call `bestEffortRecordSessionEnd` from the stale branch or from the `gitHasChanges` early return.

Change `runHook` to `runHook(sub, event, options: { provider?: string } = {})`. Pass `options.provider` only in the `stop` and `stop-soft` cases:

```ts
      case "stop":
        return await handleStop(event, { provider: options.provider });
      case "stop-soft":
        return await handleStop(event, { allowBlock: false, provider: options.provider });
```

In `main`:

```ts
  const sub = argv[0] ?? "";
  const provider = providerFromArgv(argv.slice(1));
  // existing stdin parse stays here
  const result = await runHook(sub, event, { provider });
```

Replace the Stop command in `hooks/hooks.json` with:

```text
node "${CLAUDE_PLUGIN_ROOT}/dist/src/hook/cc-adapter.js" stop --provider claude-code
```

Replace the Stop command in `hooks/hooks-codex.json` with:

```text
node "${PLUGIN_ROOT}/dist/src/hook/cc-adapter.js" stop-soft --provider codex
```

Leave every SessionStart command unchanged. The first token after `cc-adapter.js` stays `stop` or `stop-soft`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/plugin/cc-adapter.test.ts tests/plugin/manifests.test.ts`

Expected: PASS, including the existing handoff and manifest subcommand-set tests.

- [ ] **Step 5: Commit**

```text
git add src/hook/cc-adapter.ts hooks/hooks.json hooks/hooks-codex.json tests/plugin/cc-adapter.test.ts tests/plugin/manifests.test.ts
git commit -m "feat: fill a blank provider on clean handoff"
```

### Task 4: Tell the agent and the reader

**Files:**
- Modify: `skills/project-progress/SKILL.md` (What To Update)
- Modify: `agent-instructions/AGENTS-snippet.md`
- Modify: `agent-instructions/CLAUDE-snippet.md`
- Modify: `templates/project-progress/Progress.md` (frontmatter, after `agent_last_used`)
- Modify: `README.md` (Features list)
- Modify: `docs/glossary.md`
- Create: `docs/adr/0024-last-runtime-memo.md`
- Test: `tests/hook/instruction-pack.test.ts`

**Interfaces:**
- Consumes: the field names and slug examples from the spec. No code imports.
- Produces: the skill sentence agents follow when they update `Progress.md`, and the README sentence a person reads.

- [ ] **Step 1: Write the failing test**

In `tests/hook/instruction-pack.test.ts`, add `provider_last_used` to the phrase lists in "mentions instruction-contract terms in the Codex skill", "mentions required terms in the AGENTS snippet", and "mentions required terms in the CLAUDE snippet".

Add this test in the same file:

```ts
  it("documents the last runtime memo", async () => {
    const readme = await read("README.md");
    expect(readme).toContain(
      "`Progress.md` records the provider, agent, model, and effort of the session that last updated it, and SessionStart repeats that line."
    );
    const glossary = await read("docs/glossary.md");
    expect(glossary).toContain("## Last runtime");
    const template = await read("templates/project-progress/Progress.md");
    expect(template).toContain("provider_last_used: unknown");
    expect(template).toContain("model_last_used: unknown");
    expect(template).toContain("effort_last_used: unknown");
    const adr = await read("docs/adr/0024-last-runtime-memo.md");
    expect(adr).toContain("blank provider");
    expect(adr).toContain("clean-handoff");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/hook/instruction-pack.test.ts -t "provider_last_used|last runtime memo"`

Expected: FAIL. The skill, snippets, README, template, and ADR do not contain those phrases. The ADR read throws because the file is missing.

- [ ] **Step 3: Write the docs**

In `skills/project-progress/SKILL.md`, add this paragraph immediately after the `Progress.md` bullet under What To Update:

```md
On every meaningful `Progress.md` update, set these frontmatter fields together from this session: `agent_last_used`, `provider_last_used`, `model_last_used`, `effort_last_used`, and `updated`. Provider is the app that holds the chat (`claude-code`, `codex`, `grok`, `cursor`, `chatgpt`, `hermes`, `gemini`, `copilot`, or another short slug). Claude Code is exactly `claude-code`. Codex is exactly `codex`. Agent is the role or product agent name. Model is the model id. Effort is the host's effort name. Write `unknown` for any value this session cannot see. Do not guess, and do not keep a previous session's model or effort. Each value is one unquoted YAML scalar with no newline and no `#`.
```

Append this sentence to the end of `agent-instructions/AGENTS-snippet.md` and `agent-instructions/CLAUDE-snippet.md`:

```md
When you update `Progress.md`, set `provider_last_used`, `agent_last_used`, `model_last_used`, and `effort_last_used`, using `unknown` for anything this session cannot see.
```

In `templates/project-progress/Progress.md`, insert these three lines immediately after `agent_last_used: unknown`:

```yaml
provider_last_used: unknown
model_last_used: unknown
effort_last_used: unknown
```

In `README.md`, add this bullet to Features after the Automatic resume context bullet:

```md
- **Last runtime memo** — `Progress.md` records the provider, agent, model, and effort of the session that last updated it, and SessionStart repeats that line.
```

Add this section to `docs/glossary.md`:

```md
## Last runtime

The one line naming the provider, agent, model, and effort of the session that last updated `project-progress/Progress.md`. SessionStart repeats it.
```

Create `docs/adr/0024-last-runtime-memo.md`:

```md
# ADR 0024: Last runtime memo

- **Status:** Accepted
- **Date:** 2026-10-06

## Context

`agent_last_used` records a free-text agent name and nothing shows it at
session start. A person who works across several apps cannot tell which chat
to reopen.

## Decision

`Progress.md` keeps one current runtime memo. Optional `provider_last_used`,
`model_last_used`, and `effort_last_used` sit beside the existing
`agent_last_used` and `updated`. The agent replaces them together when it
updates progress. SessionStart shows one line when any of the three new fields
is known. The Stop hook fills a blank provider only inside the existing
clean-handoff write. Claude Code passes `claude-code`. Codex passes `codex`.
Opening another app without updating progress leaves the memo alone.

## Consequences

Schema version stays 1. Existing files stay valid. Skill-only clients have no
Stop hook, so the agent is the only writer there. A session that updates only
`Progress.md` still depends on the agent to record the provider, because Stop
does not gain a new write.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/hook/instruction-pack.test.ts`

Expected: PASS.

Run: `npm test`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit**

```text
git add skills/project-progress/SKILL.md agent-instructions/AGENTS-snippet.md agent-instructions/CLAUDE-snippet.md templates/project-progress/Progress.md README.md docs/glossary.md docs/adr/0024-last-runtime-memo.md tests/hook/instruction-pack.test.ts
git commit -m "docs: record the last runtime memo"
```
