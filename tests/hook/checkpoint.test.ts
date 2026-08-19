import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  readCheckpoint,
  resolveDrift,
  renderDrift,
  renderGates,
  MAX_DRIFT_FILES,
  type GitRunner
} from "../../src/hook/checkpoint.js";

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

  it("reports behind when the checkpoint is a descendant of HEAD", async () => {
    const dir = await makeRepo();
    await commit(dir, "a.txt", "a");
    const bSha = await commit(dir, "b.txt", "b");
    execFileSync("git", ["reset", "-q", "--hard", "HEAD~1"], { cwd: dir, stdio: "ignore" });

    const status = resolveDrift(dir, bSha);

    expect(status).toMatchObject({
      kind: "behind",
      onlyOnCheckpoint: 1
    });
    expect((status as { files: string[] }).files).toEqual(["b.txt"]);
  });

  it("reports unknown when ancestry cannot be determined at all", () => {
    const head = "f".repeat(40);
    const base = "1".repeat(40);
    const { git } = stubGit({
      "rev-parse HEAD": head,
      [`cat-file -e ${base}^{commit}`]: "",
      "rev-parse --abbrev-ref HEAD": "main",
      [`merge-base --is-ancestor ${base} ${head}`]: null,
      [`merge-base --is-ancestor ${head} ${base}`]: null,
      [`rev-list --left-right --count ${base}...${head}`]: null
    });

    const status = resolveDrift("/repo", base, git);

    expect(status).toEqual({ kind: "unknown", head, branch: "main" });
  });

  it("reports branch as (detached) through resolveDrift on a detached HEAD", async () => {
    const dir = await makeRepo();
    const base = await commit(dir, "a.txt", "a");
    const head = await commit(dir, "b.txt", "b");
    execFileSync("git", ["checkout", "-q", head], { cwd: dir, stdio: "ignore" });

    const status = resolveDrift(dir, base);

    expect(status).toMatchObject({ kind: "ahead", branch: "(detached)" });
  });

  it("falls back to 0 commitsBehind when rev-list --count fails on the ahead path", () => {
    const head = "f".repeat(40);
    const base = "1".repeat(40);
    const { git } = stubGit({
      "rev-parse HEAD": head,
      [`cat-file -e ${base}^{commit}`]: "",
      "rev-parse --abbrev-ref HEAD": "main",
      [`merge-base --is-ancestor ${base} ${head}`]: "",
      [`rev-list --count ${base}..${head}`]: null,
      [`diff --name-only ${base}..${head}`]: ""
    });

    const status = resolveDrift("/repo", base, git);

    expect(status).toMatchObject({ kind: "ahead", commitsBehind: 0 });
  });
});

const BASE = "e7d3f98a1b2c3d4e5f60718293a4b5c6d7e8f900";
const HEAD = "def456ab1c2d3e4f5061728394a5b6c7d8e9f001";

describe("renderDrift", () => {
  it("renders nothing when there is no drift", () => {
    expect(renderDrift({ kind: "none" }, BASE)).toBe("");
  });

  it("renders an ancestor checkpoint with a file list", () => {
    const text = renderDrift(
      {
        kind: "ahead",
        commitsBehind: 4,
        head: HEAD,
        branch: "main",
        files: ["src/mcp/writer.ts", "src/hook/cc-adapter.ts"]
      },
      BASE
    );

    expect(text).toContain("stored base_commit e7d3f98");
    expect(text).toContain("4 commits behind HEAD def456a (branch main)");
    expect(text).toContain("  src/mcp/writer.ts");
    expect(text).toContain("Verify Next Action still applies");
  });

  it("uses singular wording for a single commit", () => {
    const text = renderDrift(
      { kind: "ahead", commitsBehind: 1, head: HEAD, branch: "main", files: [] },
      BASE
    );
    expect(text).toContain("1 commit behind");
    expect(text).not.toContain("Changed since checkpoint");
  });

  it("caps the file list and reports the remainder", () => {
    const files = Array.from({ length: MAX_DRIFT_FILES + 3 }, (_, index) => `f${index}.ts`);
    const text = renderDrift(
      { kind: "ahead", commitsBehind: 2, head: HEAD, branch: "main", files },
      BASE
    );

    expect(text).toContain("  f0.ts");
    expect(text).toContain(`  f${MAX_DRIFT_FILES - 1}.ts`);
    expect(text).not.toContain(`  f${MAX_DRIFT_FILES}.ts`);
    expect(text).toContain("(+3 more)");
  });

  it("renders divergence with both sides", () => {
    const text = renderDrift(
      {
        kind: "diverged",
        onlyOnCheckpoint: 2,
        onlyOnHead: 3,
        head: HEAD,
        branch: "main",
        files: ["a.ts"]
      },
      BASE
    );

    expect(text).toContain("has diverged from HEAD def456a");
    expect(text).toContain("2 on the checkpoint side, 3 on HEAD");
  });

  it("renders a missing checkpoint without a file list", () => {
    const text = renderDrift({ kind: "missing", head: HEAD, branch: "main" }, BASE);

    expect(text).toContain("no longer in this repository's history");
    expect(text).not.toContain("Changed since checkpoint");
  });

  it("renders a backwards reset as behind the checkpoint", () => {
    const text = renderDrift(
      { kind: "behind", onlyOnCheckpoint: 3, head: HEAD, branch: "main", files: ["a.ts"] },
      BASE
    );

    expect(text).toContain("3 commits behind the stored checkpoint");
    expect(text).toContain("reset backwards past it");
    expect(text).toContain("  a.ts");
  });

  it("uses singular wording for a single commit behind the checkpoint", () => {
    const text = renderDrift(
      { kind: "behind", onlyOnCheckpoint: 1, head: HEAD, branch: "main", files: [] },
      BASE
    );

    expect(text).toContain("1 commit behind the stored checkpoint");
  });

  it("renders an undetermined comparison without inventing counts", () => {
    const text = renderDrift({ kind: "unknown", head: HEAD, branch: "main" }, BASE);

    expect(text).toContain("could not be determined");
    expect(text).toContain("shallow clone");
    expect(text).not.toContain("Changed since checkpoint");
  });
});

describe("renderGates", () => {
  it("renders nothing when no gates are present", () => {
    expect(renderGates({ project: "Demo" })).toBe("");
  });

  it("renders nothing when every present gate is done", () => {
    expect(renderGates({ gate_tests: "done", gate_review: "done" })).toBe("");
  });

  it("renders only the gates that are not done, in canonical key order", () => {
    const text = renderGates({
      gate_implementation: "done",
      gate_tests: "failing",
      gate_review: "pending",
      gate_deploy: "not-started"
    });

    expect(text).toBe("Gates at checkpoint: tests=failing, review=pending, deploy=not-started");
  });
});
