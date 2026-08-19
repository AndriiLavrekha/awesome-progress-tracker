import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { sha256 } from "../../src/hash.js";
import {
  FOLD_THRESHOLD,
  ProgressConflictError,
  MAX_LAST_MILESTONE_LENGTH,
  MAX_SECTION_CONTENT_LENGTH,
  appendToArchive,
  foldDoneSection,
  replaceFrontmatterValue,
  replaceSection,
  replaceSectionWithOperation,
  writeFileAtomic,
  validateLastMilestone,
  validateSectionContent,
  validateSectionName
} from "../../src/mcp/writer.js";

describe("MCP writer helpers", () => {
  it("replaces an existing section without touching later sections", () => {
    const markdown = "# T\n\n## Next Action\n\nOld.\n\n## Blockers\n\nNone.\n";

    const updated = replaceSection(markdown, "Next Action", "New.");

    expect(updated).toContain("## Next Action\n\nNew.\n\n## Blockers");
    expect(updated).toContain("## Blockers\n\nNone.");
  });

  it("appends a missing section", () => {
    const markdown = "# T\n";

    const updated = replaceSection(markdown, "Next Action", "New.");

    expect(updated).toBe("# T\n\n## Next Action\n\nNew.\n");
  });

  it("reports whether a section write created or replaced content", () => {
    expect(replaceSectionWithOperation("# T\n", "Next Action", "New.").operation).toBe("created");
    expect(replaceSectionWithOperation("## Next Action\n\nOld.\n", "Next Action", "New.").operation).toBe("replaced");
  });

  it("rejects a write when the file changed since it was read", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-writer-"));
    const filePath = path.join(dir, "Progress.md");
    await fs.writeFile(filePath, "original", "utf-8");
    const expected = sha256(await fs.readFile(filePath, "utf-8"));

    await fs.writeFile(filePath, "someone else wrote this", "utf-8");

    await expect(writeFileAtomic(filePath, "new", expected)).rejects.toThrow(ProgressConflictError);
    expect(await fs.readFile(filePath, "utf-8")).toBe("someone else wrote this");
  });

  it("replaces an existing frontmatter value", () => {
    const markdown = "---\nstatus: active\n---\n\n# T\n";

    expect(replaceFrontmatterValue(markdown, "status", "blocked")).toContain("status: blocked");
  });

  it("inserts a missing frontmatter value", () => {
    const markdown = "---\nproject: T\n---\n\n# T\n";

    expect(replaceFrontmatterValue(markdown, "status", "active")).toContain("---\nstatus: active\nproject: T");
  });

  it("allows only known Progress.md sections without newline injection", () => {
    expect(validateSectionName("Next Action")).toBeUndefined();
    expect(validateSectionName("Not A Real Section")).toMatch(/allowed/);
    expect(validateSectionName("Next Action\n## Blockers")).toMatch(/newline/);
  });

  it("rejects unsafe last_milestone values", () => {
    expect(validateLastMilestone("shipped MCP quality fixes")).toBeUndefined();
    expect(validateLastMilestone("shipped\nstatus: done")).toMatch(/newline/);
    expect(validateLastMilestone("---")).toMatch(/frontmatter/);
    expect(validateLastMilestone("## injected heading")).toMatch(/heading/);
    expect(validateLastMilestone("x".repeat(MAX_LAST_MILESTONE_LENGTH + 1))).toMatch(/cannot exceed/);
  });

  it("rejects section content that would inject document structure", () => {
    expect(validateSectionContent("Plain update.\n- [ ] Task")).toBeUndefined();
    expect(validateSectionContent("New action\n\n## Blockers\nInjected")).toMatch(/headings/);
    expect(validateSectionContent("New action\n---\nstatus: done")).toMatch(/frontmatter/);
    expect(validateSectionContent("x".repeat(MAX_SECTION_CONTENT_LENGTH + 1))).toMatch(/cannot exceed/);
  });

  it("throws before replacing unsafe section content", () => {
    const markdown = "# T\n\n## Next Action\n\nOld.\n";

    expect(() => replaceSection(markdown, "Next Action", "New\n\n## Blockers\nInjected")).toThrow(/headings/);
  });

  it("leaves a Done section under the fold threshold untouched", () => {
    const content = "- [x] Small item.";

    const result = foldDoneSection(content);

    expect(result).toEqual({ kept: content, archived: [] });
  });

  it("folds the oldest lines out of an oversized Done section, keeping the newest", () => {
    const lines = Array.from({ length: 200 }, (_, index) => `- [x] Item ${index}.`);
    const content = lines.join("\n");
    expect(content.length).toBeGreaterThan(FOLD_THRESHOLD);

    const result = foldDoneSection(content);

    expect(result.kept.length).toBeLessThanOrEqual(FOLD_THRESHOLD);
    expect(result.archived.length).toBeGreaterThan(0);
    expect(result.kept.split("\n").at(-1)).toBe(lines.at(-1));
    expect(result.archived[0]).toBe(lines[0]);
    expect([...result.archived, ...result.kept.split("\n")]).toEqual(lines);
  });

  it("appends archived Done items under the archive heading with today's date", () => {
    const archiveMarkdown = "---\nproject: T\n---\n\n# Archive\n\n## Archived Done Items\n";

    const updated = appendToArchive(archiveMarkdown, ["- [x] Old item one.", "- [x] Old item two."]);

    expect(updated).toContain("## Archived Done Items");
    expect(updated).toContain("- [x] Old item one.");
    expect(updated).toContain("- [x] Old item two.");
  });

  it("appends to existing archived content instead of replacing it", () => {
    const archiveMarkdown = "# Archive\n\n## Archived Done Items\n\n### 2026-01-01\n\n- [x] Earlier item.\n";

    const updated = appendToArchive(archiveMarkdown, ["- [x] Newer item."]);

    expect(updated).toContain("- [x] Earlier item.");
    expect(updated).toContain("- [x] Newer item.");
  });

  it("does nothing when there are no items to archive", () => {
    const archiveMarkdown = "# Archive\n\n## Archived Done Items\n";

    expect(appendToArchive(archiveMarkdown, [])).toBe(archiveMarkdown);
  });
});

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

describe("interleaved writes", () => {
  it("lets exactly one of two concurrent writers win", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-writer-race-"));
    const filePath = path.join(dir, "Progress.md");
    const original = "## Next Action\n\nOriginal.\n";
    await fs.writeFile(filePath, original, "utf-8");

    // Both writers read the same content, so both hold the same expected hash.
    const hashA = sha256(await fs.readFile(filePath, "utf-8"));
    const hashB = sha256(await fs.readFile(filePath, "utf-8"));

    const writerA = "## Next Action\n\nWriter A.\n";
    const writerB = "## Next Action\n\nWriter B.\n";

    const results = await Promise.allSettled([
      writeFileAtomic(filePath, writerA, hashA),
      writeFileAtomic(filePath, writerB, hashB)
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ProgressConflictError);

    const final = await fs.readFile(filePath, "utf-8");
    expect(final === writerA || final === writerB).toBe(true);
  });
});
