# Resumability Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure whether a progress tracker improves how well an agent resumes interrupted work, repeatably enough that the suite catches regressions rather than producing a one-time number.

**Architecture:** A standalone harness under `bench/`, compiled separately from `src/` so nothing benchmark-related ships in the published package. `setup` materializes a git-bundle fixture into a temp directory under a named condition and prints the prompt. A human runs their agent there and saves a transcript. `score` grades that transcript against the scenario's `expected.json` and prints three metrics.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Node built-ins only, vitest. No SDK, no API keys.

**Spec:** `docs/superpowers/specs/2026-08-19-resumability-benchmark-design.md`

**Depends on:** the checkpoint, session-handoff, and concurrency plans. The benchmark measures the surface those three build, so building it first would measure the wrong thing.

---

## File Structure

```
bench/
  tsconfig.json          separate build, keeps bench out of dist/ and the package
  harness/
    scenario.ts          expected.json schema, loading, validation
    transcript.ts        transcript schema, parsing
    score.ts             the three metrics
    setup.ts             materialize a fixture under a condition
    cli.ts               argument parsing and output
  scenarios/
    01-interrupted-refactor/
      repo.bundle
      expected.json
      README.md
  RESULTS.md
tests/bench/
  scenario.test.ts
  transcript.test.ts
  score.test.ts
  setup.test.ts
```

Each module has one responsibility, so `score.ts` stays a pure function over parsed data and is testable without touching git or the filesystem.

---

## Task 1: Build wiring

**Files:**
- Create: `bench/tsconfig.json`
- Modify: `package.json` (scripts), `tsconfig.test.json` (include), `.gitignore`

- [ ] **Step 1: Create the bench tsconfig**

Create `bench/tsconfig.json`:

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist"
  },
  "include": ["harness/**/*.ts"]
}
```

The root `tsconfig.json` includes only `src/**/*.ts`, so the harness is invisible to `npm run build` and never reaches `dist/`. `package.json`'s `files` array does not list `bench`, so it never reaches the published package either.

- [ ] **Step 2: Add scripts**

In `package.json`, add to `scripts`:

```json
    "bench:build": "tsc -p bench/tsconfig.json",
    "bench": "npm run bench:build && node bench/dist/harness/cli.js"
```

- [ ] **Step 3: Include bench in typechecking**

In `tsconfig.test.json`, change `include` to:

```json
  "include": ["src/**/*.ts", "tests/**/*.ts", "bench/harness/**/*.ts"]
```

- [ ] **Step 4: Ignore the bench build output**

Append to `.gitignore`:

```
bench/dist/
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck`

Expected: no errors (nothing under `bench/harness` exists yet, which is fine — an empty include is not an error).

- [ ] **Step 6: Commit**

```bash
git add bench/tsconfig.json package.json tsconfig.test.json .gitignore
git commit -m "chore: wire a separate build for the benchmark harness"
```

---

## Task 2: Scenario schema and loader

**Files:**
- Create: `bench/harness/scenario.ts`
- Test: `tests/bench/scenario.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/bench/scenario.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadScenario, parseExpectations } from "../../bench/harness/scenario.js";

const VALID = {
  correctNextAction: ["wire foldDoneSection into update_project_progress"],
  mustTouch: ["src/mcp/server.ts"],
  mustNotTouch: ["src/mcp/writer.ts"],
  alreadyDone: ["foldDoneSection is already implemented"]
};

describe("parseExpectations", () => {
  it("accepts a complete expectations file", () => {
    expect(parseExpectations(JSON.stringify(VALID))).toEqual(VALID);
  });

  it("defaults the optional lists to empty", () => {
    const parsed = parseExpectations(JSON.stringify({ correctNextAction: ["do the thing"] }));

    expect(parsed).toEqual({
      correctNextAction: ["do the thing"],
      mustTouch: [],
      mustNotTouch: [],
      alreadyDone: []
    });
  });

  it("rejects a file with no correctNextAction matcher", () => {
    expect(() => parseExpectations(JSON.stringify({ mustTouch: ["a.ts"] }))).toThrow(
      /correctNextAction must be a non-empty array/
    );
  });

  it("rejects a non-string matcher", () => {
    expect(() => parseExpectations(JSON.stringify({ correctNextAction: [42] }))).toThrow(
      /correctNextAction entries must be strings/
    );
  });

  it("rejects an invalid regular expression", () => {
    expect(() => parseExpectations(JSON.stringify({ correctNextAction: ["("] }))).toThrow(
      /is not a valid regular expression/
    );
  });

  it("rejects malformed JSON with a useful message", () => {
    expect(() => parseExpectations("{not json")).toThrow(/could not be parsed as JSON/);
  });
});

