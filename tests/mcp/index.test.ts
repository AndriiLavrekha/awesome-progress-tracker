import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  indexJsonPath,
  indexMarkdownPath,
  readProjectIndex,
  refreshProjectIndex,
  upsertIndexedProject
} from "../../src/mcp/index.js";
import type { ProjectSummary } from "../../src/mcp/schema.js";

function summary(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
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

describe("project index", () => {
  it("refreshes JSON and Markdown indexes from discovered projects", async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-index-"));

    const index = await refreshProjectIndex(["tests/fixtures"], [".git", "node_modules"], {
      homeDir,
      now: new Date("2026-06-27T12:00:00Z")
    });

    expect(index.projects.map((project) => project.project)).toContain("Valid Fixture");
    expect(await readProjectIndex({ homeDir })).toEqual(index);
    expect(await fs.readFile(indexJsonPath(homeDir), "utf-8")).toContain("Valid Fixture");
    expect(await fs.readFile(indexMarkdownPath(homeDir), "utf-8")).toContain("| Valid Fixture | active |");
  });

  it("upserts projects by progress path", async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-index-"));

    await upsertIndexedProject(summary({ nextAction: "First" }), { homeDir, now: new Date("2026-06-27T12:00:00Z") });
    await upsertIndexedProject(summary({ nextAction: "Second" }), { homeDir, now: new Date("2026-06-27T12:01:00Z") });

    const index = await readProjectIndex({ homeDir });
    expect(index.projects).toHaveLength(1);
    expect(index.projects[0].nextAction).toBe("Second");
    await expect(fs.access(indexMarkdownPath(homeDir))).rejects.toThrow();
  });

  it("prunes projects deleted from a scanned root on refresh", async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-index-"));
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-root-"));
    const projectDir = path.join(root, "demo");
    await fs.mkdir(path.join(projectDir, "project-progress"), { recursive: true });
    await fs.writeFile(
      path.join(projectDir, "project-progress", "Progress.md"),
      `---\nproject: Ephemeral\npath: ${projectDir}\nstatus: active\n---\n\n## Next Action\n\nGo\n`,
      "utf-8"
    );

    const first = await refreshProjectIndex([root], [".git", "node_modules"], { homeDir });
    expect(first.projects.map((project) => project.project)).toContain("Ephemeral");

    await fs.rm(projectDir, { recursive: true, force: true });

    const second = await refreshProjectIndex([root], [".git", "node_modules"], { homeDir });
    expect(second.projects.map((project) => project.project)).not.toContain("Ephemeral");
  });

  it("keeps out-of-root projects that still exist but prunes ones whose file is gone", async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-index-"));
    const liveDir = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-live-"));
    const liveProgress = path.join(liveDir, "project-progress", "Progress.md");
    await fs.mkdir(path.dirname(liveProgress), { recursive: true });
    await fs.writeFile(liveProgress, "live", "utf-8");

    await upsertIndexedProject(summary({ project: "Live", progressPath: liveProgress, path: liveDir }), {
      homeDir,
      now: new Date("2026-06-27T12:00:00Z")
    });
    await upsertIndexedProject(
      summary({ project: "Ghost", progressPath: "C:/gone/project-progress/Progress.md", path: "C:/gone" }),
      { homeDir, now: new Date("2026-06-27T12:01:00Z") }
    );

    const emptyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-empty-"));
    const refreshed = await refreshProjectIndex([emptyRoot], [".git", "node_modules"], { homeDir });

    const names = refreshed.projects.map((project) => project.project);
    expect(names).toContain("Live");
    expect(names).not.toContain("Ghost");
  });
});
