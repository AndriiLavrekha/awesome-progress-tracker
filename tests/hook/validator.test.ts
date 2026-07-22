import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateProgressFile } from "../../src/hook/validator.js";

describe("validateProgressFile", () => {
  it("returns no errors for the valid fixture", async () => {
    const errors = await validateProgressFile(
      "tests/fixtures/valid-project/project-progress/Progress.md"
    );
    expect(errors).toEqual([]);
  });

  it("flags missing frontmatter, missing sections, and secret-like values", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-validator-"));
    const file = path.join(dir, "Progress.md");
    await fs.writeFile(file, "---\nproject: X\n---\n\n## Next Action\n\npassword: hunter2\n", "utf-8");

    const errors = await validateProgressFile(file);

    expect(errors.some((error) => error.startsWith("Missing required frontmatter"))).toBe(true);
    expect(errors.some((error) => error.startsWith("Missing required section"))).toBe(true);
    expect(errors.some((error) => error.includes("secret-like"))).toBe(true);
  });

  it("reports when the progress file is missing", async () => {
    const errors = await validateProgressFile("tests/fixtures/does-not-exist/Progress.md");
    expect(errors[0]).toContain("Progress file not found");
  });
});
