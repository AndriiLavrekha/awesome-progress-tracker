import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  boundProjectSummaries,
  conflictPayload,
  compactProjectListItem,
  errorResult,
  lastMilestoneSchema,
  projectSelectorSchema,
  projectsJson,
  progressSectionSchema,
  gateFrontmatterUpdates,
  refreshProjectsJson,
  resolveProject,
  rootsFromEnv,
  sectionContentSchema,
  successResult,
  toolDefinitions
} from "../../src/mcp/server.js";
import { writeProjectIndex } from "../../src/mcp/index.js";
import type { ProjectSummary } from "../../src/mcp/schema.js";
import { replaceFrontmatterValue } from "../../src/mcp/writer.js";
import { parseFrontmatter } from "../../src/mcp/markdown.js";

function indexSummary(overrides: Partial<ProjectSummary>): ProjectSummary {
  return {
    progressPath: "C:/repo/project-progress/Progress.md",
    project: "Demo",
    status: "active",
    path: "C:/repo",
    updated: "2026-06-27",
    lastMilestone: "created",
    deployed: false,
    deploymentUrl: "",
    sensitivity: "normal",
    commitProgress: true,
    resumeSnapshot: "Summary",
    nextAction: "Continue",
    blockers: "None",
    ...overrides
  };
}

async function withIndex(
  projects: ProjectSummary[],
  run: () => Promise<void>
): Promise<void> {
  const previousHome = process.env.AWESOME_PROGRESS_TRACKER_HOME;
  const previousRoots = process.env.PROJECT_PROGRESS_ROOTS;
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-home-"));
  process.env.AWESOME_PROGRESS_TRACKER_HOME = homeDir;
  delete process.env.PROJECT_PROGRESS_ROOTS;
  await writeProjectIndex({ schemaVersion: 1, updatedAt: "2026-06-27T00:00:00Z", projects }, { homeDir });
  try {
    await run();
  } finally {
    if (previousHome === undefined) delete process.env.AWESOME_PROGRESS_TRACKER_HOME;
    else process.env.AWESOME_PROGRESS_TRACKER_HOME = previousHome;
    if (previousRoots === undefined) delete process.env.PROJECT_PROGRESS_ROOTS;
    else process.env.PROJECT_PROGRESS_ROOTS = previousRoots;
  }
}

