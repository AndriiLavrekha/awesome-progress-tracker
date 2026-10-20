# Progress Compaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bloated `project-progress/` files visible and fixable: the stop hook reports every validator problem once per session, hooks report what `compact` would move, and `awesome-progress-tracker compact [dir] [--write]` moves old content into `Archive.md`.

**Architecture:** One shared fence-aware line scanner in `src/mcp/markdown.ts`. Pure compaction rules in `src/compact.ts` (`planCompaction`), used by both the CLI (`compactProject` in `src/cli.ts`) and the health check (`checkProgressHealth` in `src/hook/validator.ts`). Hooks only report; only `compact --write` changes files, writing `Archive.md` first.

**Tech Stack:** TypeScript ESM (explicit `.js` imports), Node 20+, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-20-progress-compaction-design.md`

---

## File Structure

- Create `src/encoding.ts`: garbled-character repair and detection.
- Create `src/compact.ts`: block splitting, the three rule sets, archive rendering, `planCompaction`, `readProgressFiles`.
- Modify `src/mcp/markdown.ts`: export `scanLines`, `sectionMatches`, `splitLinesWithEndings`, `splitFrontmatter`.
- Modify `src/mcp/writer.ts`: drop duplicate scanner code; add `updateArchiveFile`.
- Modify `src/mcp/server.ts`: `archiveFoldedItems`; the `Done` fold returns unarchived items instead of losing them.
- Modify `src/hook/validator.ts`: `checkProgressHealth`, `summarizeProblems`, budgets.
- Modify `src/hook/cc-adapter.ts`: SessionStart health line; stop hook reports all problems once per session.
- Modify `src/cli.ts`: `compactProject`, `compact` command, `--write`, help text.
- Modify `skills/project-progress/SKILL.md`, `templates/project-progress/Session Log.md`, `README.md`.
- Tests: `tests/mcp/markdown.test.ts`, `tests/encoding.test.ts` (new), `tests/compact.test.ts` (new), `tests/hook/validator.test.ts`, `tests/plugin/cc-adapter.test.ts`, `tests/mcp/writer.test.ts`, `tests/mcp/server.test.ts`.

Run every command from `D:/depot/awesome-progress-tracker`. Commit message bodies end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

Environment notes:
- If `node_modules` holds only Linux native bindings for TypeScript/rolldown (the case in this checkout), run `npx vitest`, `npm test`, `npm run typecheck`, and `npm run build` through WSL from `/mnt/d/depot/awesome-progress-tracker`. The `node dist/...` commands in Task 11 are plain JavaScript and run on Windows too.
- Under WSL, `tests/mcp/cli.test.ts > npm CLI > installs Claude bootstrap instructions and MCP config by default` fails before any change (it expects a Windows path for `C:/repo`). Every "Expected: PASS" below that includes `tests/mcp` or `npm test` means "no failures other than that one".

---

### Task 1: Shared fence-aware scanner

**Files:**
- Modify: `src/mcp/markdown.ts` (the `sectionMatches` and `splitLinesWithEndings` functions)
- Modify: `src/mcp/writer.ts` (lines 1-2 constants, `splitLinesWithEndings`, `sectionMatches`, bottom import block)
- Test: `tests/mcp/markdown.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/mcp/markdown.test.ts`, change the import to:

```ts
import { parseFrontmatter, parseProjectSummary, renderLastRuntime, scanLines, splitFrontmatter } from "../../src/mcp/markdown.js";
```

Append:

```ts
describe("scanLines", () => {
  it("marks fence lines and fenced content, and keeps offsets", () => {
    const markdown = "a\n```\n## not\n```\n## yes\n";
    const lines = scanLines(markdown);
    expect(lines.map((line) => [line.text, line.inFence])).toEqual([
      ["a", false],
      ["```", true],
      ["## not", true],
      ["```", true],
      ["## yes", false]
    ]);
    expect(markdown.slice(lines[4].offset, lines[4].offset + lines[4].length)).toBe("## yes\n");
  });
});