describe("loadScenario", () => {
  it("loads a scenario directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bench-scn-"));
    const dir = path.join(root, "01-demo");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "expected.json"), JSON.stringify(VALID), "utf-8");
    await fs.writeFile(path.join(dir, "repo.bundle"), "not-a-real-bundle", "utf-8");

    const scenario = await loadScenario(root, "01-demo");

    expect(scenario.id).toBe("01-demo");
    expect(scenario.bundlePath).toBe(path.join(dir, "repo.bundle"));
    expect(scenario.expectations.mustTouch).toEqual(["src/mcp/server.ts"]);
  });

  it("reports a missing scenario by name", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bench-scn-missing-"));

    await expect(loadScenario(root, "99-nope")).rejects.toThrow(/scenario 99-nope not found/);
  });

  it("reports a scenario with no bundle", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bench-scn-nobundle-"));
    const dir = path.join(root, "02-demo");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "expected.json"), JSON.stringify(VALID), "utf-8");

    await expect(loadScenario(root, "02-demo")).rejects.toThrow(/repo.bundle/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bench/scenario.test.ts`

Expected: FAIL — cannot resolve `../../bench/harness/scenario.js`.

- [ ] **Step 3: Write minimal implementation**

Create `bench/harness/scenario.ts`:

```ts
import { promises as fs } from "node:fs";
import path from "node:path";

export interface Expectations {
  // Regular expressions, tested case-insensitively against each transcript
  // event's action string. A correct action has many correct phrasings, so
  // these are matchers rather than one exact string.
  correctNextAction: string[];
  mustTouch: string[];
  mustNotTouch: string[];
  alreadyDone: string[];
}

export interface Scenario {
  id: string;
  dir: string;
  bundlePath: string;
  expectations: Expectations;
}

function stringList(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  for (const entry of value) {
    if (typeof entry !== "string") throw new Error(`${field} entries must be strings`);
  }
  return value as string[];
}

function assertValidPatterns(patterns: string[], field: string): void {
  for (const pattern of patterns) {
    try {
      new RegExp(pattern, "i");
    } catch {
      throw new Error(`${field} entry ${JSON.stringify(pattern)} is not a valid regular expression`);
    }
  }
}

export function parseExpectations(raw: string): Expectations {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("expected.json could not be parsed as JSON");
  }

  const record = parsed as Record<string, unknown>;
  const correctNextAction = stringList(record.correctNextAction, "correctNextAction");
  if (correctNextAction.length === 0) {
    throw new Error("correctNextAction must be a non-empty array");
  }

  const alreadyDone = stringList(record.alreadyDone, "alreadyDone");
  assertValidPatterns(correctNextAction, "correctNextAction");
  assertValidPatterns(alreadyDone, "alreadyDone");

  return {
    correctNextAction,
    mustTouch: stringList(record.mustTouch, "mustTouch"),
    mustNotTouch: stringList(record.mustNotTouch, "mustNotTouch"),
    alreadyDone
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadScenario(scenariosRoot: string, id: string): Promise<Scenario> {
  const dir = path.join(scenariosRoot, id);
  if (!(await exists(dir))) throw new Error(`scenario ${id} not found in ${scenariosRoot}`);

  const bundlePath = path.join(dir, "repo.bundle");
  if (!(await exists(bundlePath))) throw new Error(`scenario ${id} has no repo.bundle`);

  const expectedPath = path.join(dir, "expected.json");
  if (!(await exists(expectedPath))) throw new Error(`scenario ${id} has no expected.json`);

  return {
    id,
    dir,
    bundlePath,
    expectations: parseExpectations(await fs.readFile(expectedPath, "utf-8"))
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/bench/scenario.test.ts`

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add bench/harness/scenario.ts tests/bench/scenario.test.ts
git commit -m "feat: add benchmark scenario schema and loader"
```

---

## Task 3: Transcript parsing

**Files:**
- Create: `bench/harness/transcript.ts`
- Test: `tests/bench/transcript.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/bench/transcript.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { WRITE_TOOLS, actionString, parseTranscript } from "../../bench/harness/transcript.js";

describe("parseTranscript", () => {
  it("parses assistant and tool events", () => {
    const jsonl = [
      JSON.stringify({ kind: "assistant", text: "Reading Progress.md", tokens: 100 }),
      JSON.stringify({ kind: "tool", name: "Edit", path: "src/a.ts", tokens: 50 })
    ].join("\n");

    expect(parseTranscript(jsonl)).toEqual([
      { kind: "assistant", text: "Reading Progress.md", tokens: 100, name: "", path: "" },
      { kind: "tool", text: "", tokens: 50, name: "Edit", path: "src/a.ts" }
    ]);
  });

  it("ignores blank lines", () => {
    const jsonl = `\n${JSON.stringify({ kind: "assistant", text: "hi", tokens: 1 })}\n\n`;
    expect(parseTranscript(jsonl)).toHaveLength(1);
  });

  it("defaults missing tokens to zero", () => {
    const jsonl = JSON.stringify({ kind: "assistant", text: "hi" });
    expect(parseTranscript(jsonl)[0].tokens).toBe(0);
  });

  it("fails loudly on an unparseable line rather than scoring zero", () => {
    const jsonl = [JSON.stringify({ kind: "assistant", text: "ok", tokens: 1 }), "{not json"].join("\n");

    expect(() => parseTranscript(jsonl)).toThrow(/line 2 is not valid JSON/);
  });

  it("fails loudly on an unknown event kind", () => {
    const jsonl = JSON.stringify({ kind: "thinking", text: "hm", tokens: 1 });

    expect(() => parseTranscript(jsonl)).toThrow(/line 1 has unknown kind "thinking"/);
  });

  it("normalizes backslash paths", () => {
    const jsonl = JSON.stringify({ kind: "tool", name: "Edit", path: "src\\a.ts", tokens: 1 });
    expect(parseTranscript(jsonl)[0].path).toBe("src/a.ts");
  });
});

describe("actionString", () => {
  it("uses the text for assistant events", () => {
    expect(actionString({ kind: "assistant", text: "do it", tokens: 0, name: "", path: "" })).toBe(
      "do it"
    );
  });

  it("combines name and path for tool events", () => {
    expect(actionString({ kind: "tool", text: "", tokens: 0, name: "Edit", path: "src/a.ts" })).toBe(
      "Edit src/a.ts"
    );
  });
});

describe("WRITE_TOOLS", () => {
  it("covers the mutating tools", () => {
    expect(WRITE_TOOLS.has("Edit")).toBe(true);
    expect(WRITE_TOOLS.has("Write")).toBe(true);
    expect(WRITE_TOOLS.has("Read")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bench/transcript.test.ts`

Expected: FAIL — cannot resolve `../../bench/harness/transcript.js`.

- [ ] **Step 3: Write minimal implementation**

Create `bench/harness/transcript.ts`:

```ts
export interface TranscriptEvent {
  kind: "assistant" | "tool";
  text: string;
  tokens: number;
  name: string;
  path: string;
}

// Tools that change files. Only these count toward wrongFileTouches, because
// an agent legitimately reads far more files than it edits.
export const WRITE_TOOLS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);

export function actionString(event: TranscriptEvent): string {
  return event.kind === "tool" ? `${event.name} ${event.path}`.trim() : event.text;
}

// One normalized JSON object per line. Producing this from a raw agent
// transcript is the runner's job; keeping the harness input normalized is what
// lets a disputed score be recomputed by anyone holding the same file.
export function parseTranscript(jsonl: string): TranscriptEvent[] {
  const events: TranscriptEvent[] = [];
  const lines = jsonl.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.length === 0) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      throw new Error(`transcript line ${index + 1} is not valid JSON`);
    }

    const kind = parsed.kind;
    if (kind !== "assistant" && kind !== "tool") {
      throw new Error(`transcript line ${index + 1} has unknown kind ${JSON.stringify(kind)}`);
    }

    const tokens = typeof parsed.tokens === "number" ? parsed.tokens : 0;

    events.push({
      kind,
      text: typeof parsed.text === "string" ? parsed.text : "",
      tokens,
      name: typeof parsed.name === "string" ? parsed.name : "",
      path: typeof parsed.path === "string" ? parsed.path.replace(/\\/g, "/") : ""
    });
  }

  return events;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/bench/transcript.test.ts`

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add bench/harness/transcript.ts tests/bench/transcript.test.ts
git commit -m "feat: parse normalized benchmark transcripts"
```

---

## Task 4: Scoring

**Files:**
- Create: `bench/harness/score.ts`
- Test: `tests/bench/score.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/bench/score.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scoreTranscript } from "../../bench/harness/score.js";
import type { Expectations } from "../../bench/harness/scenario.js";
import type { TranscriptEvent } from "../../bench/harness/transcript.js";

const expectations: Expectations = {
  correctNextAction: ["wire foldDoneSection"],
  mustTouch: ["src/mcp/server.ts"],
  mustNotTouch: ["src/mcp/writer.ts"],
  alreadyDone: ["implement foldDoneSection"]
};

function assistant(text: string, tokens: number): TranscriptEvent {
  return { kind: "assistant", text, tokens, name: "", path: "" };
}

function tool(name: string, filePath: string, tokens: number): TranscriptEvent {
  return { kind: "tool", text: "", tokens, name, path: filePath };
}

describe("scoreTranscript", () => {
  it("counts tokens up to and including the first correct action", () => {
    const events = [
      assistant("Reading Progress.md", 100),
      assistant("I will wire foldDoneSection into the server", 60),
      assistant("Done", 40)
    ];

    expect(scoreTranscript(events, expectations).tokensToCorrectNextAction).toBe(160);
  });

  it("matches the correct action case-insensitively", () => {
    const events = [assistant("WIRE FOLDDONESECTION now", 25)];

    expect(scoreTranscript(events, expectations).tokensToCorrectNextAction).toBe(25);
  });

  it("reports null when the correct action never happens", () => {
    const events = [assistant("Refactoring something unrelated", 500)];

    const result = scoreTranscript(events, expectations);

    expect(result.tokensToCorrectNextAction).toBeNull();
    expect(result.reachedCorrectAction).toBe(false);
  });

  it("counts duplicate work", () => {
    const events = [
      assistant("Let me implement foldDoneSection from scratch", 30),
      assistant("Now I will implement foldDoneSection again", 30),
      assistant("wire foldDoneSection", 10)
    ];

    expect(scoreTranscript(events, expectations).duplicateWorkCount).toBe(2);
  });

  it("counts an edit to a mustNotTouch file as a wrong touch", () => {
    const events = [tool("Edit", "src/mcp/writer.ts", 20), assistant("wire foldDoneSection", 5)];

    expect(scoreTranscript(events, expectations).wrongFileTouches).toBe(1);
  });

  it("counts an edit outside mustTouch as a wrong touch", () => {
    const events = [tool("Edit", "src/unrelated.ts", 20), assistant("wire foldDoneSection", 5)];

    expect(scoreTranscript(events, expectations).wrongFileTouches).toBe(1);
  });

  it("does not count an edit inside mustTouch", () => {
    const events = [tool("Edit", "src/mcp/server.ts", 20), assistant("wire foldDoneSection", 5)];

    expect(scoreTranscript(events, expectations).wrongFileTouches).toBe(0);
  });

  it("does not count reads as touches", () => {
    const events = [tool("Read", "src/mcp/writer.ts", 20), assistant("wire foldDoneSection", 5)];

    expect(scoreTranscript(events, expectations).wrongFileTouches).toBe(0);
  });

  it("treats every edit as allowed when mustTouch is empty", () => {
    const permissive: Expectations = { ...expectations, mustTouch: [], mustNotTouch: [] };
    const events = [tool("Edit", "anything.ts", 20), assistant("wire foldDoneSection", 5)];

    expect(scoreTranscript(events, permissive).wrongFileTouches).toBe(0);
  });

  it("reports totals for an empty transcript", () => {
    expect(scoreTranscript([], expectations)).toEqual({
      tokensToCorrectNextAction: null,
      reachedCorrectAction: false,
      duplicateWorkCount: 0,
      wrongFileTouches: 0,
      totalTokens: 0
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bench/score.test.ts`

Expected: FAIL — cannot resolve `../../bench/harness/score.js`.

- [ ] **Step 3: Write minimal implementation**

Create `bench/harness/score.ts`:

```ts
import type { Expectations } from "./scenario.js";
import { WRITE_TOOLS, actionString, type TranscriptEvent } from "./transcript.js";

export interface Score {
  // Cumulative tokens through the first event matching correctNextAction, or
  // null when the agent never got there.
  tokensToCorrectNextAction: number | null;
  reachedCorrectAction: boolean;
  duplicateWorkCount: number;
  wrongFileTouches: number;
  totalTokens: number;
}

function matchesAny(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => new RegExp(pattern, "i").test(value));
}

export function scoreTranscript(events: TranscriptEvent[], expectations: Expectations): Score {
  let running = 0;
  let tokensToCorrectNextAction: number | null = null;
  let duplicateWorkCount = 0;
  let wrongFileTouches = 0;

  for (const event of events) {
    running += event.tokens;
    const action = actionString(event);

    if (tokensToCorrectNextAction === null && matchesAny(action, expectations.correctNextAction)) {
      tokensToCorrectNextAction = running;
    }

    if (matchesAny(action, expectations.alreadyDone)) {
      duplicateWorkCount += 1;
    }

    if (event.kind === "tool" && WRITE_TOOLS.has(event.name)) {
      const forbidden = expectations.mustNotTouch.includes(event.path);
      // An empty mustTouch means the scenario does not constrain which files
      // may be edited, so only the explicit deny list applies.
      const outsideAllowed =
        expectations.mustTouch.length > 0 && !expectations.mustTouch.includes(event.path);
      if (forbidden || outsideAllowed) wrongFileTouches += 1;
    }
  }

  return {
    tokensToCorrectNextAction,
    reachedCorrectAction: tokensToCorrectNextAction !== null,
    duplicateWorkCount,
    wrongFileTouches,
    totalTokens: running
  };
}
```

Note `duplicateWorkCount` counts every matching event, including ones after the correct action, because reimplementing finished work is a failure wherever it happens.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/bench/score.test.ts`

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add bench/harness/score.ts tests/bench/score.test.ts
git commit -m "feat: score benchmark transcripts on three metrics"
```

---

## Task 5: Fixture setup

**Files:**
- Create: `bench/harness/setup.ts`
- Test: `tests/bench/setup.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/bench/setup.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONDITIONS, applyCondition, materialize } from "../../bench/harness/setup.js";

async function makeBundle(): Promise<string> {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "bench-src-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repo, stdio: "ignore" });

  await fs.mkdir(path.join(repo, "project-progress"), { recursive: true });
  await fs.writeFile(path.join(repo, "project-progress", "Progress.md"), "# P\n", "utf-8");
  await fs.writeFile(path.join(repo, "code.ts"), "export const a = 1;\n", "utf-8");

  execFileSync("git", ["add", "."], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: repo, stdio: "ignore" });

  const bundle = path.join(repo, "..", `bundle-${Date.now()}.bundle`);
  execFileSync("git", ["bundle", "create", bundle, "--all"], { cwd: repo, stdio: "ignore" });
  return bundle;
}

describe("materialize", () => {
  it("restores a bundle into a fresh working tree", async () => {
    const bundle = await makeBundle();
    const target = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "bench-out-")), "repo");

    await materialize(bundle, target);

    expect(await fs.readFile(path.join(target, "code.ts"), "utf-8")).toBe("export const a = 1;\n");
    await expect(fs.access(path.join(target, "project-progress", "Progress.md"))).resolves
      .toBeUndefined();
  });
});

describe("applyCondition", () => {
  it("leaves project-progress in place for the tracker condition", async () => {
    const bundle = await makeBundle();
    const target = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "bench-t-")), "repo");
    await materialize(bundle, target);

    await applyCondition(target, "tracker");

    await expect(fs.access(path.join(target, "project-progress"))).resolves.toBeUndefined();
  });

  it("removes project-progress for the baseline condition", async () => {
    const bundle = await makeBundle();
    const target = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "bench-b-")), "repo");
    await materialize(bundle, target);

    await applyCondition(target, "baseline");

    await expect(fs.access(path.join(target, "project-progress"))).rejects.toThrow();
  });

  it("leaves the tree untouched for an unrecognized named condition", async () => {
    const bundle = await makeBundle();
    const target = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "bench-x-")), "repo");
    await materialize(bundle, target);

    await applyCondition(target, "some-competitor");

    await expect(fs.access(path.join(target, "project-progress"))).resolves.toBeUndefined();
  });

  it("names the two built-in conditions", () => {
    expect(CONDITIONS).toEqual(["tracker", "baseline"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bench/setup.test.ts`

Expected: FAIL — cannot resolve `../../bench/harness/setup.js`.

- [ ] **Step 3: Write minimal implementation**

Create `bench/harness/setup.ts`:

```ts
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

// Built-in conditions. Any other name is accepted and leaves the tree as the
// bundle restored it, so a competitor's memory system can be set up by hand
// under its own condition name without changing the harness.
export const CONDITIONS = ["tracker", "baseline"] as const;

export async function materialize(bundlePath: string, targetDir: string): Promise<void> {
  await fs.mkdir(path.dirname(targetDir), { recursive: true });
  execFileSync("git", ["clone", "-q", bundlePath, targetDir], { stdio: "ignore" });
}

export async function applyCondition(targetDir: string, condition: string): Promise<void> {
  if (condition === "baseline") {
    await fs.rm(path.join(targetDir, "project-progress"), { recursive: true, force: true });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/bench/setup.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add bench/harness/setup.ts tests/bench/setup.test.ts
git commit -m "feat: materialize benchmark fixtures under named conditions"
```

---

## Task 6: Command-line entry point

**Files:**
- Create: `bench/harness/cli.ts`

- [ ] **Step 1: Write the implementation**

Create `bench/harness/cli.ts`:

```ts
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadScenario } from "./scenario.js";
import { scoreTranscript } from "./score.js";
import { applyCondition, materialize } from "./setup.js";
import { parseTranscript } from "./transcript.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// cli.js runs from bench/dist/harness, so scenarios are two levels up.
const SCENARIOS_ROOT = path.resolve(HERE, "..", "..", "scenarios");

function usage(): string {
  return [
    "Usage:",
    "  npm run bench -- setup <scenario-id> [--condition tracker|baseline|<name>]",
    "  npm run bench -- score <scenario-id> <transcript.jsonl>",
    ""
  ].join("\n");
}

function flag(argv: string[], name: string, fallback: string): string {
  const index = argv.indexOf(`--${name}`);
  return index === -1 || index + 1 >= argv.length ? fallback : argv[index + 1];
}

async function runSetup(argv: string[]): Promise<number> {
  const id = argv[1];
  if (!id) {
    process.stderr.write(usage());
    return 1;
  }

  const condition = flag(argv, "condition", "tracker");
  const scenario = await loadScenario(SCENARIOS_ROOT, id);
  const target = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "bench-")), `${id}-${condition}`);

  await materialize(scenario.bundlePath, target);
  await applyCondition(target, condition);

  const readme = await fs
    .readFile(path.join(scenario.dir, "README.md"), "utf-8")
    .catch(() => "(no README.md for this scenario)");

  process.stdout.write(
    [
      `scenario:  ${id}`,
      `condition: ${condition}`,
      `directory: ${target}`,
      "",
      "Run your agent in that directory with the prompt below, save a normalized",
      "JSONL transcript, then score it with:",
      `  npm run bench -- score ${id} <transcript.jsonl>`,
      "",
      "--- prompt ---",
      readme,
      ""
    ].join("\n")
  );

  return 0;
}

async function runScore(argv: string[]): Promise<number> {
  const id = argv[1];
  const transcriptPath = argv[2];
  if (!id || !transcriptPath) {
    process.stderr.write(usage());
    return 1;
  }

  const scenario = await loadScenario(SCENARIOS_ROOT, id);
  const events = parseTranscript(await fs.readFile(transcriptPath, "utf-8"));
  const score = scoreTranscript(events, scenario.expectations);

  const tokens =
    score.tokensToCorrectNextAction === null
      ? "never reached"
      : String(score.tokensToCorrectNextAction);

  process.stdout.write(
    [
      `scenario:              ${id}`,
      `tokens-to-correct:     ${tokens}`,
      `duplicate-work:        ${score.duplicateWorkCount}`,
      `wrong-file-touches:    ${score.wrongFileTouches}`,
      `total-tokens:          ${score.totalTokens}`,
      ""
    ].join("\n")
  );

  return 0;
}

export async function main(argv: string[]): Promise<number> {
  try {
    switch (argv[0]) {
      case "setup":
        return await runSetup(argv);
      case "score":
        return await runScore(argv);
      default:
        process.stderr.write(usage());
        return 1;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
```

- [ ] **Step 2: Verify it builds and prints usage**

Run: `npm run bench`

Expected: the usage block on stderr, exit code 1.

- [ ] **Step 3: Commit**

```bash
git add bench/harness/cli.ts
git commit -m "feat: add benchmark setup and score commands"
```

---

## Task 7: First scenario, results, and ADR

**Files:**
- Create: `bench/scenarios/01-interrupted-refactor/{repo.bundle,expected.json,README.md}`
- Create: `bench/RESULTS.md`
- Create: `docs/adr/0021-resumability-benchmark.md`

- [ ] **Step 1: Build the fixture repository**

Run these commands, adjusting the temp path for your platform:

```bash
FIX=$(mktemp -d)
cd "$FIX"
git init -q -b main
git config user.email bench@example.com
git config user.name Bench

mkdir -p src project-progress
cat > src/writer.ts <<'EOF'
export function foldDoneSection(content: string): { kept: string; archived: string[] } {
  if (content.length <= 2800) return { kept: content, archived: [] };
  const lines = content.split("\n");
  return { kept: lines.slice(-10).join("\n"), archived: lines.slice(0, -10) };
}
EOF
cat > src/server.ts <<'EOF'
import { foldDoneSection } from "./writer.js";

export function updateSection(section: string, content: string): string {
  // foldDoneSection is implemented but not yet called from here.
  void foldDoneSection;
  return `${section}: ${content}`;
}
EOF
cat > project-progress/Progress.md <<'EOF'
---
project: Fold Demo
progress_schema_version: 1
status: active
path: /fixture
agent_last_used: claude
updated: 2026-08-19
last_milestone: implemented foldDoneSection
deployed: false
deployment_url:
sensitivity: normal
commit_progress: true
---

# Fold Demo

## Resume Snapshot

`foldDoneSection` is fully implemented and tested in `src/writer.ts`. It is not
yet called from `updateSection` in `src/server.ts`, so the fold never runs.

## Next Action

Wire foldDoneSection into updateSection in src/server.ts.

## Blockers

None.
EOF

git add .
git commit -q -m "implement foldDoneSection, not yet wired"
git bundle create repo.bundle --all
```

Copy the resulting `repo.bundle` to `bench/scenarios/01-interrupted-refactor/repo.bundle`.

- [ ] **Step 2: Write the expectations**

Create `bench/scenarios/01-interrupted-refactor/expected.json`:

```json
{
  "correctNextAction": [
    "wire\\s+folddonesection",
    "call\\s+folddonesection.*server",
    "Edit src/server\\.ts"
  ],
  "mustTouch": ["src/server.ts"],
  "mustNotTouch": ["src/writer.ts"],
  "alreadyDone": [
    "implement\\s+folddonesection",
    "write\\s+folddonesection",
    "add\\s+folddonesection\\s+to\\s+writer"
  ]
}
```

`src/writer.ts` is in `mustNotTouch` because the fixture already contains a
working `foldDoneSection`; editing it means the agent did not read the resume
snapshot.

- [ ] **Step 3: Write the scenario prompt**

Create `bench/scenarios/01-interrupted-refactor/README.md`:

```markdown
Continue this project. Do the next piece of work.
```

Deliberately terse. A prompt that names the task would test instruction
following, not resumption.

- [ ] **Step 4: Verify the fixture end to end**

Run: `npm run bench -- setup 01-interrupted-refactor --condition tracker`

Expected: a directory path, the prompt, and a `project-progress/` present in that directory.

Run: `npm run bench -- setup 01-interrupted-refactor --condition baseline`

Expected: the same, with no `project-progress/` in the directory.

Write a two-line transcript by hand and confirm scoring works:

```bash
printf '%s\n' '{"kind":"assistant","text":"I will wire foldDoneSection into updateSection","tokens":120}' > /tmp/t.jsonl
npm run bench -- score 01-interrupted-refactor /tmp/t.jsonl
```

Expected: `tokens-to-correct: 120`, `duplicate-work: 0`, `wrong-file-touches: 0`.

- [ ] **Step 5: Write RESULTS.md**

Create `bench/RESULTS.md`:

```markdown
# Resumability Benchmark Results

## Methodology

Each scenario is a repository frozen mid-task, distributed as a git bundle so
it restores byte-exactly. `setup` clones the bundle into a temp directory and
applies a named condition; `baseline` removes `project-progress/`, `tracker`
leaves it in place, and any other name leaves the tree as restored so a
competing memory system can be configured by hand.

The agent is given only the scenario prompt, which never names the task. The
run is recorded as a normalized JSONL transcript and scored offline, so a
disputed number can be recomputed by anyone holding the same file.

Three metrics are reported. `tokens-to-correct` is cumulative tokens through
the first action matching the scenario's `correctNextAction` matchers, or
"never reached". `duplicate-work` counts actions that reimplement something the
frozen repository already contains. `wrong-file-touches` counts edits to files
the scenario forbids or does not list.

Wall-clock time and step counts are deliberately not measured: both are
dominated by model latency and sampling variance rather than resume quality.

## Scenarios

| id | what is frozen | correct next action |
|----|----------------|---------------------|
| 01-interrupted-refactor | `foldDoneSection` implemented but never called | wire it into `updateSection` in `src/server.ts` |

## Results

No runs recorded yet. Populate this table by running each scenario under each
condition and pasting the scores.

| scenario | condition | tokens-to-correct | duplicate-work | wrong-file-touches |
|----------|-----------|-------------------|----------------|--------------------|

## Fixture honesty

A scenario where `baseline` and `tracker` score the same is not measuring
resumption. Such a scenario is rewritten or removed rather than reported.
```

- [ ] **Step 6: Write the ADR**

Create `docs/adr/0021-resumability-benchmark.md`:

```markdown
# ADR 0021: Resumability benchmark

## Status

Accepted.

## Context

The project claims that Markdown progress tracking improves agent resumption,
with no measurement behind the claim. A benchmark is both the strongest
evidence for the claim and a regression test for the resume surface built in
ADRs 0018 through 0020.

## Decision

Build an in-repository harness with git-bundle fixtures, named conditions, and
offline transcript scoring, rather than a one-off study. A rerunnable suite
catches regressions; a published number ages out.

Runs are human-driven. Programmatic driving would need API credentials, couple
the benchmark to one vendor's SDK, and could not exercise Codex or Hermes,
which this project already supports. The harness sets up the fixture and scores
the transcript; it never launches an agent.

Three metrics: tokens to the first correct action, duplicate work, and wrong
file touches. Wall-clock time and step counts are excluded as model-speed
confounded. Completion accuracy is excluded because it needs a full task oracle
per fixture.

The harness is built after ADRs 0018 through 0020, because benchmarking a
resume surface before it exists measures the wrong thing.

## Consequences

A benchmark authored by the tool's own maintainer is only credible if its tasks
and grading are inspectable, so fixtures, expectations, and methodology are
published alongside every number.

The suite is run before a release or after a change to resume context, not in
CI, because runs are manual.

`bench/` compiles through its own tsconfig and is excluded from `package.json`'s
`files`, so nothing benchmark-related ships to consumers.
```

- [ ] **Step 7: Verify and commit**

Run: `npm test && npm run typecheck && npm run build && npm run bench:build`

Expected: all four pass.

```bash
git add bench/scenarios bench/RESULTS.md docs/adr/0021-resumability-benchmark.md
git commit -m "feat: add the first resumability benchmark scenario"
```

---

## Self-Review Notes

Spec coverage, section by section:

- `bench/` layout with scenarios, harness, RESULTS.md — Tasks 1 through 7
- git-bundle fixtures — Tasks 5 and 7
- `expected.json` with all four fields — Task 2
- named conditions, competitor-extensible — Task 5
- `setup` prints directory and prompt, never launches an agent — Task 6
- `score` reports the three metrics — Tasks 4 and 6
- deterministic offline scoring — Task 4 (pure function over parsed events)
- unparseable transcript fails loudly — Task 3
- fixture honesty check — Task 7, `RESULTS.md`
- time and step counts excluded — not implemented anywhere, by design

Names used consistently: `Expectations`, `Scenario`, `parseExpectations`,
`loadScenario`, `TranscriptEvent`, `parseTranscript`, `actionString`,
`WRITE_TOOLS`, `Score`, `scoreTranscript`, `CONDITIONS`, `materialize`,
`applyCondition`. `scoreTranscript` returns `tokensToCorrectNextAction` as
`number | null`; the CLI is the only place that renders null as "never
reached".