describe("MCP server tools", () => {
  it("returns typed success and actionable error envelopes", () => {
    expect(successResult({ updated: true }, "Progress updated.")).toMatchObject({
      structuredContent: { updated: true },
      isError: false
    });
    expect(errorResult("project_not_found", "Project not found.", "Refresh projects and retry.")).toMatchObject({
      structuredContent: { error: { code: "project_not_found" } },
      isError: true
    });
  });

  it("rejects invalid write input at the MCP schema boundary", () => {
    expect(projectSelectorSchema.safeParse("  ").success).toBe(false);
    expect(progressSectionSchema.safeParse("Not A Real Section").success).toBe(false);
    expect(sectionContentSchema.safeParse("x".repeat(4001)).success).toBe(false);
    expect(lastMilestoneSchema.safeParse("x".repeat(241)).success).toBe(false);
  });

  it("marks individually truncated compact fields", () => {
    expect(compactProjectListItem(indexSummary({ nextAction: "x".repeat(1001) }))).toMatchObject({
      nextAction: `${"x".repeat(997)}...`,
      truncatedFields: ["nextAction"]
    });
  });

  it("defines compact progress tools", () => {
    expect(toolDefinitions.map((tool) => tool.name)).toEqual([
      "list_projects",
      "refresh_projects",
      "read_project_progress",
      "update_project_progress",
      "mark_project_status",
      "set_project_gates"
    ]);
  });

  it("does not scan the launch cwd when PROJECT_PROGRESS_ROOTS is unset or blank", () => {
    expect(rootsFromEnv(undefined)).toEqual([]);
    expect(rootsFromEnv(" ;  ")).toEqual([]);
  });

  it("returns no projects when PROJECT_PROGRESS_ROOTS is unset", async () => {
    const previousRoots = process.env.PROJECT_PROGRESS_ROOTS;
    const previousHome = process.env.AWESOME_PROGRESS_TRACKER_HOME;
    process.env.AWESOME_PROGRESS_TRACKER_HOME = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-home-"));
    delete process.env.PROJECT_PROGRESS_ROOTS;

    try {
      expect(JSON.parse(await projectsJson())).toEqual({
        items: [],
        total: 0,
        returned: 0,
        truncated: false,
        indexUpdatedAt: "",
        indexAgeMs: null,
        refreshRecommended: true
      });
    } finally {
      if (previousHome === undefined) {
        delete process.env.AWESOME_PROGRESS_TRACKER_HOME;
      } else {
        process.env.AWESOME_PROGRESS_TRACKER_HOME = previousHome;
      }
      if (previousRoots === undefined) {
        delete process.env.PROJECT_PROGRESS_ROOTS;
      } else {
        process.env.PROJECT_PROGRESS_ROOTS = previousRoots;
      }
    }
  });

  it("returns a bounded summary envelope for the default project list", async () => {
    await withIndex(
      [
        indexSummary({ project: "First", resumeSnapshot: "Long private resume context.", blockers: "None." }),
        indexSummary({ project: "Second", progressPath: "C:/second/project-progress/Progress.md", path: "C:/second" })
      ],
      async () => {
        expect(JSON.parse(await projectsJson())).toEqual({
          items: [
            { project: "First", status: "active", updated: "2026-06-27", nextAction: "Continue", path: "C:/repo", truncatedFields: [] },
            { project: "Second", status: "active", updated: "2026-06-27", nextAction: "Continue", path: "C:/second", truncatedFields: [] }
          ],
          total: 2,
          returned: 2,
          truncated: false,
          indexUpdatedAt: "2026-06-27T00:00:00Z",
          indexAgeMs: expect.any(Number),
          refreshRecommended: true
        });
      }
    );
  });

  it("returns refresh statistics without repeating the full project list", async () => {
    await withIndex([indexSummary({ project: "First" })], async () => {
      const result = JSON.parse(await refreshProjectsJson());
      expect(result).toMatchObject({ refreshed: true, total: 0 });
      expect(result.projects).toBeUndefined();
    });
  });

  it("splits configured roots on semicolons", () => {
    expect(rootsFromEnv("C:/one; C:/two ;")).toEqual(["C:/one", "C:/two"]);
  });

  it("caps project summaries and truncates long compact fields", () => {
    const longText = "abcdefghijklmnopqrstuvwxyz";
    const summaries: ProjectSummary[] = Array.from({ length: 3 }, (_, index) => ({
      progressPath: longText,
      project: longText,
      status: "active",
      path: longText,
      updated: longText,
      lastMilestone: longText,
      deployed: false,
      deploymentUrl: longText,
      sensitivity: "normal",
      commitProgress: true,
      resumeSnapshot: longText,
      nextAction: longText,
      blockers: longText
    }));

    const bounded = boundProjectSummaries(summaries, { maxProjects: 2, maxStringLength: 12 });

    expect(bounded).toHaveLength(2);
    expect(bounded[0].progressPath).toBe("abcdefghi...");
    expect(bounded[0].project).toBe("abcdefghi...");
    expect(bounded[0].path).toBe("abcdefghi...");
    expect(bounded[0].updated).toBe("abcdefghi...");
    expect(bounded[0].lastMilestone).toBe("abcdefghi...");
    expect(bounded[0].deploymentUrl).toBe("abcdefghi...");
    expect(bounded[0].resumeSnapshot).toBe("abcdefghi...");
    expect(bounded[0].nextAction).toBe("abcdefghi...");
    expect(bounded[0].blockers).toBe("abcdefghi...");
  });

  it("resolves a unique project by name", async () => {
    await withIndex([indexSummary({ project: "Solo", progressPath: "C:/solo/project-progress/Progress.md", path: "C:/solo" })], async () => {
      const resolution = await resolveProject("Solo");
      expect(resolution.error).toBeUndefined();
      expect(resolution.project?.path).toBe("C:/solo");
    });
  });

  it("errors on an ambiguous name instead of editing the first match", async () => {
    await withIndex(
      [
        indexSummary({ project: "Dup", progressPath: "C:/one/project-progress/Progress.md", path: "C:/one" }),
        indexSummary({ project: "Dup", progressPath: "C:/two/project-progress/Progress.md", path: "C:/two" })
      ],
      async () => {
        const resolution = await resolveProject("Dup");
        expect(resolution.project).toBeUndefined();
        expect(resolution.error).toContain("ambiguous");
        expect(resolution.error).toContain("C:/one");
        expect(resolution.error).toContain("C:/two");
      }
    );
  });

  it("disambiguates duplicate names by exact path selector", async () => {
    await withIndex(
      [
        indexSummary({ project: "Dup", progressPath: "C:/one/project-progress/Progress.md", path: "C:/one" }),
        indexSummary({ project: "Dup", progressPath: "C:/two/project-progress/Progress.md", path: "C:/two" })
      ],
      async () => {
        const resolution = await resolveProject("C:/two");
        expect(resolution.error).toBeUndefined();
        expect(resolution.project?.path).toBe("C:/two");
      }
    );
  });

  it("resolves a Progress.md outside PROJECT_PROGRESS_ROOTS when the caller names its exact path", async () => {
    await withIndex([], async () => {
      const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-outside-root-"));
      const progressDir = path.join(projectDir, "project-progress");
      await fs.mkdir(progressDir, { recursive: true });
      const progressPath = path.join(progressDir, "Progress.md");
      await fs.writeFile(
        progressPath,
        [
          "---",
          "project: Outside Root",
          "status: active",
          "updated: 2026-06-27",
          "---",
          "",
          "## Resume Snapshot",
          "",
          "Fresh checkout, never scanned.",
          "",
          "## Next Action",
          "",
          "Do the thing.",
          "",
          "## Blockers",
          "",
          "None."
        ].join("\n"),
        "utf-8"
      );

      try {
        const byProjectDir = await resolveProject(projectDir);
        expect(byProjectDir.error).toBeUndefined();
        expect(byProjectDir.project?.project).toBe("Outside Root");

        const byExactFile = await resolveProject(progressPath);
        expect(byExactFile.error).toBeUndefined();
        expect(byExactFile.project?.nextAction).toBe("Do the thing.");
      } finally {
        await fs.rm(projectDir, { recursive: true, force: true });
      }
    });
  });

  it("returns bounded selector suggestions when a project is not found", async () => {
    await withIndex([indexSummary({ project: "Solo" })], async () => {
      const resolution = await resolveProject("sol");
      expect(resolution.error).toBe("project not found");
      expect(resolution.suggestions).toEqual([expect.objectContaining({ project: "Solo", path: "C:/repo" })]);
    });
  });

  it("points the package mcp script at the emitted server path", async () => {
    const packageJson = JSON.parse(await fs.readFile(path.join(process.cwd(), "package.json"), "utf-8"));

    expect(packageJson.scripts.mcp).toBe("node dist/src/mcp/server.js");
  });

});

