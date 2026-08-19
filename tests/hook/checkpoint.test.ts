import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readCheckpoint } from "../../src/hook/checkpoint.js";

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-ckpt-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir, stdio: "ignore" });
  return dir;
}

async function commit(dir: string, name: string, body: string): Promise<string> {
  await fs.writeFile(path.join(dir, name), body, "utf-8");
  execFileSync("git", ["add", "."], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["commit", "-q", "-m", `add ${name}`], { cwd: dir, stdio: "ignore" });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).trim();
}

describe("readCheckpoint", () => {
  it("returns null outside a git repository", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-nogit-"));
    expect(readCheckpoint(dir, new Date())).toBeNull();
  });

  it("reads head, branch, clean tree, and a second-precision timestamp", async () => {
    const dir = await makeRepo();
    const sha = await commit(dir, "a.txt", "a");

    const result = readCheckpoint(dir, new Date("2026-08-19T14:02:11.123Z"));

    expect(result).not.toBeNull();
    expect(result!.base_commit).toBe(sha);
    expect(result!.base_branch).toBe("main");
    expect(result!.worktree_dirty).toBe(false);
    expect(result!.checkpoint_at).toBe("2026-08-19T14:02:11Z");
  });

  it("reports a dirty worktree", async () => {
    const dir = await makeRepo();
    await commit(dir, "a.txt", "a");
    await fs.writeFile(path.join(dir, "b.txt"), "b", "utf-8");

    expect(readCheckpoint(dir, new Date())!.worktree_dirty).toBe(true);
  });

  it("reports a detached HEAD as (detached)", async () => {
    const dir = await makeRepo();
    const sha = await commit(dir, "a.txt", "a");
    await commit(dir, "b.txt", "b");
    execFileSync("git", ["checkout", "-q", sha], { cwd: dir, stdio: "ignore" });

    expect(readCheckpoint(dir, new Date())!.base_branch).toBe("(detached)");
  });
});
