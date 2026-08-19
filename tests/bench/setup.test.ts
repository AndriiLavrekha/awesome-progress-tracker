import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONDITIONS, applyCondition, materialize } from "../../bench/harness/setup.js";

async function makeBundle(): Promise<string> {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "bench-src-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repo, stdio: "ignore" });

  await fs.writeFile(path.join(repo, "code.ts"), "export const a = 1;\n", "utf-8");

  execFileSync("git", ["add", "."], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: repo, stdio: "ignore" });

  const bundle = path.join(repo, "..", `bundle-${Date.now()}.bundle`);
  execFileSync("git", ["bundle", "create", bundle, "--all"], { cwd: repo, stdio: "ignore" });
  return bundle;
}

describe("materialize", () => {
  it("restores a bundle into a fresh working tree", async () => {
    const bundle = await makeBundle();
    const target = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "bench-out-")), "repo");

    await materialize(bundle, target);

    expect(await fs.readFile(path.join(target, "code.ts"), "utf-8")).toBe("export const a = 1;\n");
  });
});

describe("applyCondition", () => {
  async function makeScenario(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bench-scenario-"));
    const overlay = path.join(dir, "conditions", "tracker", "project-progress");
    await fs.mkdir(overlay, { recursive: true });
    await fs.writeFile(path.join(overlay, "Progress.md"), "## Next Action\n\nWire it.\n", "utf-8");
    return dir;
  }

  it("copies the condition overlay into the tree", async () => {
    const bundle = await makeBundle();
    const scenarioDir = await makeScenario();
    const target = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "bench-t-")), "repo");
    await materialize(bundle, target);

    await applyCondition(target, "tracker", scenarioDir);

    expect(
      await fs.readFile(path.join(target, "project-progress", "Progress.md"), "utf-8")
    ).toContain("Wire it.");
  });

  it("leaves no overlay for the baseline condition", async () => {
    const bundle = await makeBundle();
    const scenarioDir = await makeScenario();
    const target = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "bench-b-")), "repo");
    await materialize(bundle, target);

    await applyCondition(target, "baseline", scenarioDir);

    await expect(fs.access(path.join(target, "project-progress"))).rejects.toThrow();
  });

  it("leaves the tree untouched for a condition with no overlay", async () => {
    const bundle = await makeBundle();
    const scenarioDir = await makeScenario();
    const target = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "bench-x-")), "repo");
    await materialize(bundle, target);

    await applyCondition(target, "some-competitor", scenarioDir);

    await expect(fs.access(path.join(target, "project-progress"))).rejects.toThrow();
    expect(await fs.readFile(path.join(target, "code.ts"), "utf-8")).toBe("export const a = 1;\n");
  });

  it("commits the overlay so both conditions start from a clean tree", async () => {
    const bundle = await makeBundle();
    const scenarioDir = await makeScenario();
    const target = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "bench-c-")), "repo");
    await materialize(bundle, target);

    await applyCondition(target, "tracker", scenarioDir);

    const status = execFileSync("git", ["status", "--porcelain"], { cwd: target, encoding: "utf-8" });
    expect(status.trim()).toBe("");
  });

  it("leaves nothing about the tracker recoverable in a baseline checkout", async () => {
    const bundle = await makeBundle();
    const scenarioDir = await makeScenario();
    const target = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "bench-h-")), "repo");
    await materialize(bundle, target);

    await applyCondition(target, "baseline", scenarioDir);

    // The first fixture committed project-progress and then deleted the
    // working copy, so a baseline agent recovered the resume note from git
    // log. Baseline must be blind in history as well as on disk.
    const log = execFileSync("git", ["log", "--all", "--name-only", "--format="], {
      cwd: target,
      encoding: "utf-8"
    });
    expect(log).not.toContain("project-progress");
  });

  it("names the two built-in conditions", () => {
    expect(CONDITIONS).toEqual(["tracker", "baseline"]);
  });
});