describe("splitFrontmatter", () => {
  it("splits a leading frontmatter block from the body", () => {
    expect(splitFrontmatter("---\na: 1\n---\n\n# T\n")).toEqual({ frontmatter: "---\na: 1\n---\n", body: "\n# T\n" });
  });

  it("returns the whole text as body when there is no frontmatter", () => {
    expect(splitFrontmatter("# T\n")).toEqual({ frontmatter: "", body: "# T\n" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/mcp/markdown.test.ts`
Expected: FAIL, `scanLines` / `splitFrontmatter` are not exported.

- [ ] **Step 3: Implement in `src/mcp/markdown.ts`**

Replace the whole `function sectionMatches(...) { ... }` and `function splitLinesWithEndings(...) { ... }` definitions with:

```ts
export interface ScannedLine {
  text: string;
  offset: number;
  length: number;
  inFence: boolean;
}

// One pass with the fence rules every heading and task parser shares: a fence
// line, and every line between fences, is never a heading or a task.
export function scanLines(markdown: string): ScannedLine[] {
  const lines: ScannedLine[] = [];
  let offset = 0;
  let fenceMarker: string | undefined;
  let fenceLength = 0;

  for (const line of splitLinesWithEndings(markdown)) {
    const text = line.replace(/\r?\n$|\r$/, "");
    const fenceMatch = text.match(FENCE_RE);
    if (fenceMatch?.groups) {
      const fence = fenceMatch.groups.fence;
      const marker = fence[0];
      if (fenceMarker === undefined) {
        fenceMarker = marker;
        fenceLength = fence.length;
      } else if (
        fenceMarker === marker &&
        fence.length >= fenceLength &&
        fenceMatch.groups.rest.trim() === ""
      ) {
        fenceMarker = undefined;
        fenceLength = 0;
      }
    }

    lines.push({
      text,
      offset,
      length: line.length,
      inFence: fenceMatch?.groups !== undefined || fenceMarker !== undefined
    });
    offset += line.length;
  }

  return lines;
}

export function sectionMatches(markdown: string): Array<{ title: string; start: number; bodyStart: number }> {
  const matches: Array<{ title: string; start: number; bodyStart: number }> = [];
  for (const line of scanLines(markdown)) {
    if (line.inFence) continue;
    const sectionMatch = line.text.match(SECTION_RE);
    if (sectionMatch?.groups) {
      matches.push({
        title: sectionMatch.groups.title.trim(),
        start: line.offset,
        bodyStart: line.offset + line.length
      });
    }
  }
  return matches;
}

export function splitLinesWithEndings(markdown: string): string[] {
  const lines = markdown.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? [];
  return lines.filter((line, index) => line.length > 0 || index < lines.length - 1);
}

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

export function splitFrontmatter(markdown: string): { frontmatter: string; body: string } {
  const match = markdown.match(FRONTMATTER_RE);
  return match
    ? { frontmatter: match[0], body: markdown.slice(match[0].length) }
    : { frontmatter: "", body: markdown };
}
```

- [ ] **Step 4: Remove the duplicates from `src/mcp/writer.ts`**

Delete lines 1-2 (`const SECTION_RE = ...` and `const FENCE_RE = ...`), the whole `function splitLinesWithEndings(...) { ... }`, and the whole `function sectionMatches(...) { ... }`. In the import block at the bottom of the file, add:

```ts
import { sectionMatches, splitLinesWithEndings } from "./markdown.js";
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/mcp && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/mcp/markdown.ts src/mcp/writer.ts tests/mcp/markdown.test.ts
git commit -m "refactor: share one fence-aware line scanner" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Stop hook reports all validator errors once per session

**Files:**
- Modify: `src/hook/validator.ts`
- Modify: `src/hook/cc-adapter.ts` (`SessionState`, the validation block in `handleStop`)
- Test: `tests/hook/validator.test.ts`, `tests/plugin/cc-adapter.test.ts`

- [ ] **Step 1: Make the hook test fixture valid**

In `tests/plugin/cc-adapter.test.ts`, replace `progressDoc` with:

```ts
function progressDoc(fields: Record<string, string>, blockers = "None."): string {
  const fm = Object.entries({
    project: "Demo",
    progress_schema_version: "1",
    status: "active",
    path: "demo",
    // "unknown" keeps renderLastRuntime output unchanged for the runtime-memo tests.
    agent_last_used: "unknown",
    updated: "2026-10-20",
    last_milestone: "started",
    deployed: "false",
    deployment_url: "",
    sensitivity: "normal",
    commit_progress: "true",
    ...fields
  })
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return (
    `---\n${fm}\n---\n\n## Resume Snapshot\n\nWorking on the widget.\n\n## Current State\n\nIn progress.\n\n` +
    `## Last Session\n\nStarted.\n\n## Next Action\n\nWire the widget.\n\n## Remaining Work\n\n- [ ] Finish the widget.\n\n` +
    `## Done\n\n- [x] Planned.\n\n## Blockers\n\n${blockers}\n\n## Deployment\n\nNot deployed.\n\n` +
    `## Completion Criteria\n\n- [ ] Widget wired.\n\n## Resume Instructions\n\nRead Next Action.\n`
  );
}
```

Add `validateProgressFile` to the imports (`import { validateProgressFile } from "../../src/hook/validator.js";`) and this test inside `describe("cc-adapter session-start", ...)`:

```ts
  it("uses a progress fixture the validator accepts", async () => {
    const dir = await makeRepo();
    const file = await writeProgress(dir, progressDoc({}));
    expect(await validateProgressFile(file)).toEqual([]);
  });
```

Run: `npx vitest run tests/plugin/cc-adapter.test.ts`
Expected: PASS (existing tests only use `toContain`/`code` checks on stop output; the runtime-memo tests near line 1060 and 1078 still see no agent part).

- [ ] **Step 2: Write the failing tests**

Append to `tests/hook/validator.test.ts` (and add `summarizeProblems` to its import from `../../src/hook/validator.js`):

```ts
describe("summarizeProblems", () => {
  it("lists the first three problems and names the command", () => {
    expect(summarizeProblems(["a", "b", "c", "d"], "node cli.js compact .")).toBe(
      "Progress file problems: a; b; c (+1 more). Preview the cleanup with `node cli.js compact .`, then add --write."
    );
  });

  it("omits the command when none applies", () => {
    expect(summarizeProblems(["a"], undefined)).toBe("Progress file problems: a.");
  });
});
```

Append inside the stop-hook `describe` in `tests/plugin/cc-adapter.test.ts`, right after the test `"allows a stop when a section body changed"`:

```ts
  it("reports validator problems once per session and secrets on every stop", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      const file = await writeProgress(dir, progressDoc({ status: "in_progress" }));
      await commitAll(dir, "init");
      await fs.writeFile(path.join(dir, "src.txt"), "work", "utf-8");

      const sessionId = `s-problems-${Date.now()}`;
      await handleSessionStart({ cwd: dir, session_id: sessionId });
      const current = await fs.readFile(file, "utf-8");
      await fs.writeFile(
        file,
        current.replace("Wire the widget.", "Ship the widget. token sk-abcdefghijklmnop0123456789"),
        "utf-8"
      );

      const first = await handleStop({ cwd: dir, session_id: sessionId });
      expect(first.code).toBe(0);
      expect(first.stdout).toContain("Progress file problems");
      expect(first.stdout).toContain("status");
      expect(first.stdout).toContain("secrets");

      const second = await handleStop({ cwd: dir, session_id: sessionId });
      expect(second.stdout).toContain("secrets");
      expect(second.stdout).not.toContain("Progress file problems");
    });
  });
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/hook/validator.test.ts tests/plugin/cc-adapter.test.ts`
Expected: FAIL, `summarizeProblems` is not exported; the stop output lacks "Progress file problems".

- [ ] **Step 4: Implement `summarizeProblems` in `src/hook/validator.ts`**

Append:

```ts
export function summarizeProblems(problems: string[], command: string | undefined, limit = 3): string {
  const more = problems.length - limit;
  const listed = `${problems.slice(0, limit).join("; ")}${more > 0 ? ` (+${more} more)` : ""}`;
  const hint = command ? ` Preview the cleanup with \`${command}\`, then add --write.` : "";
  return `Progress file problems: ${listed}.${hint}`;
}
```

- [ ] **Step 5: Report the problems in `handleStop`**

In `src/hook/cc-adapter.ts`, add `summarizeProblems` to the `./validator.js` import and add `healthShown?: boolean;` to `interface SessionState`. Replace the whole `try { const secretErrors = ... } catch { ... }` block in `handleStop` with:

```ts
  try {
    const errors = await validateProgressFile(progressPath);
    const secretErrors = errors.filter((error) => error.includes("secret-like"));
    if (secretErrors.length > 0) {
      warnings.push(`Progress file may contain secrets (${secretErrors.join("; ")}); remove them.`);
    }
    // Shown once per session: these persist until someone edits the files, and
    // repeating them on every stop turns a report into noise.
    if (!sessionState.healthShown) {
      const problems = errors.filter((error) => !error.includes("secret-like"));
      if (problems.length > 0) {
        warnings.push(summarizeProblems(problems, undefined));
        if (event.session_id) {
          await writeSessionState(event.session_id, { ...(await readSessionState(event.session_id)), healthShown: true });
        }
      }
    }
  } catch {
    // validation is best effort
  }
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/hook tests/plugin && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/hook/validator.ts src/hook/cc-adapter.ts tests/hook/validator.test.ts tests/plugin/cc-adapter.test.ts
git commit -m "fix: report all progress validator errors once per session" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Encoding repair

**Files:**
- Create: `src/encoding.ts`
- Test: `tests/encoding.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/encoding.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hasMojibake, repairEncoding } from "../src/encoding.js";

describe("repairEncoding", () => {
  it("restores UTF-8 text that was misread as Windows-1252", () => {
    expect(repairEncoding("closure \u00e2\u20ac\u201d done")).toBe("closure — done");
    expect(repairEncoding("\u00e2\u20ac\u0153quoted\u00e2\u20ac\u009d")).toBe("“quoted”");
    expect(repairEncoding("Gr\u00c3\u00bc\u00c3\u0178e")).toBe("Grüße");
    expect(repairEncoding("\uFEFF# Title")).toBe("# Title");
    expect(repairEncoding("\u00ef\u00bb\u00bf# Title")).toBe("# Title");
  });

  it("leaves clean text unchanged", () => {
    const text = "Plain — text with ü, “quotes” and SÃO PAULO.";
    expect(repairEncoding(text)).toBe(text);
  });
});

describe("hasMojibake", () => {
  it("detects only exact garbled sequences", () => {
    expect(hasMojibake("a \u00e2\u20ac\u201d b")).toBe(true);
    expect(hasMojibake("a — b, SÃO PAULO")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/encoding.test.ts`
Expected: FAIL, cannot find module `../src/encoding.js`.

- [ ] **Step 3: Implement `src/encoding.ts`**

```ts
// Characters whose UTF-8 bytes, misread as Windows-1252, produce the garbled
// text that Windows tools write when they save UTF-8 with the wrong encoding.
const REPAIRABLE = "—–‘’“”…•·×→ÄÖÜäöüßéèàç";

// Windows-1252 differs from Latin-1 only in 0x80-0x9F. Spelled out because
// Node builds without full ICU decode "windows-1252" as Latin-1. Unassigned
// bytes (0x81, 0x8D, 0x8F, 0x90, 0x9D) map to the same code point, as WHATWG does.
const CP1252_HIGH: Record<number, string> = {
  0x80: "\u20ac", 0x82: "\u201a", 0x83: "\u0192", 0x84: "\u201e", 0x85: "\u2026", 0x86: "\u2020",
  0x87: "\u2021", 0x88: "\u02c6", 0x89: "\u2030", 0x8a: "\u0160", 0x8b: "\u2039", 0x8c: "\u0152",
  0x8e: "\u017d", 0x91: "\u2018", 0x92: "\u2019", 0x93: "\u201c", 0x94: "\u201d", 0x95: "\u2022",
  0x96: "\u2013", 0x97: "\u2014", 0x98: "\u02dc", 0x99: "\u2122", 0x9a: "\u0161", 0x9b: "\u203a",
  0x9c: "\u0153", 0x9e: "\u017e", 0x9f: "\u0178"
};

function asWindows1252(bytes: Uint8Array): string {
  return [...bytes].map((byte) => CP1252_HIGH[byte] ?? String.fromCharCode(byte)).join("");
}

const utf8 = new TextEncoder();

const GARBLED: Array<[string, string]> = [
  [asWindows1252(new Uint8Array([0xef, 0xbb, 0xbf])), ""],
  ...[...REPAIRABLE].map((char): [string, string] => [asWindows1252(utf8.encode(char)), char])
];

export function repairEncoding(text: string): string {
  let repaired = text.replace(/^\uFEFF/, "");
  for (const [garbled, char] of GARBLED) repaired = repaired.split(garbled).join(char);
  return repaired;
}

export function hasMojibake(text: string): boolean {
  return text.startsWith("\uFEFF") || GARBLED.some(([garbled]) => text.includes(garbled));
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/encoding.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/encoding.ts tests/encoding.test.ts
git commit -m "feat: repair Windows-1252 garbled characters" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Compaction rules for Progress.md

**Files:**
- Create: `src/compact.ts`
- Test: `tests/compact.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/compact.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { compactProgress, renderArchiveRun, type CompactResult } from "../src/compact.js";
import { repairEncoding } from "../src/encoding.js";

const FM = "---\nproject: Demo\nstatus: active\n---\n";
const SECTIONS = [
  "Resume Snapshot", "Current State", "Last Session", "Next Action", "Remaining Work",
  "Done", "Blockers", "Deployment", "Completion Criteria", "Verification", "Resume Instructions"
];

function progress(extra = "", done = "Done body."): string {
  return `${FM}\n# Demo\n\n${SECTIONS.map((t) => `## ${t}\n\n${t === "Done" ? done : `${t} body.`}\n`).join("\n")}${extra}`;
}

const bigDone = Array.from({ length: 100 }, (_, i) => `- [x] item ${i} finished with detail`).join("\n");

function lineCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const raw of repairEncoding(text).split("\n")) {
    const line = raw.replace(/^#+\s+/, "").trim();
    if (line) counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return counts;
}

function expectConserved(input: string, result: CompactResult): void {
  const archive = renderArchiveRun("2026-10-20", [{ file: "X", blocks: result.moved }]);
  const output = lineCounts([result.kept, archive, result.folded.join("\n")].join("\n"));
  for (const [line, count] of lineCounts(input)) {
    expect(output.get(line) ?? 0, line).toBeGreaterThanOrEqual(count);
  }
}

describe("compactProgress", () => {
  it("leaves a clean file unchanged, including Verification", () => {
    const result = compactProgress(progress());
    expect(result).toEqual({ kept: progress(), moved: [], folded: [], notes: [] });
  });

  it("moves unknown sections, a second H1 and later duplicates with their subsections", () => {
    const extra = "\n## Historical Archive\n\nold\n\n### Detail\n\nolder\n\n# Second Title\n\nstray prose\n\n## Blockers\n\nduplicate\n";
    const result = compactProgress(progress(extra));
    expect(result.kept).toBe(progress());
    expect(result.moved.map((block) => block.trim())).toEqual([
      "## Historical Archive\n\nold\n\n### Detail\n\nolder",
      "# Second Title\n\nstray prose",
      "## Blockers\n\nduplicate"
    ]);
  });

  it("ignores headings inside fenced code", () => {
    const extra = "\n```md\n## Not A Section\n# Not A Title\n```\n";
    const result = compactProgress(progress(extra));
    expect(result.moved).toEqual([]);
    expect(result.kept).toBe(progress(extra));
  });

  it("repairs garbled text and drops exact duplicate moved blocks", () => {
    const extra = "\n## Old \u00e2\u20ac\u201d A\n\nsame\n\n## Old — A\n\nsame\n";
    const result = compactProgress(progress(extra).replace("Current State body.", "Current \u00e2\u20ac\u201d state."));
    expect(result.moved.map((block) => block.trim())).toEqual(["## Old — A\n\nsame"]);
    expect(result.kept).toContain("Current — state.");
  });

  it("does not fold a Done section that contains fenced code", () => {
    expect(compactProgress(progress("", `${bigDone}\n\`\`\`\ncode\n\`\`\``)).folded).toEqual([]);
  });

  it("folds a large Done section into folded lines", () => {
    const result = compactProgress(progress("", bigDone));
    expect(result.folded[0]).toBe("- [x] item 0 finished with detail");
    expect(result.kept).toContain("- [x] item 99 finished with detail");
    expect(result.kept).not.toContain("item 0 finished");
  });

  it("conserves every line and is idempotent", () => {
    const input = progress("\n## Historical\n\nalpha\n\n### Deep\n\nbeta\n\n# Again\n\ngamma\n", bigDone);
    const result = compactProgress(input);
    expectConserved(input, result);
    const again = compactProgress(result.kept);
    expect(again).toEqual({ kept: result.kept, moved: [], folded: [], notes: [] });
  });
});

describe("renderArchiveRun", () => {
  it("renders one dated run with headings shifted two levels", () => {
    const run = renderArchiveRun("2026-10-20", [
      { file: "Progress.md", blocks: ["## Old\n\n### Sub\n\ntext\n"] },
      { file: "Tasks.md", blocks: [] }
    ]);
    expect(run).toBe("## Compacted 2026-10-20\n\n### From Progress.md\n\n#### Old\n\n##### Sub\n\ntext\n");
  });

  it("renders nothing without moved blocks and never shifts fenced lines", () => {
    expect(renderArchiveRun("2026-10-20", [{ file: "Tasks.md", blocks: [] }])).toBe("");
    expect(renderArchiveRun("2026-10-20", [{ file: "X", blocks: ["## A\n\n```\n## fenced\n```\n"] }])).toContain("```\n## fenced\n```");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/compact.test.ts`
Expected: FAIL, cannot find module `../src/compact.js`.

- [ ] **Step 3: Implement `src/compact.ts`**

```ts
import { repairEncoding } from "./encoding.js";
import { scanLines, splitFrontmatter } from "./mcp/markdown.js";
import { ALLOWED_PROGRESS_SECTIONS, foldDoneSection } from "./mcp/writer.js";

// The template ships `## Verification`, which the MCP write tool does not
// accept but which is still a legitimate section.
export const KEPT_PROGRESS_SECTIONS: ReadonlySet<string> = new Set<string>([...ALLOWED_PROGRESS_SECTIONS, "Verification"]);
export const SESSION_LOG_KEEP = 20;
export const TASKS_KEEP_FINISHED_BLOCKS = 3;
export const TASKS_KEEP_CHECKED = 10;

export interface CompactResult {
  kept: string;
  moved: string[];
  folded: string[];
  notes: string[];
}

export interface Block {
  level: 0 | 1 | 2;
  title: string;
  text: string;
}

const HEADING_RE = /^(?<marks>#{1,2})\s+(?<title>.+?)\s*$/;

// Level 0 is the text before the first `#`/`##` heading outside fences.
export function splitBlocks(body: string): Block[] {
  const blocks: Block[] = [{ level: 0, title: "", text: "" }];
  for (const line of scanLines(body)) {
    const raw = body.slice(line.offset, line.offset + line.length);
    const heading = line.inFence ? null : line.text.match(HEADING_RE);
    if (heading?.groups) {
      blocks.push({ level: heading.groups.marks.length as 1 | 2, title: heading.groups.title, text: raw });
    } else {
      blocks[blocks.length - 1].text += raw;
    }
  }
  return blocks;
}

function joinBlocks(frontmatter: string, blocks: Block[]): string {
  const parts = blocks.filter((block) => block.text.trim() !== "").map((block) => `${block.text.trimEnd()}\n`);
  return `${frontmatter}${frontmatter && parts.length > 0 ? "\n" : ""}${parts.join("\n")}`;
}

function bodyOf(block: Block): string {
  const newline = block.text.indexOf("\n");
  return newline === -1 ? "" : block.text.slice(newline + 1).trim();
}

function dedupe(blocks: string[]): string[] {
  const seen = new Set<string>();
  return blocks.filter((block) => {
    const key = block.trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function compactProgress(text: string): CompactResult {
  const { frontmatter, body } = splitFrontmatter(repairEncoding(text));
  const kept: Block[] = [];
  const moved: string[] = [];
  const seen = new Set<string>();
  let titleSeen = false;

  for (const block of splitBlocks(body)) {
    if (block.level === 0 || (block.level === 1 && !titleSeen)) {
      if (block.level === 1) titleSeen = true;
      kept.push(block);
    } else if (block.level === 2 && KEPT_PROGRESS_SECTIONS.has(block.title) && !seen.has(block.title)) {
      seen.add(block.title);
      kept.push(block);
    } else {
      moved.push(block.text);
    }
  }

  let folded: string[] = [];
  const done = kept.find((block) => block.level === 2 && block.title === "Done");
  // The fold is line-based; splitting a fence would hide every later section.
  if (done && !scanLines(bodyOf(done)).some((line) => line.inFence)) {
    const fold = foldDoneSection(bodyOf(done));
    if (fold.archived.length > 0) {
      folded = fold.archived;
      done.text = `## Done\n\n${fold.kept}\n`;
    }
  }

  return { kept: joinBlocks(frontmatter, kept), moved: dedupe(moved), folded, notes: [] };
}

export function demoteHeadings(text: string, levels: number): string {
  return scanLines(text)
    .map((line) => {
      const heading = line.inFence ? null : line.text.match(/^(#{1,6})(\s.*)$/);
      return heading ? `${"#".repeat(Math.min(6, heading[1].length + levels))}${heading[2]}` : line.text;
    })
    .join("\n");
}

export interface ArchiveSource {
  file: string;
  blocks: string[];
}

export function renderArchiveRun(date: string, sources: ArchiveSource[]): string {
  const parts = sources
    .filter((source) => source.blocks.length > 0)
    .map((source) => `### From ${source.file}\n\n${source.blocks.map((block) => demoteHeadings(block.trimEnd(), 2)).join("\n\n")}\n`);
  return parts.length === 0 ? "" : `## Compacted ${date}\n\n${parts.join("\n")}`;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/compact.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/compact.ts tests/compact.test.ts
git commit -m "feat: add Progress.md compaction rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Compaction rules for Session Log.md and Tasks.md

**Files:**
- Modify: `src/compact.ts`
- Test: `tests/compact.test.ts`

- [ ] **Step 1: Write the failing tests**

Change the first import in `tests/compact.test.ts` to:

```ts
import { compactProgress, compactSessionLog, compactTasks, renderArchiveRun, type CompactResult } from "../src/compact.js";
```

Append:

```ts
const entry = (heading: string) => `## ${heading}\n\n${heading} details.\n`;
const headings = (text: string) => text.match(/^## .*$/gm) ?? [];

describe("compactSessionLog", () => {
  it("keeps the newest 20 dated entries oldest to newest and moves the rest", () => {
    const dates = Array.from({ length: 25 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`);
    const mixed = [...dates.slice(10), ...dates.slice(0, 10)];
    const input = `# Session Log\n\n${mixed.map(entry).join("\n")}`;
    const result = compactSessionLog(input);
    expect(headings(result.kept)).toEqual(dates.slice(5).map((d) => `## ${d}`));
    expect(result.moved.map((block) => block.split("\n")[0])).toEqual(dates.slice(0, 5).map((d) => `## ${d}`));
    expectConserved(input, result);
    expect(compactSessionLog(result.kept)).toEqual({ ...result, moved: [] });
  });

  it("breaks same-day ties by HH:MM, then by file position", () => {
    const input = `# Session Log\n\n${[entry("2026-10-01 18:00 late"), entry("2026-10-01 09:00 early"), entry("2026-10-01 09:00 early-second")].join("\n")}`;
    expect(headings(compactSessionLog(input).kept)).toEqual([
      "## 2026-10-01 09:00 early",
      "## 2026-10-01 09:00 early-second",
      "## 2026-10-01 18:00 late"
    ]);
  });

  it("keeps undated entries ahead of dated ones and moves a second H1", () => {
    const input = `# Session Log\n\n${entry("2026-10-02 b")}\n${entry("Respawn checkpoint")}\n# Session Log\n\n${entry("2026-10-01 a")}`;
    const result = compactSessionLog(input);
    expect(headings(result.kept)).toEqual(["## Respawn checkpoint", "## 2026-10-01 a", "## 2026-10-02 b"]);
    expect(result.moved.map((block) => block.trim())).toEqual(["# Session Log"]);
    expect(result.notes).toEqual(["Session Log.md: 1 undated entries kept"]);
  });
});

describe("compactTasks", () => {
  it("moves finished blocks beyond the newest 3", () => {
    const finished = Array.from({ length: 5 }, (_, i) => `## Checkpoint ${i}\n\nprose ${i}\n`);
    const input = `# Tasks\n\n## Active\n\n- [ ] open\n\n${finished.join("\n")}`;
    const result = compactTasks(input);
    expect(result.moved.map((block) => block.split("\n")[0])).toEqual(["## Checkpoint 0", "## Checkpoint 1"]);
    expect(headings(result.kept)).toEqual(["## Active", "## Checkpoint 2", "## Checkpoint 3", "## Checkpoint 4"]);
    expectConserved(input, result);
  });

  it("moves old checked tasks with children, grouped by heading, never one with an open child", () => {
    const done = Array.from({ length: 12 }, (_, i) => `- [x] done ${i}\n  - note ${i}`).join("\n");
    const input = `# Tasks\n\n## Active\n\n- [ ] open one\n- [X] parent\n  - [ ] open child\n${done}\n`;
    const result = compactTasks(input);
    expect(result.moved).toEqual(["## Active\n\n- [x] done 0\n  - note 0\n- [x] done 1\n  - note 1\n"]);
    expect(result.kept).toContain("- [X] parent\n  - [ ] open child");
    expect(result.kept).toContain("- [x] done 11\n  - note 11");
    expect(result.kept).not.toContain("note 0");
    expectConserved(input, result);
    expect(compactTasks(result.kept).moved).toEqual([]);
  });

  it("moves a checked task's indented continuation after a blank line", () => {
    const rest = Array.from({ length: 10 }, (_, i) => `- [x] later ${i}`).join("\n");
    const result = compactTasks(`# Tasks\n\n- [x] first\n\n  continued\n${rest}\n`);
    expect(result.moved).toEqual(["## Tasks\n\n- [x] first\n\n  continued\n"]);
    expect(result.kept).not.toContain("continued");
  });

  it("keeps a checked task whose lines touch a fence", () => {
    const rest = Array.from({ length: 10 }, (_, i) => `- [x] later ${i}`).join("\n");
    const result = compactTasks(`# Tasks\n\n## Active\n\n- [x] first\n  \`\`\`\ncode\n  \`\`\`\n${rest}\n`);
    expect(result.moved).toEqual([]);
  });

  it("ignores task markers inside fenced code", () => {
    const fenced = "```\n" + Array.from({ length: 12 }, (_, i) => `- [x] fenced ${i}`).join("\n") + "\n```\n";
    expect(compactTasks(`# Tasks\n\n## Active\n\n- [ ] open\n\n${fenced}`).moved).toEqual([]);
  });

  it("leaves a small file unchanged", () => {
    const input = "# Tasks\n\n- [ ] a\n- [x] b\n";
    expect(compactTasks(input)).toEqual({ kept: input, moved: [], folded: [], notes: [] });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/compact.test.ts`
Expected: FAIL, `compactSessionLog` / `compactTasks` are not exported.

- [ ] **Step 3: Implement in `src/compact.ts`**

Add `import type { ScannedLine } from "./mcp/markdown.js";` below the existing markdown import, then append:

```ts
const DATE_RE = /\d{4}-\d{2}-\d{2}/;
const TIME_RE = /\b\d{2}:\d{2}\b/;

// "YYYY-MM-DD HH:MM"; an entry without a time sorts as 00:00 on its day.
function sortKey(title: string): string | undefined {
  const date = title.match(DATE_RE);
  if (!date) return undefined;
  const time = title.slice((date.index ?? 0) + date[0].length).match(TIME_RE);
  return `${date[0]} ${time ? time[0] : "00:00"}`;
}

export function compactSessionLog(text: string): CompactResult {
  const { frontmatter, body } = splitFrontmatter(repairEncoding(text));
  const head: Block[] = [];
  const moved: string[] = [];
  const entries: Array<{ block: Block; key?: string; index: number }> = [];
  let titleSeen = false;

  for (const block of splitBlocks(body)) {
    if (block.level === 2) {
      entries.push({ block, key: sortKey(block.title), index: entries.length });
    } else if (block.level === 0 || !titleSeen) {
      if (block.level === 1) titleSeen = true;
      head.push(block);
    } else {
      moved.push(block.text);
    }
  }

  const dated = entries
    .filter((item) => item.key !== undefined)
    .sort((a, b) => a.key!.localeCompare(b.key!) || a.index - b.index);
  const keep = new Set(dated.slice(-SESSION_LOG_KEEP));
  moved.push(...entries.filter((item) => item.key !== undefined && !keep.has(item)).map((item) => item.block.text));

  const undated = entries.filter((item) => item.key === undefined);
  const notes = undated.length > 0 ? [`Session Log.md: ${undated.length} undated entries kept`] : [];
  const kept = [...head, ...undated.map((item) => item.block), ...dated.filter((item) => keep.has(item)).map((item) => item.block)];
  return { kept: joinBlocks(frontmatter, kept), moved: dedupe(moved), folded: [], notes };
}

const OPEN_TASK_RE = /^\s*[-*] \[ \](\s|$)/;
const CHECKED_TASK_RE = /^[-*] \[[xX]\](\s|$)/;

function hasOpenTask(lines: ScannedLine[]): boolean {
  return lines.some((line) => !line.inFence && OPEN_TASK_RE.test(line.text));
}

function moveCheckedTasks(blocks: Block[]): { kept: Block[]; groups: string[] } {
  const scanned = new Map(blocks.map((block) => [block, scanLines(block.text)] as const));
  const tasks: Array<{ block: Block; start: number; end: number; heading: string }> = [];

  for (const block of blocks) {
    const lines = scanned.get(block)!;
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].inFence || !CHECKED_TASK_RE.test(lines[index].text)) continue;
      // The task runs through its last indented line, across blank lines.
      let end = index + 1;
      for (let next = index + 1; next < lines.length; next += 1) {
        if (/^\s+\S/.test(lines[next].text)) end = next + 1;
        else if (lines[next].text.trim() !== "") break;
      }
      const task = lines.slice(index, end);
      // Moving part of a fence would leave an unclosed fence in both files.
      if (!task.some((line) => line.inFence) && !hasOpenTask(task)) {
        tasks.push({ block, start: index, end, heading: block.level === 0 ? "Tasks" : block.title });
      }
      index = end - 1;
    }
  }

  const moving = tasks.slice(0, Math.max(0, tasks.length - TASKS_KEEP_CHECKED));
  if (moving.length === 0) return { kept: blocks, groups: [] };

  const groups = new Map<string, string[]>();
  const dropped = new Map<Block, Set<number>>();
  for (const task of moving) {
    const lines = scanned.get(task.block)!.slice(task.start, task.end).map((line) => line.text);
    groups.set(task.heading, [...(groups.get(task.heading) ?? []), ...lines]);
    const drop = dropped.get(task.block) ?? new Set<number>();
    for (let index = task.start; index < task.end; index += 1) drop.add(index);
    dropped.set(task.block, drop);
  }

  const kept = blocks.map((block) => {
    const drop = dropped.get(block);
    if (!drop) return block;
    const text = scanned.get(block)!.filter((_, index) => !drop.has(index)).map((line) => `${line.text}\n`).join("");
    return { ...block, text };
  });
  return { kept, groups: [...groups].map(([title, lines]) => `## ${title}\n\n${lines.join("\n")}\n`) };
}

export function compactTasks(text: string): CompactResult {
  const { frontmatter, body } = splitFrontmatter(repairEncoding(text));
  const blocks = splitBlocks(body);
  const finished = blocks.filter((block) => block.level === 2 && !hasOpenTask(scanLines(block.text)));
  const movedBlocks = new Set(finished.slice(0, Math.max(0, finished.length - TASKS_KEEP_FINISHED_BLOCKS)));
  const { kept, groups } = moveCheckedTasks(blocks.filter((block) => !movedBlocks.has(block)));
  const moved = [...blocks.filter((block) => movedBlocks.has(block)).map((block) => block.text), ...groups];
  return { kept: joinBlocks(frontmatter, kept), moved: dedupe(moved), folded: [], notes: [] };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/compact.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/compact.ts tests/compact.test.ts
git commit -m "feat: add Session Log and Tasks compaction rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Plan a whole folder; shared archive writer

**Files:**
- Modify: `src/compact.ts`
- Modify: `src/mcp/writer.ts` (add `updateArchiveFile`)
- Test: `tests/compact.test.ts`, `tests/mcp/writer.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/compact.test.ts`, extend the first import with `applyArchive, insertArchiveRun, planCompaction`. Append:

```ts
describe("planCompaction", () => {
  it("collects new texts, moved headings, the archive run and repaired files", () => {
    const files = new Map([
      ["Progress.md", progress("\n## Historical\n\nold\n", bigDone)],
      ["Decisions.md", "# Decisions\n\nUse \u00e2\u20ac\u201d dashes.\n"],
      ["Open Questions.md", "# Open Questions\n"]
    ]);
    const plan = planCompaction(files, "2026-10-20");
    expect([...plan.outputs.keys()]).toEqual(["Progress.md", "Decisions.md"]);
    expect(plan.outputs.get("Decisions.md")).toBe("# Decisions\n\nUse — dashes.\n");
    expect(plan.moved.get("Progress.md")).toEqual(["## Historical"]);
    expect(plan.folded.length).toBeGreaterThan(0);
    expect(plan.repaired).toEqual(["Decisions.md"]);
    expect(plan.run).toBe("## Compacted 2026-10-20\n\n### From Progress.md\n\n#### Historical\n\nold\n");
  });
});

describe("insertArchiveRun / applyArchive", () => {
  it("inserts the run before Archived Done Items and appends folded lines under it", () => {
    const archive = "# Archive\n\n## Archived Done Items\n\n### 2026-10-01\n\n- [x] older\n";
    const run = "## Compacted 2026-10-20\n\n### From Progress.md\n\n#### Old\n\nold\n";
    expect(insertArchiveRun(archive, run)).toBe(
      "# Archive\n\n## Compacted 2026-10-20\n\n### From Progress.md\n\n#### Old\n\nold\n\n## Archived Done Items\n\n### 2026-10-01\n\n- [x] older\n"
    );
    const applied = applyArchive(archive, { run, folded: ["- [x] newer"] });
    expect(applied.indexOf("## Compacted")).toBeLessThan(applied.indexOf("## Archived Done Items"));
    expect(applied.trimEnd().endsWith("- [x] newer")).toBe(true);
  });

  it("appends the run when there is no Archived Done Items heading", () => {
    expect(insertArchiveRun("# Archive\n", "## Compacted x\n")).toBe("# Archive\n\n## Compacted x\n");
  });
});
```

In `tests/mcp/writer.test.ts`, change `import { promises as fs } from "node:fs";` to `import { promises as fs, writeFileSync } from "node:fs";`, add `updateArchiveFile` to the writer import (`ProgressConflictError` is already imported), and append:

```ts
describe("updateArchiveFile", () => {
  it("creates Archive.md when missing, then updates it", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-archive-"));
    await updateArchiveFile(dir, (current) => `${current}one\n`);
    expect(await fs.readFile(path.join(dir, "Archive.md"), "utf-8")).toBe("# Archive\none\n");
    await updateArchiveFile(dir, (current) => `${current}two\n`);
    expect(await fs.readFile(path.join(dir, "Archive.md"), "utf-8")).toBe("# Archive\none\ntwo\n");
  });

  it("reports a conflict when another writer creates Archive.md first", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-archive-"));
    const archivePath = path.join(dir, "Archive.md");
    await expect(
      updateArchiveFile(dir, (current) => {
        writeFileSync(archivePath, "# Archive\nother\n");
        return current;
      })
    ).rejects.toBeInstanceOf(ProgressConflictError);
    expect(await fs.readFile(archivePath, "utf-8")).toBe("# Archive\nother\n");
  });

  it("throws when Archive.md cannot be read", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-archive-"));
    await fs.mkdir(path.join(dir, "Archive.md"));
    await expect(updateArchiveFile(dir, (current) => current)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/compact.test.ts tests/mcp/writer.test.ts`
Expected: FAIL, missing exports.

- [ ] **Step 3: Add `updateArchiveFile` to `src/mcp/writer.ts`**

Place it after `writeFileAtomic`:

```ts
// writeFileAtomic needs an existing file to compare against, so a missing
// archive is created with exclusive create: a concurrent creator makes this
// fail as a conflict instead of being overwritten.
export async function updateArchiveFile(progressDir: string, transform: (current: string) => string): Promise<void> {
  const archivePath = path.join(progressDir, "Archive.md");
  let current: string;
  try {
    current = await fs.readFile(archivePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    try {
      await fs.writeFile(archivePath, transform("# Archive\n"), { encoding: "utf-8", flag: "wx" });
    } catch (createError) {
      if ((createError as NodeJS.ErrnoException).code === "EEXIST") throw new ProgressConflictError(archivePath);
      throw createError;
    }
    return;
  }
  await writeFileAtomic(archivePath, transform(current), sha256(current));
}
```

- [ ] **Step 4: Add the folder plan to `src/compact.ts`**

Change the imports at the top of `src/compact.ts` to:

```ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { hasMojibake, repairEncoding } from "./encoding.js";
import { scanLines, sectionMatches, splitFrontmatter } from "./mcp/markdown.js";
import type { ScannedLine } from "./mcp/markdown.js";
import { ALLOWED_PROGRESS_SECTIONS, appendToArchive, foldDoneSection } from "./mcp/writer.js";
```

Then append:

```ts
export const COMPACT_FILES = ["Progress.md", "Session Log.md", "Tasks.md", "Decisions.md", "Open Questions.md"] as const;

export interface CompactionPlan {
  outputs: Map<string, string>;
  moved: Map<string, string[]>;
  run: string;
  folded: string[];
  repaired: string[];
  notes: string[];
}

function compactFile(name: string, text: string): CompactResult {
  if (name === "Progress.md") return compactProgress(text);
  if (name === "Session Log.md") return compactSessionLog(text);
  if (name === "Tasks.md") return compactTasks(text);
  return { kept: repairEncoding(text), moved: [], folded: [], notes: [] };
}

// files: name -> LF text. Pure; the CLI and the health check both use it.
export function planCompaction(files: Map<string, string>, date: string): CompactionPlan {
  const plan: CompactionPlan = { outputs: new Map(), moved: new Map(), run: "", folded: [], repaired: [], notes: [] };
  const sources: ArchiveSource[] = [];
  for (const [name, text] of files) {
    const result = compactFile(name, text);
    if (result.kept !== text) plan.outputs.set(name, result.kept);
    if (result.moved.length > 0) {
      plan.moved.set(name, result.moved.map((block) => block.split("\n")[0]));
      sources.push({ file: name, blocks: result.moved });
    }
    if (result.folded.length > 0) plan.folded = result.folded;
    if (hasMojibake(text)) plan.repaired.push(name);
    plan.notes.push(...result.notes);
  }
  plan.run = renderArchiveRun(date, sources);
  return plan;
}

export function insertArchiveRun(archive: string, run: string): string {
  if (!run) return archive;
  const doneItems = sectionMatches(archive).find((match) => match.title === "Archived Done Items");
  if (!doneItems) return `${archive.trimEnd()}\n\n${run}`;
  return `${archive.slice(0, doneItems.start).trimEnd()}\n\n${run}\n${archive.slice(doneItems.start)}`;
}

// The run goes before `## Archived Done Items` so that heading stays last and
// every later append (here and in the MCP fold) lands under it.
export function applyArchive(archive: string, plan: Pick<CompactionPlan, "run" | "folded">): string {
  return appendToArchive(insertArchiveRun(archive, plan.run), plan.folded);
}

export interface SourceFile {
  raw: string;
  text: string;
  eol: string;
}

export async function readProgressFiles(progressDir: string): Promise<Map<string, SourceFile>> {
  const files = new Map<string, SourceFile>();
  for (const name of COMPACT_FILES) {
    let raw: string;
    try {
      raw = await fs.readFile(path.join(progressDir, name), "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    files.set(name, { raw, text: raw.replace(/\r\n/g, "\n"), eol: raw.includes("\r\n") ? "\r\n" : "\n" });
  }
  return files;
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/compact.test.ts tests/mcp && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/compact.ts src/mcp/writer.ts tests/compact.test.ts tests/mcp/writer.test.ts
git commit -m "feat: plan folder compaction and share the archive writer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: MCP Done fold never loses folded items

**Files:**
- Modify: `src/mcp/server.ts` (import block lines 11-25; the archive block in `update_project_progress`, around lines 446-457)
- Test: `tests/mcp/server.test.ts`

- [ ] **Step 1: Write the failing test**

Add `archiveFoldedItems` to the `../../src/mcp/server.js` import in `tests/mcp/server.test.ts`, then append:

```ts
describe("archiveFoldedItems", () => {
  it("archives folded Done items", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-fold-"));
    const progressPath = path.join(dir, "Progress.md");
    expect(await archiveFoldedItems(progressPath, ["- [x] old"])).toEqual({});
    expect(await fs.readFile(path.join(dir, "Archive.md"), "utf-8")).toContain("- [x] old");
  });

  it("hands folded items back when the archive cannot be written", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-fold-"));
    await fs.mkdir(path.join(dir, "Archive.md"));
    const result = await archiveFoldedItems(path.join(dir, "Progress.md"), ["- [x] old"]);
    expect(result.unarchivedItems).toEqual(["- [x] old"]);
    expect(result.archiveError).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/mcp/server.test.ts`
Expected: FAIL, `archiveFoldedItems` is not exported.

- [ ] **Step 3: Implement**

In `src/mcp/server.ts`, add `updateArchiveFile` to the `./writer.js` import list. Add above `conflictResult`:

```ts
// Called after the guarded Progress.md write (ADR 0020). Progress.md has
// already dropped these items, so a failed archive write hands them back
// instead of losing them.
export async function archiveFoldedItems(
  progressPath: string,
  items: string[]
): Promise<{ archiveError?: string; unarchivedItems?: string[] }> {
  if (items.length === 0) return {};
  try {
    await updateArchiveFile(path.dirname(progressPath), (current) => appendToArchive(current, items));
    return {};
  } catch (error) {
    return { archiveError: error instanceof Error ? error.message : String(error), unarchivedItems: items };
  }
}
```

In the `update_project_progress` handler, replace everything from the comment `// Archiving only after the guarded write lands.` through the final `return textResult(...)` with:

```ts
      // Archiving only after the guarded write lands (ADR 0020).
      const archive = await archiveFoldedItems(match.progressPath, archived);
      return textResult(JSON.stringify({
        updated: true,
        operation: result.operation,
        project,
        section,
        archived: archive.unarchivedItems ? 0 : archived.length,
        ...archive,
        updatedAt: new Date().toISOString(),
        progressPath: match.progressPath
      }));
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/mcp && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/server.ts tests/mcp/server.test.ts
git commit -m "fix: return Done items the archive write could not keep" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Health findings in SessionStart and Stop

**Files:**
- Modify: `src/hook/validator.ts`
- Modify: `src/hook/cc-adapter.ts` (imports, `handleSessionStart`, the validation block in `handleStop`)
- Test: `tests/hook/validator.test.ts`, `tests/plugin/cc-adapter.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/hook/validator.test.ts` (add `checkProgressHealth` to the validator import):

```ts
describe("checkProgressHealth", () => {
  async function folder(files: Record<string, string>): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-health-"));
    for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(dir, name), content, "utf-8");
    return dir;
  }

  it("is silent for the valid fixture", async () => {
    expect(await checkProgressHealth("tests/fixtures/valid-project/project-progress")).toEqual([]);
  });

  it("reports what compact would move and what only an edit can fix", async () => {
    // Checkouts with core.autocrlf=true give this fixture CRLF endings.
    const valid = (await fs.readFile("tests/fixtures/valid-project/project-progress/Progress.md", "utf-8")).replace(/\r\n/g, "\n");
    const longNext = `${"y".repeat(4100)}`;
    const dir = await folder({
      "Progress.md": `${valid.replace(/## Next Action\n\n[^\n]*/, `## Next Action\n\n${longNext}`)}\n## Historical Notes\n\n${"x".repeat(17 * 1024)}\n`,
      "Decisions.md": "# Decisions\n\n\u00e2\u20ac\u201d\n"
    });
    const findings = await checkProgressHealth(dir);
    expect(findings).toEqual([
      { message: "compact would move Progress.md 1 blocks", remedy: "compact" },
      { message: "garbled characters in Decisions.md", remedy: "compact" },
      { message: "Progress.md Next Action is 4100 characters (budget 4000)", remedy: "edit" }
    ]);
  });
});
```

Append to `tests/plugin/cc-adapter.test.ts` inside `describe("cc-adapter session-start", ...)`:

```ts
  it("adds a progress health line when compact would move history", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      await writeProgress(dir, `${progressDoc({})}\n## Historical Notes\n\nold\n`);
      const result = await handleSessionStart({ cwd: dir, session_id: `health-${Date.now()}` });
      const context = JSON.parse(result.stdout!).hookSpecificOutput.additionalContext as string;
      expect(context).toContain("Progress health: compact would move Progress.md 1 blocks — run node ");
      expect(context).toContain(" compact ");
    });
  });

  it("omits the health line for a healthy progress folder", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      await writeProgress(dir, progressDoc({}));
      const result = await handleSessionStart({ cwd: dir, session_id: `healthy-${Date.now()}` });
      const context = JSON.parse(result.stdout!).hookSpecificOutput.additionalContext as string;
      expect(context).not.toContain("Progress health");
    });
  });

  it("keeps the resume context when the health check fails", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      await writeProgress(dir, progressDoc({}));
      await fs.mkdir(path.join(dir, "project-progress", "Tasks.md"));
      const result = await handleSessionStart({ cwd: dir, session_id: `health-fail-${Date.now()}` });
      const context = JSON.parse(result.stdout!).hookSpecificOutput.additionalContext as string;
      expect(context).toContain("Resume Snapshot:");
      expect(context).not.toContain("Progress health");
    });
  });
```

Append inside the stop-hook `describe`, after the test added in Task 2:

```ts
  it("names the compact command once when compact would move history", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      const file = await writeProgress(dir, `${progressDoc({})}\n## Historical Notes\n\nold\n`);
      await commitAll(dir, "init");
      await fs.writeFile(path.join(dir, "src.txt"), "work", "utf-8");

      const sessionId = `s-compact-${Date.now()}`;
      await handleSessionStart({ cwd: dir, session_id: sessionId });
      const current = await fs.readFile(file, "utf-8");
      await fs.writeFile(file, current.replace("Wire the widget.", "Ship the widget."), "utf-8");

      const first = await handleStop({ cwd: dir, session_id: sessionId });
      expect(first.stdout).toContain("compact would move Progress.md 1 blocks");
      expect(first.stdout).toContain("Preview the cleanup with `node ");

      const second = await handleStop({ cwd: dir, session_id: sessionId });
      expect(second.stdout ?? "").not.toContain("compact would move");
    });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/hook/validator.test.ts tests/plugin/cc-adapter.test.ts`
Expected: FAIL, `checkProgressHealth` is not exported; no health line.

- [ ] **Step 3: Implement `checkProgressHealth` in `src/hook/validator.ts`**

Add imports at the top:

```ts
import path from "node:path";
import { KEPT_PROGRESS_SECTIONS, planCompaction, readProgressFiles } from "../compact.js";
import { extractSection } from "../mcp/markdown.js";
import { MAX_SECTION_CONTENT_LENGTH } from "../mcp/writer.js";
```

(Merge `extractSection` into the existing `../mcp/markdown.js` import line instead of adding a second one.) Append:

```ts
export const PROGRESS_BYTES_BUDGET = 16 * 1024;
export const SESSION_LOG_ENTRIES_BUDGET = 40;

export interface HealthFinding {
  message: string;
  remedy: "compact" | "edit";
}

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

// Runs the compaction rules in memory, so "compact" is suggested only when it
// would actually change something; the rest needs a human or agent edit.
export async function checkProgressHealth(progressDir: string): Promise<HealthFinding[]> {
  const sources = await readProgressFiles(path.resolve(progressDir));
  const texts = new Map([...sources].map(([name, source]) => [name, source.text]));
  const plan = planCompaction(texts, "health");
  const findings: HealthFinding[] = [];

  const moves = [...plan.moved].map(([name, headings]) => `${name} ${headings.length} blocks`);
  if (plan.folded.length > 0) moves.push(`${plan.folded.length} Done lines`);
  if (moves.length > 0) findings.push({ message: `compact would move ${moves.join(", ")}`, remedy: "compact" });
  for (const name of plan.repaired) findings.push({ message: `garbled characters in ${name}`, remedy: "compact" });

  const progress = plan.outputs.get("Progress.md") ?? texts.get("Progress.md");
  if (progress !== undefined) {
    const bytes = Buffer.byteLength(progress, "utf-8");
    if (bytes > PROGRESS_BYTES_BUDGET) {
      findings.push({ message: `Progress.md is ${kb(bytes)} after compact (budget ${kb(PROGRESS_BYTES_BUDGET)}); shorten long sections`, remedy: "edit" });
    }
    for (const title of KEPT_PROGRESS_SECTIONS) {
      const length = extractSection(progress, title).length;
      if (length > MAX_SECTION_CONTENT_LENGTH) {
        findings.push({ message: `Progress.md ${title} is ${length} characters (budget ${MAX_SECTION_CONTENT_LENGTH})`, remedy: "edit" });
      }
    }
  }

  const log = plan.outputs.get("Session Log.md") ?? texts.get("Session Log.md");
  if (log !== undefined) {
    const entries = listSections(log).length;
    if (entries > SESSION_LOG_ENTRIES_BUDGET) {
      findings.push({ message: `Session Log.md has ${entries} entries after compact (budget ${SESSION_LOG_ENTRIES_BUDGET}); date or remove undated entries`, remedy: "edit" });
    }
  }
  return findings;
}
```

- [ ] **Step 4: Use it in `src/hook/cc-adapter.ts`**

Change the `node:url` import to `import { fileURLToPath, pathToFileURL } from "node:url";` and the validator import to `import { checkProgressHealth, summarizeProblems, validateProgressFile } from "./validator.js";`, plus `import type { HealthFinding } from "./validator.js";`. Add after `boundedContext`:

```ts
// Built from this file's location so it works for plugin installs, where the
// awesome-progress-tracker binary is usually not on PATH.
function compactCommand(cwd: string): string {
  const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "cli.js");
  return `node "${cli}" compact "${cwd}"`;
}

async function bestEffortHealth(progressPath: string): Promise<HealthFinding[]> {
  try {
    return await checkProgressHealth(path.dirname(progressPath));
  } catch {
    return [];
  }
}
```

In `handleSessionStart`, after `if (runtime) lines.push(`\n${runtime}`);` add:

```ts
  const health = await bestEffortHealth(progressPath);
  if (health.length > 0) {
    const command = health.some((finding) => finding.remedy === "compact") ? ` — run ${compactCommand(cwd)}` : "";
    lines.push(`\nProgress health: ${boundedContext(health.map((finding) => finding.message).join("; "), 300)}${command}`);
  }
```

In `handleStop`, replace the whole `try { const errors = ... } catch { ... }` block from Task 2 with:

```ts
  try {
    const errors = await validateProgressFile(progressPath);
    const secretErrors = errors.filter((error) => error.includes("secret-like"));
    if (secretErrors.length > 0) {
      warnings.push(`Progress file may contain secrets (${secretErrors.join("; ")}); remove them.`);
    }
    // Shown once per session: these persist until someone edits the files, and
    // repeating them on every stop turns a report into noise.
    if (!sessionState.healthShown) {
      const health = await bestEffortHealth(progressPath);
      const problems = [
        ...errors.filter((error) => !error.includes("secret-like")),
        ...health.map((finding) => finding.message)
      ];
      if (problems.length > 0) {
        const command = health.some((finding) => finding.remedy === "compact") ? compactCommand(cwd) : undefined;
        warnings.push(summarizeProblems(problems, command));
        if (event.session_id) {
          await writeSessionState(event.session_id, { ...(await readSessionState(event.session_id)), healthShown: true });
        }
      }
    }
  } catch {
    // validation is best effort
  }
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/hook tests/plugin && npm run typecheck`
Expected: PASS. If "is silent for the valid fixture" fails, read the finding: a fixture whose sections are only re-spaced is not a finding (findings use moved blocks and repairs only), so a failure points to a real unknown section or garbled text in the fixture folder.

- [ ] **Step 6: Commit**

```bash
git add src/hook/validator.ts src/hook/cc-adapter.ts tests/hook/validator.test.ts tests/plugin/cc-adapter.test.ts
git commit -m "feat: report progress health at session start and stop" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: `compact` command

**Files:**
- Modify: `src/cli.ts` (imports, `helpText`, `ParsedArgs`, `parseArgs`, `runCli`)
- Test: `tests/compact.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/compact.test.ts`, adding at the top `import { promises as fs } from "node:fs";`, `import os from "node:os";`, `import path from "node:path";`, and `import { compactProject, parseArgs } from "../src/cli.js";`:

```ts
describe("compactProject", () => {
  async function project(files: Record<string, string>): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pp-compact-"));
    await fs.mkdir(path.join(root, "project-progress"));
    for (const [name, content] of Object.entries(files)) {
      await fs.writeFile(path.join(root, "project-progress", name), content, "utf-8");
    }
    return root;
  }
  const read = (root: string, name: string) => fs.readFile(path.join(root, "project-progress", name), "utf-8");

  it("parses --write", () => {
    expect(parseArgs(["compact", "dir", "--write"])).toMatchObject({ command: "compact", targetDir: "dir", write: true });
  });

  it("dry run reports moves and writes nothing", async () => {
    const input = progress("\n## Historical\n\nold\n");
    const root = await project({ "Progress.md": input });
    const report = await compactProject({ targetDir: root, date: "2026-10-20" });
    expect(report.written).toBe(false);
    expect(report.files.find((file) => file.file === "Progress.md")?.moved).toEqual(["## Historical"]);
    expect(await read(root, "Progress.md")).toBe(input);
    await expect(fs.access(path.join(root, "project-progress", "Archive.md"))).rejects.toThrow();
  });

  it("--write creates Archive.md, keeps CRLF, and a second run moves nothing", async () => {
    const root = await project({
      "Progress.md": progress("\n## Historical\n\nold\n").replace(/\n/g, "\r\n"),
      "Session Log.md": "# Session Log\n\n## 2026-10-02 b\n\nb\n\n## 2026-10-01 a\n\na\n"
    });
    const report = await compactProject({ targetDir: root, write: true, date: "2026-10-20" });
    expect(report.written).toBe(true);
    expect(await read(root, "Progress.md")).toBe(progress().replace(/\n/g, "\r\n"));
    // Archive.md takes Progress.md's line ending.
    expect(await read(root, "Archive.md")).toBe(
      "# Archive\n\n## Compacted 2026-10-20\n\n### From Progress.md\n\n#### Historical\n\nold\n".replace(/\n/g, "\r\n")
    );
    expect(await read(root, "Session Log.md")).toBe("# Session Log\n\n## 2026-10-01 a\n\na\n\n## 2026-10-02 b\n\nb\n");

    const again = await compactProject({ targetDir: root, write: true, date: "2026-10-21" });
    expect(again.written).toBe(false);
    expect(await read(root, "Archive.md")).not.toContain("2026-10-21");
  });

  it("inserts the run before an existing Archived Done Items section", async () => {
    const root = await project({
      "Progress.md": progress("\n## Historical\n\nold\n"),
      "Archive.md": "# Archive\n\n## Archived Done Items\n\n### 2026-10-01\n\n- [x] older\n"
    });
    await compactProject({ targetDir: root, write: true, date: "2026-10-20" });
    expect(await read(root, "Archive.md")).toBe(
      "# Archive\n\n## Compacted 2026-10-20\n\n### From Progress.md\n\n#### Historical\n\nold\n\n## Archived Done Items\n\n### 2026-10-01\n\n- [x] older\n"
    );
  });

  it("refuses a folder without Progress.md", async () => {
    const root = await project({});
    await expect(compactProject({ targetDir: root })).rejects.toThrow("No project-progress/Progress.md");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/compact.test.ts`
Expected: FAIL, `compactProject` is not exported.

- [ ] **Step 3: Implement in `src/cli.ts`**

Add imports:

```ts
import { sha256 } from "./hash.js";
import { planCompaction, readProgressFiles, applyArchive } from "./compact.js";
import { ProgressConflictError, updateArchiveFile, writeFileAtomic } from "./mcp/writer.js";
```

(If `src/cli.ts` already imports from `./hash.js` or `./mcp/writer.js`, merge into those lines.)

In `helpText()`, add the usage line after the `init` usage line:

```
  awesome-progress-tracker compact [directory] [--write]
```

and the command line after `init   Create project-progress/ ...`:

```
  compact  Move old progress history into Archive.md (dry run unless --write).
```

In `interface ParsedArgs` add `write?: boolean;`. In `parseArgs`, add before the `--json` branch:

```ts
    } else if (arg === "--write") {
      parsed.write = true;
```

Add above `runCli`:

```ts
export interface CompactReport {
  progressDir: string;
  written: boolean;
  files: Array<{ file: string; beforeBytes: number; afterBytes: number; moved: string[] }>;
  folded: number;
  repaired: string[];
  notes: string[];
}

export async function compactProject(options: { targetDir?: string; write?: boolean; date?: string } = {}): Promise<CompactReport> {
  const progressDir = path.join(path.resolve(options.targetDir ?? process.cwd()), "project-progress");
  const sources = await readProgressFiles(progressDir);
  if (!sources.has("Progress.md")) {
    throw new Error(`No project-progress/Progress.md under ${path.dirname(progressDir)}`);
  }

  const plan = planCompaction(
    new Map([...sources].map(([name, source]) => [name, source.text])),
    options.date ?? new Date().toISOString().slice(0, 10)
  );
  const report: CompactReport = {
    progressDir,
    written: false,
    files: [...sources].map(([name, source]) => ({
      file: name,
      beforeBytes: Buffer.byteLength(source.raw, "utf-8"),
      afterBytes: Buffer.byteLength(plan.outputs.get(name) ?? source.text, "utf-8"),
      moved: plan.moved.get(name) ?? []
    })),
    folded: plan.folded.length,
    repaired: plan.repaired,
    notes: plan.notes
  };
  if (!options.write || plan.outputs.size === 0) return report;

  try {
    // Any change since planning means another writer is active; stop before the archive grows.
    for (const [name, source] of sources) {
      const filePath = path.join(progressDir, name);
      if (sha256(await fs.readFile(filePath, "utf-8")) !== sha256(source.raw)) throw new ProgressConflictError(filePath);
    }
    // Archive first: a failure after this point duplicates text in Archive.md instead of losing it.
    if (plan.run || plan.folded.length > 0) {
      const eol = sources.get("Progress.md")!.eol;
      await updateArchiveFile(progressDir, (current) =>
        applyArchive(current.replace(/\r\n/g, "\n"), plan).replace(/\n/g, eol)
      );
    }
    for (const [name, text] of plan.outputs) {
      const source = sources.get(name)!;
      await writeFileAtomic(path.join(progressDir, name), text.replace(/\n/g, source.eol), sha256(source.raw));
    }
  } catch (error) {
    if (error instanceof ProgressConflictError) {
      throw new Error(`${path.basename(error.filePath)} changed while compact was running; rerun compact.`);
    }
    throw error;
  }
  return { ...report, written: true };
}

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}
```

In `runCli`, before `if (parsed.command === "mcp")`, add:

```ts
  if (parsed.command === "compact") {
    const report = await compactProject({ targetDir: parsed.targetDir, write: parsed.write });
    console.log(
      report.written
        ? "compact: written"
        : parsed.write
          ? "compact: nothing to change"
          : "compact: dry run, nothing written (add --write to apply)"
    );
    for (const file of report.files) {
      console.log(`${file.file}: ${formatKb(file.beforeBytes)} -> ${formatKb(file.afterBytes)}, ${file.moved.length} blocks moved`);
      for (const heading of file.moved) console.log(`  - ${heading}`);
    }
    if (report.folded > 0) console.log(`Done: ${report.folded} lines folded into Archive.md`);
    for (const name of report.repaired) console.log(`repaired garbled characters: ${name}`);
    for (const note of report.notes) console.log(`note: ${note}`);
    return 0;
  }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/compact.test.ts tests/mcp/cli.test.ts tests/hook/cli.test.ts && npm run typecheck`
Expected: PASS. If a help-text test in `tests/mcp/cli.test.ts` asserts the exact usage block, add the two new lines to its expectation.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts tests/compact.test.ts tests/mcp/cli.test.ts
git commit -m "feat: add compact command" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Skill, template, and README

**Files:**
- Modify: `skills/project-progress/SKILL.md` (the paragraph starting "When `Done` grows large")
- Modify: `templates/project-progress/Session Log.md`
- Modify: `README.md` (before `## MCP Server`)

- [ ] **Step 1: Replace the SKILL.md paragraph**

Replace the paragraph that starts "When `Done` grows large, the `update_project_progress` MCP tool automatically folds" with:

```markdown
When `Done` grows large, the `update_project_progress` MCP tool folds the oldest completed items into `Archive.md`. Old text from any other section also belongs in `Archive.md`: never add `Historical …` or other new `##` sections to `Progress.md`, and never create `*-History-*.md` files or a second session log. Append each `Session Log.md` entry at the bottom with a heading `## YYYY-MM-DD HH:MM <topic>`.

When session start shows a `Progress health:` line, or the stop hook reports progress file problems that name a `compact` command, run that command to preview the cleanup, then run it again with `--write`, as its own step. The rewrite counts as a `Progress.md` update for the stop hook, so still update `Resume Snapshot`, `Next Action`, and `Blockers` when you did other work. Problems marked for editing need you to shorten or fill the named sections. `Archive.md` is not part of the default token-conscious read order; read it only when explicitly asked about older work.
```

- [ ] **Step 2: Update the Session Log template**

In `templates/project-progress/Session Log.md`, change `## 2026-06-26` to `## 2026-06-26 09:00 Initialize tracking`.

- [ ] **Step 3: Add the README section**

Insert before the `## MCP Server` heading:

````markdown
## Keep Progress Files Small

Hooks report when progress files grow: session start shows a `Progress health:` line and the stop hook lists problems once per session. `compact` moves old history into `Archive.md` without rewriting it:

```bash
awesome-progress-tracker compact            # preview what moves
awesome-progress-tracker compact --write    # apply
```

It moves unknown `Progress.md` sections, Session Log entries beyond the newest 20, finished `Tasks.md` sections (any `##` section without an open task, so keep reference notes elsewhere), and old checked tasks, and repairs garbled characters. Commit before running `--write` so the move is one reviewable diff.
````

- [ ] **Step 4: Run the instruction-pack tests**

Run: `npx vitest run tests/hook/instruction-pack.test.ts tests/mcp/cli.test.ts`
Expected: PASS. If an assertion quotes the old SKILL.md fold sentence or the template heading, update that assertion to the new text.

- [ ] **Step 5: Commit**

```bash
git add skills/project-progress/SKILL.md "templates/project-progress/Session Log.md" README.md tests
git commit -m "docs: explain where progress history goes and how to compact it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Full verification, real-data dry run, dist

- [ ] **Step 1: Full suite**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass, build clean.

- [ ] **Step 2: Real-data dry run (read-only)**

Run: `node dist/src/cli.js compact D:/depot/agenticwars-game-backup`
Expected (measured 2026-10-20 on the files as they were then; they may have changed since): `compact: dry run, nothing written`; `Progress.md: 188.7 KB -> 6.7 KB, 47 blocks moved`; `Session Log.md: 223.1 KB -> 39.7 KB, 189 blocks moved`; `Tasks.md: 66.0 KB -> 4.6 KB, 44 blocks moved`; `Done: 25 lines folded`; `repaired garbled characters` lines for Progress.md, Session Log.md, Decisions.md; `note: Session Log.md: 9 undated entries kept`. Confirm with `git -C D:/depot/agenticwars-game-backup status --short project-progress` that nothing changed. Record the reported numbers in the spec's agenticwars section.

- [ ] **Step 3: Hook smoke on the real folder (read-only)**

Run: `node -e "import('./dist/src/hook/validator.js').then(m=>m.checkProgressHealth('D:/depot/agenticwars-game-backup/project-progress')).then(r=>console.log(r))"`
Expected: a `compact would move …` finding and garbled-character findings.

- [ ] **Step 4: Commit dist and progress**

Update `project-progress/Progress.md` (Resume Snapshot, Next Action, Blockers, Last Session) with the result, then:

```bash
git add dist project-progress/Progress.md docs/superpowers
git commit -m "chore: rebuild dist for progress compaction" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Release (version bump, tag, publish) is the owner's call; do not do it as part of this plan.

---

### Task 12: agenticwars cleanup (after release, owner-approved, not TDD)

Follow the spec's "agenticwars cleanup" section. Every step that writes in `D:/depot/agenticwars-game-backup` needs the owner's go-ahead in chat first: the checkpoint commit, `compact --write`, and each hand-pass edit batch.
