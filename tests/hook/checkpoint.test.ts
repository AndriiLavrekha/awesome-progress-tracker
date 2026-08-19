import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readCheckpoint, resolveDrift, type GitRunner } from "../../src/hook/checkpoint.js";

function stubGit(responses: Record<string, string | null>) {
  const calls: Array<{ cwd: string; args: string[] }> = [];
  const git: GitRunner = (cwd, args) => {
    calls.push({ cwd, args });
    return responses[args.join(" ")] ?? null;
  };
  return { git, calls };
}

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

  it("sends the exact expected argument arrays, with cwd passed through unchanged", () => {
    const cwd = "/some/repo";
    const { git, calls } = stubGit({
      "rev-parse HEAD": "deadbeef",
      "status --porcelain": "",
      "rev-parse --abbrev-ref HEAD": "main"
    });

    readCheckpoint(cwd, new Date(), git);

    const argLists = calls.map((c) => c.args);
    expect(argLists).toContainEqual(["rev-parse", "HEAD"]);
    expect(argLists).toContainEqual(["status", "--porcelain"]);
    expect(argLists).toContainEqual(["rev-parse", "--abbrev-ref", "HEAD"]);
    for (const call of calls) {
      expect(call.cwd).toBe(cwd);
    }
  });

  it("treats an empty status string as a clean worktree", () => {
    const { git } = stubGit({
      "rev-parse HEAD": "deadbeef",
      "status --porcelain": "",
      "rev-parse --abbrev-ref HEAD": "main"
    });

    expect(readCheckpoint("/repo", new Date(), git)!.worktree_dirty).toBe(false);
  });

  it("treats a null status result as a clean worktree", () => {
    const { git } = stubGit({
      "rev-parse HEAD": "deadbeef",
      "status --porcelain": null,
      "rev-parse --abbrev-ref HEAD": "main"
    });

    expect(readCheckpoint("/repo", new Date(), git)!.worktree_dirty).toBe(false);
  });

  it("treats non-empty status output as a dirty worktree", () => {
    const { git } = stubGit({
      "rev-parse HEAD": "deadbeef",
      "status --porcelain": " M src/a.ts\n",
      "rev-parse --abbrev-ref HEAD": "main"
    });

    expect(readCheckpoint("/repo", new Date(), git)!.worktree_dirty).toBe(true);
  });

  it("short-circuits when rev-parse HEAD fails, without calling status", () => {
    const { git, calls } = stubGit({
      "rev-parse HEAD": null
    });

    const result = readCheckpoint("/repo", new Date(), git);

    expect(result).toBeNull();
    expect(calls.some((c) => c.args.join(" ") === "status --porcelain")).toBe(false);
  });

  it("returns null for a cwd that does not exist", async () => {
    const dir = path.join(os.tmpdir(), "pp-ckpt-does-not-exist-" + Date.now());
    expect(readCheckpoint(dir, new Date())).toBeNull();
  });

  it("returns null for a repository with zero commits", async () => {
    const dir = await makeRepo();
    expect(readCheckpoint(dir, new Date())).toBeNull();
  });
});

describe("resolveDrift", () => {
  it("returns null outside a git repository", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-nogit2-"));
    expect(resolveDrift(dir, "e".repeat(40))).toBeNull();
  });

  it("reports no drift when the checkpoint is HEAD", async () => {
    const dir = await makeRepo();
    const sha = await commit(dir, "a.txt", "a");
    expect(resolveDrift(dir, sha)).toEqual({ kind: "none" });
  });

  it("reports commits behind and changed files for an ancestor checkpoint", async () => {
    const dir = await makeRepo();
    const base = await commit(dir, "a.txt", "a");
    await commit(dir, "b.txt", "b");
    const head = await commit(dir, "c.txt", "c");

    const status = resolveDrift(dir, base);

    expect(status).toMatchObject({
      kind: "ahead",
      commitsBehind: 2,
      head,
      branch: "main"
    });
    expect((status as { files: string[] }).files.sort()).toEqual(["b.txt", "c.txt"]);
  });

  it("reports divergence when the checkpoint is on another branch", async () => {
    const dir = await makeRepo();
    await commit(dir, "a.txt", "a");
    execFileSync("git", ["checkout", "-q", "-b", "side"], { cwd: dir, stdio: "ignore" });
    const side = await commit(dir, "side.txt", "side");
    execFileSync("git", ["checkout", "-q", "main"], { cwd: dir, stdio: "ignore" });
    const head = await commit(dir, "main.txt", "main");

    const status = resolveDrift(dir, side);

    expect(status).toMatchObject({
      kind: "diverged",
      onlyOnCheckpoint: 1,
      onlyOnHead: 1,
      head,
      branch: "main"
    });
    // Compared against the merge base, so only HEAD's own change appears.
    expect((status as { files: string[] }).files).toEqual(["main.txt"]);
  });

  it("reports a checkpoint commit that is not in the repository", async () => {
    const dir = await makeRepo();
    const head = await commit(dir, "a.txt", "a");

    const status = resolveDrift(dir, "0".repeat(40));

    expect(status).toEqual({ kind: "missing", head, branch: "main" });
  });
});
