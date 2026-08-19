# Session Handoff and Body-Hash Freshness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distinguish a session that ended deliberately from one whose context died mid-task, and record which session last touched the project.

**Architecture:** Two optional frontmatter keys written pessimistically at SessionStart and cleared at Stop. Because SessionStart now writes `Progress.md`, two existing mechanisms must change or they silently break: the freshness check moves from file mtime to a hash of the Markdown body, and the meaningful-work predicate stops counting changes under `project-progress/`.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Node built-ins only (`node:crypto` for hashing), vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-session-handoff-design.md`

**Depends on:** the checkpoint plan (`2026-08-19-checkpoint-validation.md`). Task 6 modifies `bestEffortStampCheckpoint`, which that plan creates, and Task 1 extends the `OPTIONAL_FRONTMATTER` list it introduces.

---

## File Structure

- **Create** `src/hash.ts` — `sha256`, `bodyOf`, `bodyHash`. Lives at `src/` root, next to `project-state.ts`, because both `src/hook/` and `src/mcp/` import it (the concurrency plan reuses `sha256`).
- **Create** `tests/hash.test.ts`.
- **Modify** `src/hook/freshness.ts` — accept an optional session body hash, fall back to mtime.
- **Modify** `src/hook/schema.ts` — validate `handoff`, register both keys as optional.
- **Modify** `src/hook/cc-adapter.ts` — record the body hash, filter the meaningful-work predicate, write and report handoff.
- **Create** `docs/adr/0019-session-handoff.md`.

---

## Task 1: Body hashing helper

**Files:**
- Create: `src/hash.ts`
- Test: `tests/hash.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/hash.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bodyHash, bodyOf, sha256 } from "../src/hash.js";

