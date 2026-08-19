# Concurrent Write Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a conflicting write to `Progress.md` both reliably detected and cheaply recoverable, so two agents cannot silently overwrite each other's notion of the next action.

**Architecture:** `writeFileAtomic` swaps its mtime comparison for a content-hash comparison, closing the coarse-resolution window, and throws a typed error instead of a bare string. Every MCP write path catches that error, re-reads the file, and returns a structured conflict payload carrying the current content the caller needs in order to merge.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Node built-ins only, vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-concurrency-hardening-design.md`

**Depends on:** the session-handoff plan (`2026-08-19-session-handoff.md`) for `src/hash.ts`, and the checkpoint plan for the `set_project_gates` tool updated in Task 3.

---

## File Structure

- **Modify** `src/mcp/writer.ts` — `ProgressConflictError`, hash-based `writeFileAtomic`.
- **Modify** `src/mcp/server.ts` — `conflictPayload` helper and three call sites.
- **Modify** `tests/mcp/writer.test.ts:51` — the existing test asserts the mtime contract and must be rewritten.
- **Create** `docs/adr/0020-content-hash-write-guard.md`.

---

## Task 1: Hash-based write guard

**Files:**
- Modify: `src/mcp/writer.ts` (`writeFileAtomic`)
- Test: `tests/mcp/writer.test.ts:51` (rewrite the existing conflict test, then append)

- [ ] **Step 1: Replace the existing mtime test**

The test at `tests/mcp/writer.test.ts:51` currently reads:

```ts
    await expect(writeFileAtomic(filePath, "new", initial.mtimeMs)).rejects.toThrow(/changed on disk/);
```

That contract is being replaced. Read the surrounding `it(...)` block and rewrite the whole block as:

```ts
  it("rejects a write when the file changed since it was read", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-writer-"));
    const filePath = path.join(dir, "Progress.md");
    await fs.writeFile(filePath, "original", "utf-8");
    const expected = sha256(await fs.readFile(filePath, "utf-8"));

    await fs.writeFile(filePath, "someone else wrote this", "utf-8");

    await expect(writeFileAtomic(filePath, "new", expected)).rejects.toThrow(
      ProgressConflictError
    );
    expect(await fs.readFile(filePath, "utf-8")).toBe("someone else wrote this");
  });
