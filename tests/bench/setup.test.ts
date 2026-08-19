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

  await fs.mkdir(path.join(repo, "project-progress"), { recursive: true });
  await fs.writeFile(path.join(repo, "project-progress", "Progress.md"), "# P\n", "utf-8");
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
    await expect(fs.access(path.join(target, "project-progress", "Progress.md"))).resolves
      .toBeUndefined();
  });
});

describe("applyCondition", () => {
  it("leaves project-progress in place for the tracker condition", async () => {
    const bundle = await makeBundle();
    const target = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "bench-t-")), "repo");
    await materialize(bundle, target);

    await applyCondition(target, "tracker");

    await expect(fs.access(path.join(target, "project-progress"))).resolves.toBeUndefined();
  });

  it("removes project-progress for the baseline condition", async () => {
    const bundle = await makeBundle();
    const target = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "bench-b-")), "repo");
    await materialize(bundle, target);

    await applyCondition(target, "baseline");

    await expect(fs.access(path.join(target, "project-progress"))).rejects.toThrow();
  });

  it("leaves the tree untouched for an unrecognized named condition", async () => {
    const bundle = await makeBundle();
    const target = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "bench-x-")), "repo");
    await materialize(bundle, target);

    await applyCondition(target, "some-competitor");

    await expect(fs.access(path.join(target, "project-progress"))).resolves.toBeUndefined();
  });

  it("names the two built-in conditions", () => {
    expect(CONDITIONS).toEqual(["tracker", "baseline"]);
  });
});