describe("sha256", () => {
  it("is stable and differs for different inputs", () => {
    expect(sha256("abc")).toBe(sha256("abc"));
    expect(sha256("abc")).not.toBe(sha256("abd"));
    expect(sha256("abc")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("bodyOf", () => {
  it("strips a leading frontmatter block", () => {
    const markdown = "---\nproject: Demo\nstatus: active\n---\n\n## Next Action\n\nDo the thing.\n";
    expect(bodyOf(markdown)).toBe("\n## Next Action\n\nDo the thing.\n");
  });

  it("returns the whole document when there is no frontmatter", () => {
    const markdown = "## Next Action\n\nDo the thing.\n";
    expect(bodyOf(markdown)).toBe(markdown);
  });

  it("returns the whole document when the frontmatter is unterminated", () => {
    const markdown = "---\nproject: Demo\n\n## Next Action\n";
    expect(bodyOf(markdown)).toBe(markdown);
  });

  it("strips a leading byte order mark", () => {
    expect(bodyOf("﻿---\na: 1\n---\nbody\n")).toBe("body\n");
  });
});

describe("bodyHash", () => {
  it("ignores frontmatter-only changes", () => {
    const before = "---\nhandoff: clean\n---\n\n## Next Action\n\nDo the thing.\n";
    const after = "---\nhandoff: interrupted\nsession_id: abc\n---\n\n## Next Action\n\nDo the thing.\n";
    expect(bodyHash(after)).toBe(bodyHash(before));
  });

  it("changes when the body changes", () => {
    const before = "---\na: 1\n---\n\n## Next Action\n\nDo the thing.\n";
    const after = "---\na: 1\n---\n\n## Next Action\n\nDo a different thing.\n";
    expect(bodyHash(after)).not.toBe(bodyHash(before));
  });

  it("treats CRLF and LF bodies as identical", () => {
    const lf = "---\na: 1\n---\n\n## Next Action\n\nDo the thing.\n";
    const crlf = "---\r\na: 1\r\n---\r\n\r\n## Next Action\r\n\r\nDo the thing.\r\n";
    expect(bodyHash(crlf)).toBe(bodyHash(lf));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hash.test.ts`

Expected: FAIL — cannot resolve `../src/hash.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/hash.ts`:

```ts
import { createHash } from "node:crypto";

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf-8").digest("hex");
}

// Returns the Markdown body with any leading YAML frontmatter block removed.
// Line endings are normalized to LF so a CRLF checkout and an LF checkout of
// the same content hash identically.
export function bodyOf(markdown: string): string {
  const text = markdown.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return text;

  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "---") {
      return lines.slice(index + 1).join("\n");
    }
  }

  // Unterminated frontmatter is not frontmatter; treat the whole file as body.
  return text;
}

export function bodyHash(markdown: string): string {
  return sha256(bodyOf(markdown));
}
```

Note the no-frontmatter and unterminated cases return `text`, which has the BOM stripped but line endings untouched. That is intentional: those documents have no frontmatter boundary to normalize around, and the tests assert the document is returned unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hash.test.ts`

Expected: PASS, 9 tests.

If the CRLF test fails, the cause is the no-frontmatter early return path being taken; confirm `lines[0].trim()` is comparing `"---"` after the `\r` was consumed by the split regex.

- [ ] **Step 5: Commit**

```bash
git add src/hash.ts tests/hash.test.ts
git commit -m "feat: add frontmatter-insensitive body hashing helper"
```

---

## Task 2: Freshness by body hash

**Files:**
- Modify: `src/hook/freshness.ts`
- Test: `tests/hook/freshness.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/hook/freshness.test.ts`, adding whatever `fs`, `os`, and `path` imports the file does not already have:

```ts
import { bodyHash } from "../../src/hash.js";

async function writeTempProgress(content: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-fresh-"));
  const file = path.join(dir, "Progress.md");
  await fs.writeFile(file, content, "utf-8");
  return file;
}

const DOC = "---\nproject: Demo\n---\n\n## Next Action\n\nDo the thing.\n";

describe("checkFreshness with a session body hash", () => {
  it("reports stale when only frontmatter changed", async () => {
    const file = await writeTempProgress(DOC);
    const recorded = bodyHash(DOC);

    await fs.writeFile(
      file,
      "---\nproject: Demo\nhandoff: interrupted\n---\n\n## Next Action\n\nDo the thing.\n",
      "utf-8"
    );

    const result = await checkFreshness(file, {
      meaningfulWorkHappened: true,
      sessionStartedAt: new Date(0),
      completionBoundary: true,
      sessionBodyHash: recorded
    });

    expect(result.isFresh).toBe(false);
    expect(result.shouldBlock).toBe(true);
  });

  it("reports fresh when the body changed", async () => {
    const file = await writeTempProgress(DOC);
    const recorded = bodyHash(DOC);

    await fs.writeFile(file, "---\nproject: Demo\n---\n\n## Next Action\n\nDo something else.\n", "utf-8");

    const result = await checkFreshness(file, {
      meaningfulWorkHappened: true,
      sessionStartedAt: new Date(0),
      completionBoundary: true,
      sessionBodyHash: recorded
    });

    expect(result.isFresh).toBe(true);
  });

  it("falls back to mtime when no hash was recorded", async () => {
    const file = await writeTempProgress(DOC);

    const result = await checkFreshness(file, {
      meaningfulWorkHappened: true,
      // The file was just written, so an old session start means it is fresh.
      sessionStartedAt: new Date(0),
      completionBoundary: true
    });

    expect(result.isFresh).toBe(true);
  });

  it("still short-circuits when no meaningful work happened", async () => {
    const file = await writeTempProgress(DOC);

    const result = await checkFreshness(file, {
      meaningfulWorkHappened: false,
      sessionStartedAt: new Date(0),
      sessionBodyHash: bodyHash(DOC)
    });

    expect(result.isFresh).toBe(true);
    expect(result.shouldWarn).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hook/freshness.test.ts`

Expected: FAIL — the frontmatter-only change is reported fresh, because mtime moved.

- [ ] **Step 3: Write minimal implementation**

In `src/hook/freshness.ts`, add the import:

```ts
import { bodyHash } from "../hash.js";
```

Extend the options interface:

```ts
export interface FreshnessOptions {
  meaningfulWorkHappened: boolean;
  sessionStartedAt: Date;
  completionBoundary?: boolean;
  // Hash of the Markdown body as it stood at session start. When present it
  // replaces the mtime comparison entirely, so hook writes that only touch
  // frontmatter cannot satisfy the gate. Absent means the session-state file
  // was unavailable; the mtime comparison is kept as the degraded fallback.
  sessionBodyHash?: string;
}
```

Replace the body of `checkFreshness` after the `meaningfulWorkHappened` short-circuit with:

```ts
  if (sessionBodyHash !== undefined) {
    const markdown = await fs.readFile(progressPath, "utf-8");
    if (bodyHash(markdown) !== sessionBodyHash) {
      return { isFresh: true, shouldWarn: false, shouldBlock: false, message: "Progress body changed this session." };
    }

    return {
      isFresh: false,
      shouldWarn: true,
      shouldBlock: completionBoundary,
      message:
        `Progress file is stale: the body of ${progressPath} is unchanged since session start.`
    };
  }

  const stats = await fs.stat(progressPath);
  const mtime = new Date(stats.mtimeMs);

  if (mtime.getTime() >= sessionStartedAt.getTime()) {
    return { isFresh: true, shouldWarn: false, shouldBlock: false, message: "Progress file is fresh." };
  }

  return {
    isFresh: false,
    shouldWarn: true,
    shouldBlock: completionBoundary,
    message:
      `Progress file is stale: ${progressPath} was last modified at ${mtime.toISOString()}, ` +
      `before session start ${sessionStartedAt.toISOString()}.`
  };
```

Add `sessionBodyHash` to the destructuring at the top of the function:

```ts
  const { meaningfulWorkHappened, sessionStartedAt, completionBoundary = false, sessionBodyHash } = options;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hook/freshness.test.ts`

Expected: PASS, including all pre-existing tests in the file, which pass no `sessionBodyHash` and therefore take the mtime path unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/hook/freshness.ts tests/hook/freshness.test.ts
git commit -m "feat: check progress freshness by body hash, falling back to mtime"
```

---

## Task 3: Record the body hash at session start

**Files:**
- Modify: `src/hook/cc-adapter.ts` (`SessionState`, `handleSessionStart`, `handleStop`)
- Test: `tests/plugin/cc-adapter.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/plugin/cc-adapter.test.ts`. This relies on `commitAll` added by the checkpoint plan's Task 5:

```ts
describe("cc-adapter body-hash freshness", () => {
  it("blocks a stop when only frontmatter changed since session start", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      const file = await writeProgress(dir, progressDoc({ project: "BodyHash" }));
      await commitAll(dir, "init");
      await fs.writeFile(path.join(dir, "src.txt"), "work", "utf-8");

      const sessionId = `s-body-${Date.now()}`;
      await handleSessionStart({ cwd: dir, session_id: sessionId });

      // A frontmatter-only edit must NOT satisfy the gate.
      const current = await fs.readFile(file, "utf-8");
      await fs.writeFile(file, current.replace("status: active", "status: paused"), "utf-8");

      const result = await handleStop({ cwd: dir, session_id: sessionId });

      expect(result.code).toBe(2);
      expect(result.stderr).toContain("was not updated this session");
    });
  });

  it("allows a stop when a section body changed", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      const file = await writeProgress(dir, progressDoc({ project: "BodyHash2" }));
      await commitAll(dir, "init");
      await fs.writeFile(path.join(dir, "src.txt"), "work", "utf-8");

      const sessionId = `s-body2-${Date.now()}`;
      await handleSessionStart({ cwd: dir, session_id: sessionId });

      const current = await fs.readFile(file, "utf-8");
      await fs.writeFile(file, current.replace("Wire the widget.", "Ship the widget."), "utf-8");

      const result = await handleStop({ cwd: dir, session_id: sessionId });

      expect(result.code).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/plugin/cc-adapter.test.ts -t "blocks a stop when only frontmatter changed"`

Expected: FAIL — result code is 0, because the mtime moved and the gate saw the file as fresh.

- [ ] **Step 3: Write minimal implementation**

In `src/hook/cc-adapter.ts`, add the import:

```ts
import { bodyHash } from "../hash.js";
```

Extend the session state interface:

```ts
interface SessionState {
  startedAt?: string;
  cwd?: string;
  editReminderShown?: boolean;
  stopBlocked?: boolean;
  bodyHash?: string;
}
```

Add a recorder next to `recordSessionStart`:

```ts
async function bestEffortRecordBodyHash(sessionId: string | undefined, markdown: string): Promise<void> {
  if (!sessionId) return;
  try {
    const state = await readSessionState(sessionId);
    await writeSessionState(sessionId, { ...state, bodyHash: bodyHash(markdown) });
  } catch {
    // best effort only
  }
}
```

In `handleSessionStart`, immediately after `const markdown = await fs.readFile(progressPath, "utf-8");`, insert:

```ts
  await bestEffortRecordBodyHash(event.session_id, markdown);
```

In `handleStop`, pass the recorded hash into the freshness check. Replace the existing freshness block with:

```ts
  let stale = true;
  const sessionState = await readSessionState(event.session_id);
  const startedAt = sessionState.startedAt ? Date.parse(sessionState.startedAt) : NaN;
  if (Number.isFinite(startedAt)) {
    try {
      const freshness = await checkFreshness(progressPath, {
        meaningfulWorkHappened: true,
        sessionStartedAt: new Date(startedAt),
        completionBoundary: true,
        sessionBodyHash: sessionState.bodyHash
      });
      stale = !freshness.isFresh;
    } catch {
      // keep stale = true
    }
  }
```

The helper `readSessionStartMs` becomes unused; delete it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/plugin/cc-adapter.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hook/cc-adapter.ts tests/plugin/cc-adapter.test.ts
git commit -m "feat: gate stop on progress body hash instead of file mtime"
```

---

## Task 4: Exclude progress files from the meaningful-work predicate

**Files:**
- Modify: `src/hook/cc-adapter.ts` (`gitHasChanges`)
- Test: `tests/plugin/cc-adapter.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/plugin/cc-adapter.test.ts`:

```ts
describe("cc-adapter meaningful-work predicate", () => {
  it("stays silent when only progress files are dirty", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      const file = await writeProgress(dir, progressDoc({ project: "OnlyProgress" }));
      await commitAll(dir, "init");

      // Dirty ONLY the progress file, as SessionStart now does.
      await fs.writeFile(file, `${await fs.readFile(file, "utf-8")}\n<!-- touched -->\n`, "utf-8");

      const result = await handleStop({ cwd: dir, session_id: `s-onlyprog-${Date.now()}` });

      expect(result.code).toBe(0);
      expect(result.stdout).toBeUndefined();
    });
  });

  it("still fires when a non-progress file is dirty", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      await writeProgress(dir, progressDoc({ project: "RealWork" }));
      await commitAll(dir, "init");
      await fs.writeFile(path.join(dir, "src.txt"), "work", "utf-8");

      const sessionId = `s-realwork-${Date.now()}`;
      await handleSessionStart({ cwd: dir, session_id: sessionId });

      const result = await handleStop({ cwd: dir, session_id: sessionId });

      expect(result.code).toBe(2);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/plugin/cc-adapter.test.ts -t "stays silent when only progress files are dirty"`

Expected: FAIL — the hook warns, because a dirty `Progress.md` alone currently counts as meaningful work.

- [ ] **Step 3: Write minimal implementation**

In `src/hook/cc-adapter.ts`, replace `gitHasChanges` with:

```ts
// A porcelain line is "XY path", or "XY orig -> path" for a rename. The two
// status columns are fixed-width, so the path starts at index 2.
function porcelainPath(line: string): string {
  const rest = line.slice(2).trim();
  const arrow = rest.indexOf(" -> ");
  const target = arrow === -1 ? rest : rest.slice(arrow + 4);
  return target.replace(/^"|"$/g, "").replace(/\\/g, "/");
}

function isProgressPath(line: string): boolean {
  const target = porcelainPath(line);
  return target.startsWith("project-progress/") || target.includes("/project-progress/");
}

// SessionStart now always writes Progress.md, so a dirty progress folder is no
// longer evidence that the agent did any work. Only changes elsewhere count.
function gitHasChanges(cwd: string): boolean {
  const out = git(cwd, ["status", "--porcelain"]);
  if (out === null) return false;

  return out
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .some((line) => !isProgressPath(line));
}
```

Do not trim lines before slicing: trimming would consume the leading status column of an unstaged change (`" M file"`) and shift the path.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/plugin/cc-adapter.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hook/cc-adapter.ts tests/plugin/cc-adapter.test.ts
git commit -m "fix: exclude progress files from the meaningful-work predicate"
```

---

## Task 5: Validate and register the handoff keys

**Files:**
- Modify: `src/hook/schema.ts`
- Test: `tests/hook/schema.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/hook/schema.test.ts`, adding `ALLOWED_HANDOFF` to the import:

```ts
describe("handoff frontmatter", () => {
  it("registers both keys as optional", () => {
    expect(OPTIONAL_FRONTMATTER).toContain("handoff");
    expect(OPTIONAL_FRONTMATTER).toContain("session_id");
  });

  it("accepts both handoff values", () => {
    for (const value of ALLOWED_HANDOFF) {
      expect(validateFrontmatter(baseFrontmatter({ handoff: value }))).toEqual([]);
    }
  });

  it("rejects any other handoff value", () => {
    expect(validateFrontmatter(baseFrontmatter({ handoff: "partial" }))).toContain(
      "handoff must be one of: clean, interrupted"
    );
  });

  it("accepts frontmatter with no handoff at all", () => {
    expect(validateFrontmatter(baseFrontmatter())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hook/schema.test.ts`

Expected: FAIL with "does not provide an export named 'ALLOWED_HANDOFF'".

- [ ] **Step 3: Write minimal implementation**

In `src/hook/schema.ts`, add after `ALLOWED_GATE_VALUES`:

```ts
export const ALLOWED_HANDOFF = ["clean", "interrupted"] as const;
```

Extend `OPTIONAL_FRONTMATTER` to:

```ts
export const OPTIONAL_FRONTMATTER = [
  "base_commit",
  "base_branch",
  "worktree_dirty",
  "checkpoint_at",
  "session_id",
  "handoff",
  ...GATE_KEYS
] as const;
```

Add to `validateFrontmatter`, before `return errors;`:

```ts
  if ("handoff" in frontmatter && !ALLOWED_HANDOFF.includes(frontmatter.handoff as never)) {
    errors.push(allowedMessage("handoff", ALLOWED_HANDOFF));
  }
```

`session_id` is deliberately unvalidated beyond being optional: it is an opaque identifier issued by the host agent, and this project does not control its format.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hook/schema.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hook/schema.ts tests/hook/schema.test.ts
git commit -m "feat: validate optional handoff frontmatter"
```

---

## Task 6: Write and report handoff state

**Files:**
- Modify: `src/hook/cc-adapter.ts` (`handleSessionStart`, `bestEffortStampCheckpoint`)
- Test: `tests/plugin/cc-adapter.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/plugin/cc-adapter.test.ts`:

```ts
describe("cc-adapter session handoff", () => {
  it("marks a session interrupted at start", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      const file = await writeProgress(dir, progressDoc({ project: "Handoff" }));
      await commitAll(dir, "init");

      await handleSessionStart({ cwd: dir, session_id: "sess-one" });

      const frontmatter = parseFrontmatter(await fs.readFile(file, "utf-8"));
      expect(frontmatter.handoff).toBe("interrupted");
      expect(frontmatter.session_id).toBe("sess-one");
    });
  });

  it("reports a previous unclean handoff before overwriting it", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      await writeProgress(
        dir,
        progressDoc({ project: "Handoff2", handoff: "interrupted", session_id: "sess-dead" })
      );
      await commitAll(dir, "init");

      const result = await handleSessionStart({ cwd: dir, session_id: "sess-two" });

      const context = JSON.parse(result.stdout!).hookSpecificOutput.additionalContext;
      expect(context).toContain("Previous session sess-dead ended without a clean handoff");
    });
  });

  it("stays silent when the previous handoff was clean", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      await writeProgress(
        dir,
        progressDoc({ project: "Handoff3", handoff: "clean", session_id: "sess-old" })
      );
      await commitAll(dir, "init");

      const result = await handleSessionStart({ cwd: dir, session_id: "sess-three" });

      const context = JSON.parse(result.stdout!).hookSpecificOutput.additionalContext;
      expect(context).not.toContain("without a clean handoff");
    });
  });

  it("flips handoff to clean when the stop gate passes", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      const file = await writeProgress(dir, progressDoc({ project: "Handoff4" }));
      await commitAll(dir, "init");
      await fs.writeFile(path.join(dir, "src.txt"), "work", "utf-8");

      const sessionId = "sess-four";
      await handleSessionStart({ cwd: dir, session_id: sessionId });

      const current = await fs.readFile(file, "utf-8");
      await fs.writeFile(file, current.replace("Wire the widget.", "Ship the widget."), "utf-8");

      await handleStop({ cwd: dir, session_id: sessionId });

      expect(parseFrontmatter(await fs.readFile(file, "utf-8")).handoff).toBe("clean");
    });
  });

  it("leaves handoff interrupted when the stop gate finds the file stale", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      const file = await writeProgress(dir, progressDoc({ project: "Handoff5" }));
      await commitAll(dir, "init");
      await fs.writeFile(path.join(dir, "src.txt"), "work", "utf-8");

      const sessionId = "sess-five";
      await handleSessionStart({ cwd: dir, session_id: sessionId });

      await handleStop({ cwd: dir, session_id: sessionId });

      expect(parseFrontmatter(await fs.readFile(file, "utf-8")).handoff).toBe("interrupted");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/plugin/cc-adapter.test.ts -t "marks a session interrupted at start"`

Expected: FAIL — `frontmatter.handoff` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

Add this helper to `src/hook/cc-adapter.ts`, next to the other `bestEffort*` functions:

```ts
async function bestEffortMarkHandoff(
  progressPath: string,
  handoff: "clean" | "interrupted",
  sessionId?: string
): Promise<void> {
  try {
    const markdown = await fs.readFile(progressPath, "utf-8");
    let updated = replaceFrontmatterValue(markdown, "handoff", handoff);
    if (sessionId) updated = replaceFrontmatterValue(updated, "session_id", sessionId);
    await fs.writeFile(progressPath, updated, "utf-8");
  } catch {
    // best effort only
  }
}
```

In `handleSessionStart`, after `await bestEffortRecordBodyHash(event.session_id, markdown);` and before the `lines` array is returned, add the report and then the write:

```ts
  if (frontmatter.handoff === "interrupted") {
    const previous = frontmatter.session_id ? String(frontmatter.session_id) : "(unknown)";
    lines.push(
      `\nPrevious session ${previous} ended without a clean handoff. ` +
        "Progress.md may predate uncommitted work in the tree."
    );
  }

  await bestEffortMarkHandoff(progressPath, "interrupted", event.session_id);
```

Place the `lines.push` wherever it reads best relative to the existing Resume Snapshot, Next Action, and Blockers pushes; the tests only assert the text is present.

Order matters in one respect: the body hash must already be recorded before this write. It is, because `bestEffortRecordBodyHash` runs first — and in any case the write only touches frontmatter, which `bodyHash` ignores.

Then extend the Stop-side writer created by the checkpoint plan. Rename `bestEffortStampCheckpoint` to `bestEffortRecordSessionEnd` and fold the handoff flip into its single read-modify-write:

```ts
async function bestEffortRecordSessionEnd(cwd: string, progressPath: string): Promise<void> {
  try {
    const markdown = await fs.readFile(progressPath, "utf-8");
    let updated = replaceFrontmatterValue(markdown, "handoff", "clean");

    const fields = readCheckpoint(cwd, new Date());
    if (fields) {
      updated = replaceFrontmatterValue(updated, "base_commit", fields.base_commit);
      updated = replaceFrontmatterValue(updated, "base_branch", fields.base_branch);
      updated = replaceFrontmatterValue(updated, "worktree_dirty", String(fields.worktree_dirty));
      updated = replaceFrontmatterValue(updated, "checkpoint_at", fields.checkpoint_at);
    }

    await fs.writeFile(progressPath, updated, "utf-8");
  } catch {
    // Best effort only: a recording failure must never fail a session.
  }
}
```

Update the call site in `handleStop`:

```ts
  if (!stale) {
    // A session either records both a clean handoff and a checkpoint, or
    // neither. A stale stop did meaningful work and never wrote it down, so it
    // is treated as an interruption.
    await bestEffortRecordSessionEnd(cwd, progressPath);
  }
```

Note the handoff flip happens even outside a git repository, where `readCheckpoint` returns null and only the checkpoint fields are skipped.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/plugin/cc-adapter.test.ts`

Expected: PASS, all five new tests plus every pre-existing one.

Run: `npm test`

Expected: PASS, full suite.

- [ ] **Step 5: Commit**

```bash
git add src/hook/cc-adapter.ts tests/plugin/cc-adapter.test.ts
git commit -m "feat: record and report session handoff state"
```

---

## Task 7: ADR and documentation

**Files:**
- Create: `docs/adr/0019-session-handoff.md`
- Modify: `skills/project-progress/SKILL.md`

- [ ] **Step 1: Write the ADR**

Create `docs/adr/0019-session-handoff.md`:

```markdown
# ADR 0019: Session handoff state and body-hash freshness

## Status

Accepted.

## Context

Nothing recorded whether a session ended deliberately or died mid-task. The two
demand opposite resume postures: after a clean handoff the recorded Next Action
is trustworthy, while after an interruption the working tree may hold
half-finished edits the prose never describes.

## Decision

Add optional `session_id` and `handoff` frontmatter keys. Interruption cannot
be observed directly, because a dying context fires no hook, so the state is
written pessimistically: SessionStart writes `interrupted`, and Stop flips it
to `clean` when its gate passes. A session that dies leaves `interrupted` for
the next SessionStart to report.

A stale stop is deliberately left `interrupted`. The ADR 0017 gate blocks only
once per session, so a second stop with Progress.md still unchanged is allowed
through; that session did meaningful work and never recorded it, which is
exactly what the next resume needs warning about.

Because SessionStart now writes the file, two mechanisms had to change:

- freshness moved from file mtime to a hash of the Markdown body, so hook
  frontmatter writes cannot satisfy the ADR 0017 gate. Without this the gate
  would have silently stopped firing. When no hash was recorded, the mtime
  comparison remains as a fail-closed fallback.
- the meaningful-work predicate stops counting changes under
  `project-progress/`, or every read-only session would be nagged.

## Consequences

Every session now dirties Progress.md immediately, so `git status` shows it
modified even when nothing else changed. This is accepted: the alternative,
deferring the write until the first meaningful edit, cannot distinguish a
session that died before its first edit from one that never began.

Body hashing also fixes a pre-existing false-fresh case, where any touch that
reset mtime without changing content satisfied the gate.
```

- [ ] **Step 2: Update the skill**

Add to `skills/project-progress/SKILL.md`:

```markdown
If resume context reports that the previous session ended without a clean
handoff, inspect the working tree before trusting Next Action: that session did
work it never wrote down.
```

- [ ] **Step 3: Verify and commit**

Run: `npm test && npm run typecheck && npm run build`

Expected: all three pass.

```bash
git add docs/adr/0019-session-handoff.md skills/project-progress/SKILL.md
git commit -m "docs: record session handoff and body-hash freshness decision"
```

---

## Self-Review Notes

Spec coverage, section by section:

- `session_id` and `handoff` optional keys — Tasks 5 and 6
- pessimistic write at start, flip at Stop — Task 6
- report prior unclean handoff before overwriting — Task 6
- stale stop left `interrupted`, consistent with no checkpoint stamp — Task 6
- freshness redefined to body hash — Tasks 1 and 2
- mtime fallback when no hash recorded — Task 2
- meaningful-work predicate excludes `project-progress/` — Task 4
- regression proof that the ADR 0017 gate still blocks after a frontmatter
  write — Task 3, "blocks a stop when only frontmatter changed"

Names used consistently: `sha256`, `bodyOf`, `bodyHash`, `sessionBodyHash`,
`bestEffortRecordBodyHash`, `bestEffortMarkHandoff`,
`bestEffortRecordSessionEnd`, `ALLOWED_HANDOFF`, `porcelainPath`,
`isProgressPath`. Task 6 renames the checkpoint plan's
`bestEffortStampCheckpoint` to `bestEffortRecordSessionEnd`; no other task
refers to the old name after that point.