describe("set_project_gates", () => {
  it("is registered in the tool list", () => {
    expect(toolDefinitions.map((tool) => tool.name)).toContain("set_project_gates");
  });
});

describe("gateFrontmatterUpdates", () => {
  it("maps only supplied gates to prefixed frontmatter keys", () => {
    expect(gateFrontmatterUpdates({ tests: "failing", deploy: "not-started" })).toEqual([
      ["gate_tests", "failing"],
      ["gate_deploy", "not-started"]
    ]);
  });

  it("returns an empty list when no gates are supplied", () => {
    expect(gateFrontmatterUpdates({})).toEqual([]);
  });

  it("preserves canonical key order regardless of input order", () => {
    expect(gateFrontmatterUpdates({ deploy: "done", implementation: "done" })).toEqual([
      ["gate_implementation", "done"],
      ["gate_deploy", "done"]
    ]);
  });

  // These two cover the handler's transform composition (gateFrontmatterUpdates
  // feeding replaceFrontmatterValue over a real document) — not the MCP
  // transport layer, which has no handler-level tests anywhere in this codebase.
  it("leaves unsupplied gates untouched when applied to a document", () => {
    const doc = [
      "---",
      "project: Demo",
      "status: active",
      "gate_implementation: done",
      "gate_tests: not-started",
      "gate_review: pending",
      "gate_deploy: blocked",
      "---",
      "",
      "## Next Action",
      "",
      "Do the thing.",
      ""
    ].join("\n");

    let updated = doc;
    for (const [key, value] of gateFrontmatterUpdates({ tests: "failing" })) {
      updated = replaceFrontmatterValue(updated, key, value);
    }

    const frontmatter = parseFrontmatter(updated);
    expect(frontmatter.gate_tests).toBe("failing");
    expect(frontmatter.gate_implementation).toBe("done");
    expect(frontmatter.gate_review).toBe("pending");
    expect(frontmatter.gate_deploy).toBe("blocked");
  });

  it("does not disturb the document body when writing a gate", () => {
    const doc = [
      "---",
      "project: Demo",
      "status: active",
      "gate_implementation: done",
      "gate_tests: not-started",
      "gate_review: pending",
      "gate_deploy: blocked",
      "---",
      "",
      "## Next Action",
      "",
      "Do the thing.",
      ""
    ].join("\n");

    let updated = doc;
    for (const [key, value] of gateFrontmatterUpdates({ tests: "failing" })) {
      updated = replaceFrontmatterValue(updated, key, value);
    }

    expect(updated).toContain("## Next Action");
    expect(updated).toContain("Do the thing.");
  });

  it("inserts gates into a document that has none", () => {
    const doc = [
      "---",
      "project: Demo",
      "status: active",
      "---",
      "",
      "## Next Action",
      "",
      "Do the thing.",
      ""
    ].join("\n");

    let updated = doc;
    for (const [key, value] of gateFrontmatterUpdates({ implementation: "done", tests: "failing" })) {
      updated = replaceFrontmatterValue(updated, key, value);
    }

    // Key order after insert is not part of the contract — readers go
    // through GATE_KEYS and are order-independent — so we assert on
    // parsed values, not on line order.
    const frontmatter = parseFrontmatter(updated);
    expect(frontmatter.gate_implementation).toBe("done");
    expect(frontmatter.gate_tests).toBe("failing");
    expect(frontmatter.project).toBe("Demo");
    expect(frontmatter.status).toBe("active");
    expect(updated).toContain("## Next Action");
  });
});

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

describe("ambiguity reporting", () => {
  it("distinguishes candidates that share one project directory", async () => {
    // A worktree checkout puts a second Progress.md under the same project.
    // Listing the project directory would print the same string twice and
    // tell the caller nothing about how to pick one.
    await withIndex(
      [
        indexSummary({
          project: "Dup",
          progressPath: "C:/repo/.worktrees/wt/project-progress/Progress.md",
          path: "C:/repo"
        }),
        indexSummary({
          project: "Dup",
          progressPath: "C:/repo/project-progress/Progress.md",
          path: "C:/repo"
        })
      ],
      async () => {
        const resolution = await resolveProject("Dup");

        expect(resolution.error).toContain("ambiguous");
        expect(resolution.error).toContain("C:/repo/.worktrees/wt/project-progress/Progress.md");
        expect(resolution.error).toContain("C:/repo/project-progress/Progress.md");
      }
    );
  });
});
