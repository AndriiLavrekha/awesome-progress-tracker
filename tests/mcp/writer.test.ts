import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MAX_LAST_MILESTONE_LENGTH,
  MAX_SECTION_CONTENT_LENGTH,
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
});