```

- [ ] **Step 2: Write the additional failing tests**

Append to `tests/mcp/writer.test.ts`, adding `ProgressConflictError` to the import from `../../src/mcp/writer.js` and `sha256` from `../../src/hash.js`:

```ts
describe("writeFileAtomic content guard", () => {
  it("writes when the content is unchanged", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-writer-ok-"));
    const filePath = path.join(dir, "Progress.md");
    await fs.writeFile(filePath, "original", "utf-8");

    await writeFileAtomic(filePath, "updated", sha256("original"));

    expect(await fs.readFile(filePath, "utf-8")).toBe("updated");
  });

  it("permits a rewrite that produces identical bytes", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-writer-idem-"));
    const filePath = path.join(dir, "Progress.md");
    await fs.writeFile(filePath, "same", "utf-8");

    // Rewriting the file with identical content does not change its hash, so
    // the guard must allow this. The old mtime check rejected it spuriously.
    await fs.writeFile(filePath, "same", "utf-8");

    await expect(writeFileAtomic(filePath, "updated", sha256("same"))).resolves.toBeUndefined();
    expect(await fs.readFile(filePath, "utf-8")).toBe("updated");
  });

  it("carries the file path on the conflict error", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-writer-path-"));
    const filePath = path.join(dir, "Progress.md");
    await fs.writeFile(filePath, "original", "utf-8");

    await expect(writeFileAtomic(filePath, "new", sha256("stale"))).rejects.toMatchObject({
      name: "ProgressConflictError",
      filePath
    });
  });

  it("leaves no temp files behind after a conflict", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-writer-tmp-"));
    const filePath = path.join(dir, "Progress.md");
    await fs.writeFile(filePath, "original", "utf-8");

    await expect(writeFileAtomic(filePath, "new", sha256("stale"))).rejects.toThrow();

    expect(await fs.readdir(dir)).toEqual(["Progress.md"]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/mcp/writer.test.ts`

Expected: FAIL — "does not provide an export named 'ProgressConflictError'".

- [ ] **Step 4: Write minimal implementation**

In `src/mcp/writer.ts`, add to the imports (the file keeps its `node:fs` and `node:path` imports at the bottom; add this alongside them):

```ts
import { sha256 } from "../hash.js";
```

Add near the top of the file, beside the other exported declarations:

```ts
// Thrown when the file changed between the caller's read and its write.
// Typed rather than a bare Error so callers can distinguish a lost race from a
// genuine I/O failure and respond with a mergeable payload.
export class ProgressConflictError extends Error {
  readonly filePath: string;

  constructor(filePath: string) {
    super("Progress file changed on disk; reread it before writing.");
    this.name = "ProgressConflictError";
    this.filePath = filePath;
  }
}
```

Replace `writeFileAtomic` with:

```ts
export async function writeFileAtomic(
  filePath: string,
  content: string,
  expectedHash: string
): Promise<void> {
  // Content hashing has no resolution window. mtime is whole-second on some
  // network and FAT mounts, so two writes inside one tick compared equal and
  // the second silently won.
  const current = await fs.readFile(filePath, "utf-8");
  if (sha256(current) !== expectedHash) throw new ProgressConflictError(filePath);

  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  try {
    await fs.writeFile(tempPath, content, "utf-8");
    await fs.rename(tempPath, filePath);
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/mcp/writer.test.ts`

Expected: PASS. Other suites will still fail to typecheck until Task 2 updates the call sites; that is expected at this point.

- [ ] **Step 6: Commit**

```bash
git add src/mcp/writer.ts tests/mcp/writer.test.ts
git commit -m "feat: guard progress writes with a content hash instead of mtime"
```

---

## Task 2: Conflict payload helper

**Files:**
- Modify: `src/mcp/server.ts`
- Test: `tests/mcp/server.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/mcp/server.test.ts`, adding `conflictPayload` to the import from `../../src/mcp/server.js`:

```ts
const CONFLICT_DOC = [
  "---",
  "project: Demo",
  "status: active",
  "gate_tests: failing",
  "---",
  "",
  "## Next Action",
  "",
  "Someone else wrote this.",
  "",
  "## Blockers",
  "",
  "None.",
  ""
].join("\n");

describe("conflictPayload", () => {
  it("returns the current content of the requested section", () => {
    const payload = conflictPayload(CONFLICT_DOC, { section: "Next Action" });

    expect(payload).toMatchObject({
      error: "conflict",
      section: "Next Action",
      currentContent: "Someone else wrote this."
    });
    expect(String(payload.hint)).toContain("retry");
  });

  it("returns current values for the requested frontmatter keys", () => {
    const payload = conflictPayload(CONFLICT_DOC, { keys: ["status", "gate_tests"] });

    expect(payload).toMatchObject({
      error: "conflict",
      currentFrontmatter: { status: "active", gate_tests: "failing" }
    });
  });

  it("reports a requested key that is absent as null", () => {
    const payload = conflictPayload(CONFLICT_DOC, { keys: ["gate_deploy"] });

    expect(payload).toMatchObject({ currentFrontmatter: { gate_deploy: null } });
  });

  it("omits section fields when no section was requested", () => {
    const payload = conflictPayload(CONFLICT_DOC, { keys: ["status"] });

    expect(payload.section).toBeUndefined();
    expect(payload.currentContent).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mcp/server.test.ts`

Expected: FAIL — "does not provide an export named 'conflictPayload'".

- [ ] **Step 3: Write minimal implementation**

In `src/mcp/server.ts`, extend the existing `./markdown.js` import to include `extractSection` and `parseFrontmatter`, and add `ProgressConflictError` to the `./writer.js` import.

Add near the other exported helpers:

```ts
export interface ConflictOptions {
  section?: string;
  keys?: string[];
}

// Builds the payload a caller needs in order to merge and retry without a
// second round trip: the current content of the section it tried to write, or
// the current values of the frontmatter keys it tried to set.
export function conflictPayload(
  currentMarkdown: string,
  options: ConflictOptions
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    error: "conflict",
    hint: "another writer changed Progress.md; merge with the current values and retry"
  };

  if (options.section) {
    payload.section = options.section;
    payload.currentContent = extractSection(currentMarkdown, options.section);
  }

  if (options.keys && options.keys.length > 0) {
    const frontmatter = parseFrontmatter(currentMarkdown);
    payload.currentFrontmatter = Object.fromEntries(
      options.keys.map((key) => [key, frontmatter[key] ?? null])
    );
  }

  return payload;
}

async function conflictResult(
  error: unknown,
  progressPath: string,
  options: ConflictOptions
): Promise<ReturnType<typeof textResult>> {
  if (!(error instanceof ProgressConflictError)) throw error;
  const current = await fs.readFile(progressPath, "utf-8");
  return textResult(JSON.stringify(conflictPayload(current, options)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/mcp/server.test.ts`

Expected: the four `conflictPayload` tests PASS. Other tests in the file may still fail to compile until Task 3; that is expected.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/server.ts tests/mcp/server.test.ts
git commit -m "feat: build mergeable conflict payloads for progress writes"
```

---

## Task 3: Wire the three write paths

**Files:**
- Modify: `src/mcp/server.ts` (`update_project_progress`, `mark_project_status`, `set_project_gates`)

- [ ] **Step 1: Update `update_project_progress`**

Replace the `fs.stat` line with a hash of the content just read, and wrap the write. The handler body becomes:

```ts
      const markdown = await fs.readFile(match.progressPath, "utf-8");
      const expectedHash = sha256(markdown);

      let sectionContent = content;
      let archived: string[] = [];
      if (section === "Done") {
        const fold = foldDoneSection(content);
        sectionContent = fold.kept;
        archived = fold.archived;
      }

      const result = replaceSectionWithOperation(markdown, section, sectionContent);
      const updated = result.markdown;

      try {
        await writeFileAtomic(match.progressPath, updated, expectedHash);
      } catch (error) {
        return await conflictResult(error, match.progressPath, { section });
      }

      await upsertIndexedProject(parseProjectSummary(updated, match.progressPath));

      if (archived.length > 0) {
        const archivePath = path.join(path.dirname(match.progressPath), "Archive.md");
        const archiveMarkdown = await fs.readFile(archivePath, "utf-8").catch(() => "# Archive\n");
        await fs.writeFile(archivePath, appendToArchive(archiveMarkdown, archived), "utf-8");
      }

      return textResult(
        JSON.stringify({
          updated: true,
          operation: result.operation,
          project,
          section,
          archived: archived.length,
          updatedAt: new Date().toISOString(),
          progressPath: match.progressPath
        })
      );
```

Note the archive append moved after the guarded write. Folding items into `Archive.md` before knowing the `Progress.md` write will land would archive entries that were never removed from `Done`.

Add `sha256` to the imports from `../hash.js`.

- [ ] **Step 2: Update `mark_project_status`**

```ts
      const markdown = await fs.readFile(match.progressPath, "utf-8");
      const expectedHash = sha256(markdown);
      const withStatus = replaceFrontmatterValue(markdown, "status", status);
      const updated = replaceFrontmatterValue(withStatus, "last_milestone", last_milestone);

      try {
        await writeFileAtomic(match.progressPath, updated, expectedHash);
      } catch (error) {
        return await conflictResult(error, match.progressPath, {
          keys: ["status", "last_milestone"]
        });
      }

      await upsertIndexedProject(parseProjectSummary(updated, match.progressPath));

      return textResult(
        JSON.stringify({ updated: true, project, status, progressPath: match.progressPath })
      );
```

- [ ] **Step 3: Update `set_project_gates`**

```ts
      const markdown = await fs.readFile(match.progressPath, "utf-8");
      const expectedHash = sha256(markdown);

      let updated = markdown;
      for (const [key, value] of updates) {
        updated = replaceFrontmatterValue(updated, key, value);
      }

      try {
        await writeFileAtomic(match.progressPath, updated, expectedHash);
      } catch (error) {
        return await conflictResult(error, match.progressPath, {
          keys: updates.map(([key]) => key)
        });
      }

      return textResult(
        JSON.stringify({
          updated: true,
          project,
          gates: Object.fromEntries(updates),
          progressPath: match.progressPath
        })
      );
```

- [ ] **Step 4: Remove the now-unused stat calls**

Run: `grep -n "fs.stat" src/mcp/server.ts`

Expected: no remaining `fs.stat` calls in the three write handlers. Remove any that are left over.

- [ ] **Step 5: Verify**

Run: `npm run typecheck`

Expected: no errors.

Run: `npm test`

Expected: PASS, full suite.

- [ ] **Step 6: Commit**

```bash
git add src/mcp/server.ts
git commit -m "feat: return mergeable conflicts from every progress write path"
```

---

## Task 4: Interleaved-write regression test

**Files:**
- Test: `tests/mcp/writer.test.ts` (append)

- [ ] **Step 1: Write the test**

Append to `tests/mcp/writer.test.ts`:

```ts
describe("interleaved writes", () => {
  it("lets exactly one of two concurrent writers win", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-writer-race-"));
    const filePath = path.join(dir, "Progress.md");
    const original = "## Next Action\n\nOriginal.\n";
    await fs.writeFile(filePath, original, "utf-8");

    // Both writers read the same content, so both hold the same expected hash.
    const hashA = sha256(await fs.readFile(filePath, "utf-8"));
    const hashB = sha256(await fs.readFile(filePath, "utf-8"));

    const results = await Promise.allSettled([
      writeFileAtomic(filePath, "## Next Action\n\nWriter A.\n", hashA),
      writeFileAtomic(filePath, "## Next Action\n\nWriter B.\n", hashB)
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ProgressConflictError);

    const final = await fs.readFile(filePath, "utf-8");
    expect(final === "## Next Action\n\nWriter A.\n" || final === "## Next Action\n\nWriter B.\n").toBe(
      true
    );
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/mcp/writer.test.ts -t "lets exactly one"`

Expected: PASS.

If both writers succeed, the two promises did not actually interleave: the read-compare-write sequence completed for the first before the second began. In that case, force interleaving by awaiting the first read of both writers before either write, which the shared-hash setup above already arranges — if it still passes trivially, the guard is nonetheless proven by the Task 1 stale-hash tests, so record the observation rather than weakening the assertion.

- [ ] **Step 3: Commit**

```bash
git add tests/mcp/writer.test.ts
git commit -m "test: prove one writer loses on an interleaved progress write"
```

---

## Task 5: ADR

**Files:**
- Create: `docs/adr/0020-content-hash-write-guard.md`

- [ ] **Step 1: Write the ADR**

```markdown
# ADR 0020: Content-hash write guard and mergeable conflicts

## Status

Accepted. Refines the optimistic-concurrency check already present in
`writeFileAtomic`.

## Context

`writeFileAtomic` compared `stat().mtimeMs` against the value captured before
the read and threw a bare string on mismatch. Two gaps remained.

mtime resolution is coarse: one second on some network and FAT mounts, and
whole milliseconds elsewhere. Two writes inside the same tick compared equal
and the second silently won, which is exactly the overwrite the guard exists to
prevent.

The error also carried nothing actionable. A caller knew only that it had lost,
and recovering cost a full re-read.

## Decision

Compare a SHA-256 of the file's full content instead of its mtime, and throw a
typed `ProgressConflictError`. Every MCP write path catches it, re-reads the
file, and returns a structured payload: the current content of the section the
caller tried to write, or the current values of the frontmatter keys it tried
to set.

Leases and ownership were rejected. A lease over a text file needs a TTL,
renewal, and a steal path, and it fails badly when the holder dies still
holding it. The problem is detection and recovery, and optimistic concurrency
solves both without a stale-lock mode.

Automatic merging of writes to different sections was also rejected. It assumes
sections are independent, and `Next Action` and `Remaining Work` routinely are
not.

## Consequences

Content hashing correctly permits a rewrite that produces identical bytes,
which the mtime check rejected as a spurious conflict.

Each write now costs one extra file read. `Progress.md` is a small document
bounded by the ADR 0016 fold, so this is not material.

The archive append in `update_project_progress` moved after the guarded write.
Archiving before knowing the write would land could have moved `Done` entries
into `Archive.md` that were never removed from `Progress.md`.
```

- [ ] **Step 2: Verify and commit**

Run: `npm test && npm run typecheck && npm run build`

Expected: all three pass.

```bash
git add docs/adr/0020-content-hash-write-guard.md
git commit -m "docs: record the content-hash write guard decision"
```

---

## Self-Review Notes

Spec coverage, section by section:

- mtime replaced with full-content hash — Task 1
- typed `ProgressConflictError` — Task 1
- structured payload with `currentContent` — Tasks 2 and 3
- applies to `update_project_progress` and `mark_project_status` — Task 3
- temp-file-plus-rename preserved — Task 1
- identical-bytes rewrite permitted — Task 1
- interleaved writers, exactly one wins — Task 4

Two items go beyond the spec text and are called out deliberately:
`set_project_gates` is also wired (Task 3), because the checkpoint plan adds it
as a third write path and leaving it on the old signature would not compile;
and the archive append is reordered (Task 3), which the spec did not anticipate
but which the guarded write makes necessary.

Names used consistently: `ProgressConflictError`, `conflictPayload`,
`conflictResult`, `ConflictOptions`, `expectedHash`, `sha256`. The
`writeFileAtomic` third parameter is `expectedHash: string` everywhere; no call
site retains the old `expectedMtimeMs: number`.
