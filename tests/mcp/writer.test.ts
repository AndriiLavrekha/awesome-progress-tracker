import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FOLD_THRESHOLD,
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

  it("refuses an atomic write when the file changed after it was read", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-writer-"));
    const filePath = path.join(dir, "Progress.md");
    await fs.writeFile(filePath, "old", "utf-8");
    const initial = await fs.stat(filePath);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await fs.writeFile(filePath, "other", "utf-8");

    await expect(writeFileAtomic(filePath, "new", initial.mtimeMs)).rejects.toThrow(/changed on disk/);
    await expect(fs.readFile(filePath, "utf-8")).resolves.toBe("other");
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
