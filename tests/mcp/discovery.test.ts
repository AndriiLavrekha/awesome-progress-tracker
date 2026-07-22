import { describe, expect, it } from "vitest";
import { DEFAULT_DISCOVERY_EXCLUDES, discoverProjects, discoverProjectsWithDiagnostics } from "../../src/mcp/discovery.js";

describe("discoverProjects", () => {
  it("finds project progress files under configured roots", async () => {
    const projects = await discoverProjects({
      projectRoots: ["tests/fixtures"],
      exclude: [".git", "node_modules"]
    });

    const valid = projects.find((project) => project.project === "Valid Fixture");

    expect(valid).toBeDefined();
    expect(valid?.progressPath).toContain("tests");
    expect(valid?.progressPath).toContain("Progress.md");
  });

  it("reports skipped roots and uses practical default exclusions", async () => {
    const result = await discoverProjectsWithDiagnostics({
      projectRoots: ["tests/fixtures", "tests/missing-root"],
      exclude: DEFAULT_DISCOVERY_EXCLUDES
    });

    expect(DEFAULT_DISCOVERY_EXCLUDES).toEqual(expect.arrayContaining([".cache", ".venv", "dist"]));
    expect(result.projects.some((project) => project.project === "Valid Fixture")).toBe(true);
    expect(result.diagnostics.skippedRoots).toContain("tests/missing-root");
  });
});
