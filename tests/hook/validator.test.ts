import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkProgressHealth, summarizeProblems, validateProgressFile } from "../../src/hook/validator.js";

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

  it("names every garbled file in one finding", async () => {
    const valid = (await fs.readFile("tests/fixtures/valid-project/project-progress/Progress.md", "utf-8")).replace(/\r\n/g, "\n");
    const garbled = "# Notes\n\n\u00e2\u20ac\u201d\n";
    const dir = await folder({ "Progress.md": valid, "Decisions.md": garbled, "Open Questions.md": garbled });
    expect(await checkProgressHealth(dir)).toEqual([
      { message: "garbled characters in Decisions.md, Open Questions.md", remedy: "compact" }
    ]);
  });
});
