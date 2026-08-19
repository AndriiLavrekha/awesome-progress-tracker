# Checkpoint Validation and Verification Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record where a progress checkpoint was taken (commit, branch, dirty state, timestamp) and what had been verified at that point (four gates), then report drift from that checkpoint when a session starts.

**Architecture:** Eight optional frontmatter keys, validated but never required. A new `src/hook/checkpoint.ts` owns all git interrogation and all drift rendering behind an injectable git runner. The Stop hook stamps checkpoint fields when its freshness check says the agent actually updated `Progress.md`. The SessionStart hook reads them back and appends a bounded drift block. A new MCP tool writes gates.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Node built-ins only, vitest, zod v4 for MCP input schemas, `@modelcontextprotocol/sdk`.

**Spec:** `docs/superpowers/specs/2026-08-19-checkpoint-validation-design.md`

---

## File Structure

- **Create** `src/hook/checkpoint.ts` — git interrogation, drift resolution, drift/gate rendering. A new file rather than growing `cc-adapter.ts`, which is already ~13.6 KB and holds four hook handlers.
- **Create** `tests/hook/checkpoint.test.ts` — unit tests for the above.
- **Modify** `src/hook/schema.ts` — optional-key registry and gate validation.
- **Modify** `src/hook/cc-adapter.ts` — stamp on Stop, render drift on SessionStart.
- **Modify** `src/mcp/server.ts` — `set_project_gates` tool.
- **Modify** `templates/project-progress/Progress.md` and `skills/project-progress/SKILL.md`.
- **Create** `docs/adr/0018-checkpoint-validation-and-gates.md`.

`tests/hook/validator.test.ts` covers the validator, not the schema, so schema tests go in a new `tests/hook/schema.test.ts`.

---

## Task 1: Optional frontmatter registry and gate validation

**Files:**
- Modify: `src/hook/schema.ts`
- Test: `tests/hook/schema.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/hook/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ALLOWED_GATE_VALUES,
  GATE_KEYS,
  OPTIONAL_FRONTMATTER,
  validateFrontmatter
} from "../../src/hook/schema.js";

function baseFrontmatter(extra: Record<string, string | boolean | number> = {}) {
  return {
    project: "Demo",
    progress_schema_version: 1,
    status: "active",
    path: "/tmp/demo",
    agent_last_used: "claude",
    updated: "2026-08-19",
    last_milestone: "did a thing",
    deployed: false,
    deployment_url: "",
    sensitivity: "normal",
    commit_progress: true,
    ...extra
  };
}

describe("optional checkpoint frontmatter", () => {
  it("exposes the four gate keys and five gate values", () => {
    expect([...GATE_KEYS]).toEqual([
      "gate_implementation",
      "gate_tests",
      "gate_review",
      "gate_deploy"
    ]);
    expect([...ALLOWED_GATE_VALUES]).toEqual([
      "not-started",
      "in-progress",
      "done",
      "failing",
      "blocked"
    ]);
    for (const key of GATE_KEYS) {
      expect(OPTIONAL_FRONTMATTER).toContain(key);
    }
  });

  it("accepts frontmatter with no optional keys at all", () => {
    expect(validateFrontmatter(baseFrontmatter())).toEqual([]);
  });

  it("accepts a complete valid checkpoint", () => {
    const errors = validateFrontmatter(
      baseFrontmatter({
        base_commit: "e7d3f98a1b2c3d4e5f60718293a4b5c6d7e8f900",
        base_branch: "main",
        worktree_dirty: true,
        checkpoint_at: "2026-08-19T14:02:11Z",
        gate_implementation: "done",
        gate_tests: "failing"
      })
    );
    expect(errors).toEqual([]);
  });

  it("rejects a gate value outside the vocabulary", () => {
    const errors = validateFrontmatter(baseFrontmatter({ gate_tests: "green" }));
    expect(errors).toContain(
      "gate_tests must be one of: blocked, done, failing, in-progress, not-started"
    );
  });

  it("rejects a non-boolean worktree_dirty", () => {
    const errors = validateFrontmatter(baseFrontmatter({ worktree_dirty: "yes" }));
    expect(errors).toContain("worktree_dirty must be a boolean");
  });

  it("rejects a short or non-hex base_commit", () => {
    expect(validateFrontmatter(baseFrontmatter({ base_commit: "e7d3f98" }))).toContain(
      "base_commit must be a full 40-character hex SHA"
    );
    expect(validateFrontmatter(baseFrontmatter({ base_commit: "z".repeat(40) }))).toContain(
      "base_commit must be a full 40-character hex SHA"
    );
  });

  it("rejects an unparseable checkpoint_at", () => {
    const errors = validateFrontmatter(baseFrontmatter({ checkpoint_at: "yesterday" }));
    expect(errors).toContain("checkpoint_at must be an ISO 8601 timestamp");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hook/schema.test.ts`

Expected: FAIL with "does not provide an export named 'GATE_KEYS'".

- [ ] **Step 3: Write minimal implementation**

In `src/hook/schema.ts`, add after the `ALLOWED_SENSITIVITY` declaration:

```ts
export const GATE_KEYS = [
  "gate_implementation",
  "gate_tests",
  "gate_review",
  "gate_deploy"
] as const;

export const ALLOWED_GATE_VALUES = [
  "not-started",
  "in-progress",
  "done",
  "failing",
  "blocked"
] as const;

// Keys that may appear in Progress.md frontmatter but are never required.
// Absent always means "unknown", never "invalid", so existing files stay valid
// without migration. The session-handoff work extends this same list.
export const OPTIONAL_FRONTMATTER = [
  "base_commit",
  "base_branch",
  "worktree_dirty",
  "checkpoint_at",
  ...GATE_KEYS
] as const;
```

Then add to the end of `validateFrontmatter`, immediately before `return errors;`:

```ts
  for (const key of GATE_KEYS) {
    if (key in frontmatter && !ALLOWED_GATE_VALUES.includes(frontmatter[key] as never)) {
      errors.push(allowedMessage(key, ALLOWED_GATE_VALUES));
    }
  }

  if ("worktree_dirty" in frontmatter && typeof frontmatter.worktree_dirty !== "boolean") {
    errors.push("worktree_dirty must be a boolean");
  }

  // Stored full-length so it is unambiguous; every human-facing rendering
  // shortens it. A hypothetical all-digit SHA parses as a number upstream and
  // fails this check, which is the safe direction.
  if ("base_commit" in frontmatter && !/^[0-9a-f]{40}$/.test(String(frontmatter.base_commit))) {
    errors.push("base_commit must be a full 40-character hex SHA");
  }

  if (
    "checkpoint_at" in frontmatter &&
    Number.isNaN(Date.parse(String(frontmatter.checkpoint_at)))
  ) {
    errors.push("checkpoint_at must be an ISO 8601 timestamp");
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hook/schema.test.ts`

Expected: PASS, 7 tests.

Then confirm no existing fixture broke.

Run: `npm test`

Expected: PASS, all pre-existing tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/hook/schema.ts tests/hook/schema.test.ts
git commit -m "feat: validate optional checkpoint and gate frontmatter keys"
```

---

## Task 2: Checkpoint reader

**Files:**
- Create: `src/hook/checkpoint.ts`
- Test: `tests/hook/checkpoint.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/hook/checkpoint.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hook/checkpoint.test.ts`

Expected: FAIL — cannot resolve `../../src/hook/checkpoint.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/hook/checkpoint.ts`:

```ts
import { execFileSync } from "node:child_process";
import { GATE_KEYS } from "./schema.js";

export interface CheckpointFields {
  base_commit: string;
  base_branch: string;
  worktree_dirty: boolean;
  checkpoint_at: string;
}

// Returns command stdout, or null when git is absent, the directory is not a
// repository, or the command exits non-zero. Callers rely on the null/""
// distinction: "" means the command succeeded and printed nothing.
export type GitRunner = (cwd: string, args: string[]) => string | null;

export function defaultGitRunner(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return null;
  }
}

function currentBranch(cwd: string, git: GitRunner): string {
  const branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])?.trim();
  return branch && branch !== "HEAD" ? branch : "(detached)";
}

export function readCheckpoint(
  cwd: string,
  now: Date,
  git: GitRunner = defaultGitRunner
): CheckpointFields | null {
  const head = git(cwd, ["rev-parse", "HEAD"])?.trim();
  if (!head) return null;

  const status = git(cwd, ["status", "--porcelain"]);

  return {
    base_commit: head,
    base_branch: currentBranch(cwd, git),
    worktree_dirty: status !== null && status.trim().length > 0,
    checkpoint_at: now.toISOString().replace(/\.\d{3}Z$/, "Z")
  };
}
```

The `GATE_KEYS` import is unused until Task 4. If the build complains about an unused import, add it in Task 4 instead.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hook/checkpoint.test.ts`

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/hook/checkpoint.ts tests/hook/checkpoint.test.ts
git commit -m "feat: add checkpoint reader for git head, branch, and dirty state"
```

---

## Task 3: Drift resolution

**Files:**
- Modify: `src/hook/checkpoint.ts`
- Test: `tests/hook/checkpoint.test.ts` (append a new `describe` block)

- [ ] **Step 1: Write the failing test**

Add `resolveDrift` to the existing import from `../../src/hook/checkpoint.js` at the top of `tests/hook/checkpoint.test.ts`, then append:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hook/checkpoint.test.ts`

Expected: FAIL with "does not provide an export named 'resolveDrift'".

- [ ] **Step 3: Write minimal implementation**

Append to `src/hook/checkpoint.ts`:

```ts
export type DriftStatus =
  | { kind: "none" }
  | { kind: "ahead"; commitsBehind: number; head: string; branch: string; files: string[] }
  | {
      kind: "diverged";
      onlyOnCheckpoint: number;
      onlyOnHead: number;
      head: string;
      branch: string;
      files: string[];
    }
  | { kind: "missing"; head: string; branch: string };

function diffNames(cwd: string, git: GitRunner, range: string): string[] {
  const out = git(cwd, ["diff", "--name-only", range]);
  if (!out) return [];
  return out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function countCommits(cwd: string, git: GitRunner, range: string): number {
  const out = git(cwd, ["rev-list", "--count", range])?.trim();
  const count = out === undefined ? NaN : Number(out);
  return Number.isFinite(count) ? count : 0;
}

export function resolveDrift(
  cwd: string,
  baseCommit: string,
  git: GitRunner = defaultGitRunner
): DriftStatus | null {
  const head = git(cwd, ["rev-parse", "HEAD"])?.trim();
  if (!head) return null;
  if (head === baseCommit) return { kind: "none" };

  const branch = currentBranch(cwd, git);

  // `cat-file -e` prints nothing and exits 0 when the object exists, so a null
  // return (non-zero exit) is the signal that the checkpoint was squashed,
  // rebased away, or garbage collected.
  if (git(cwd, ["cat-file", "-e", `${baseCommit}^{commit}`]) === null) {
    return { kind: "missing", head, branch };
  }

  // Same convention: exits 0 when base is an ancestor of head, 1 when not.
  const isAncestor = git(cwd, ["merge-base", "--is-ancestor", baseCommit, head]) !== null;

  if (isAncestor) {
    return {
      kind: "ahead",
      commitsBehind: countCommits(cwd, git, `${baseCommit}..${head}`),
      head,
      branch,
      files: diffNames(cwd, git, `${baseCommit}..${head}`)
    };
  }

  const counts = git(cwd, ["rev-list", "--left-right", "--count", `${baseCommit}...${head}`])
    ?.trim()
    .split(/\s+/);
  const onlyOnCheckpoint = Number(counts?.[0] ?? 0);
  const onlyOnHead = Number(counts?.[1] ?? 0);

  return {
    kind: "diverged",
    onlyOnCheckpoint: Number.isFinite(onlyOnCheckpoint) ? onlyOnCheckpoint : 0,
    onlyOnHead: Number.isFinite(onlyOnHead) ? onlyOnHead : 0,
    head,
    branch,
    // Three dots compares against the merge base, which is what "changed on
    // HEAD's side since the branches parted" means.
    files: diffNames(cwd, git, `${baseCommit}...${head}`)
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hook/checkpoint.test.ts`

Expected: PASS, 9 tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/hook/checkpoint.ts tests/hook/checkpoint.test.ts
git commit -m "feat: resolve checkpoint drift across ancestor, diverged, and missing cases"
```

---

## Task 4: Drift and gate rendering

**Files:**
- Modify: `src/hook/checkpoint.ts`
- Test: `tests/hook/checkpoint.test.ts` (append a new `describe` block)

- [ ] **Step 1: Write the failing test**

Add `MAX_DRIFT_FILES`, `renderDrift`, and `renderGates` to the existing import at the top of `tests/hook/checkpoint.test.ts`, then append:

```ts
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
```

`review=pending` is deliberately outside `ALLOWED_GATE_VALUES` here, proving the renderer reports whatever is stored rather than silently filtering. Vocabulary enforcement is the schema's job.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hook/checkpoint.test.ts`

Expected: FAIL with "does not provide an export named 'renderDrift'".

- [ ] **Step 3: Write minimal implementation**

Append to `src/hook/checkpoint.ts`:

```ts
export const MAX_DRIFT_FILES = 10;

const CLOSING = "Verify Next Action still applies before acting.";

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function renderFiles(files: string[]): string {
  if (files.length === 0) return "";
  const shown = files.slice(0, MAX_DRIFT_FILES);
  const extra = files.length - shown.length;
  const lines = shown.map((file) => `  ${file}`);
  if (extra > 0) lines.push(`  (+${extra} more)`);
  return `\nChanged since checkpoint:\n${lines.join("\n")}`;
}

export function renderDrift(status: DriftStatus, baseCommit: string): string {
  const base = shortSha(baseCommit);

  switch (status.kind) {
    case "none":
      return "";
    case "missing":
      return (
        `Checkpoint drift: stored base_commit ${base} is no longer in this ` +
        `repository's history (squashed, rebased, or garbage collected). HEAD is ` +
        `${shortSha(status.head)} (branch ${status.branch}). ${CLOSING}`
      );
    case "ahead": {
      const noun = status.commitsBehind === 1 ? "commit" : "commits";
      return (
        `Checkpoint drift: stored base_commit ${base} is ${status.commitsBehind} ` +
        `${noun} behind HEAD ${shortSha(status.head)} (branch ${status.branch}).` +
        `${renderFiles(status.files)}\n${CLOSING}`
      );
    }
    case "diverged":
      return (
        `Checkpoint drift: stored base_commit ${base} has diverged from HEAD ` +
        `${shortSha(status.head)} (branch ${status.branch}): ` +
        `${status.onlyOnCheckpoint} on the checkpoint side, ${status.onlyOnHead} on HEAD.` +
        `${renderFiles(status.files)}\n${CLOSING}`
      );
  }
}

// Reports stored gate values verbatim. Vocabulary enforcement belongs to
// validateFrontmatter; a file hand-edited to an odd value should surface it
// rather than hide it.
export function renderGates(frontmatter: Record<string, string | boolean | number>): string {
  const parts: string[] = [];

  for (const key of GATE_KEYS) {
    const value = frontmatter[key];
    if (value === undefined || value === "done") continue;
    parts.push(`${key.replace(/^gate_/, "")}=${String(value)}`);
  }

  if (parts.length === 0) return "";
  return `Gates at checkpoint: ${parts.join(", ")}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hook/checkpoint.test.ts`

Expected: PASS, 18 tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/hook/checkpoint.ts tests/hook/checkpoint.test.ts
git commit -m "feat: render checkpoint drift and gate summaries"
```

---

## Task 5: Stamp checkpoints from the Stop hook

**Files:**
- Modify: `src/hook/cc-adapter.ts` (private `git` helper, imports, `handleStop`)
- Test: `tests/plugin/cc-adapter.test.ts` (append a new `describe` block)

- [ ] **Step 1: Make the repo helper deterministic**

`makeRepo` in `tests/plugin/cc-adapter.test.ts` calls `git init -q` without naming a branch, so the default branch name varies by git config. Change its args to:

```ts
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir, stdio: "ignore" });
```

No existing test in that file asserts a branch name, so this is safe.

- [ ] **Step 2: Write the failing test**

Append to `tests/plugin/cc-adapter.test.ts`. The file already defines `withTrackerHome`, `makeRepo`, `progressDoc`, and `writeProgress`; reuse them. Add `parseFrontmatter` to the imports:

```ts
import { parseFrontmatter } from "../../src/mcp/markdown.js";

async function commitAll(dir: string, message: string): Promise<string> {
  execFileSync("git", ["add", "."], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["commit", "-q", "-m", message], { cwd: dir, stdio: "ignore" });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).trim();
}

describe("cc-adapter checkpoint stamping", () => {
  it("stamps checkpoint fields when Progress.md was updated this session", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      const file = await writeProgress(dir, progressDoc({ project: "Stamp" }));
      const sha = await commitAll(dir, "init");

      // Dirty the tree so the meaningful-work predicate passes.
      await fs.writeFile(path.join(dir, "src.txt"), "work", "utf-8");

      const sessionId = `s-stamp-${Date.now()}`;
      await handleSessionStart({ cwd: dir, session_id: sessionId });

      // Touch Progress.md after session start so freshness sees it as fresh.
      const current = await fs.readFile(file, "utf-8");
      await fs.writeFile(file, `${current}\n<!-- edited -->\n`, "utf-8");

      const result = await handleStop({ cwd: dir, session_id: sessionId });

      expect(result.code).toBe(0);
      const frontmatter = parseFrontmatter(await fs.readFile(file, "utf-8"));
      expect(frontmatter.base_commit).toBe(sha);
      expect(frontmatter.base_branch).toBe("main");
      expect(frontmatter.worktree_dirty).toBe(true);
      expect(String(frontmatter.checkpoint_at)).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
      );
    });
  });

  it("does not stamp when Progress.md is stale", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      const file = await writeProgress(dir, progressDoc({ project: "NoStamp" }));
      await commitAll(dir, "init");
      await fs.writeFile(path.join(dir, "src.txt"), "work", "utf-8");

      const sessionId = `s-nostamp-${Date.now()}`;
      await handleSessionStart({ cwd: dir, session_id: sessionId });

      await handleStop({ cwd: dir, session_id: sessionId });

      const frontmatter = parseFrontmatter(await fs.readFile(file, "utf-8"));
      expect(frontmatter.base_commit).toBeUndefined();
    });
  });

  it("does not fail a stop outside a git repository", async () => {
    await withTrackerHome(async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-nogit-stop-"));
      await writeProgress(dir, progressDoc({ project: "NoRepo" }));

      const result = await handleStop({ cwd: dir, session_id: `s-norepo-${Date.now()}` });

      expect(result.code).toBe(0);
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/plugin/cc-adapter.test.ts -t "stamps checkpoint fields"`

Expected: FAIL — `frontmatter.base_commit` is `undefined`.

- [ ] **Step 4: Write minimal implementation**

In `src/hook/cc-adapter.ts`, delete the private `git` helper declared just above `gitHasChanges`:

```ts
function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}
```

Add to the imports at the top of the file:

```ts
import {
  defaultGitRunner as git,
  readCheckpoint,
  renderDrift,
  renderGates,
  resolveDrift
} from "./checkpoint.js";
import { replaceFrontmatterValue } from "../mcp/writer.js";
```

If `execFileSync` is now unused in the file, remove it from the `node:child_process` import.

Add this helper next to the other `bestEffort*` functions:

```ts
async function bestEffortStampCheckpoint(cwd: string, progressPath: string): Promise<void> {
  try {
    const fields = readCheckpoint(cwd, new Date());
    if (!fields) return;

    const markdown = await fs.readFile(progressPath, "utf-8");
    let updated = replaceFrontmatterValue(markdown, "base_commit", fields.base_commit);
    updated = replaceFrontmatterValue(updated, "base_branch", fields.base_branch);
    updated = replaceFrontmatterValue(updated, "worktree_dirty", String(fields.worktree_dirty));
    updated = replaceFrontmatterValue(updated, "checkpoint_at", fields.checkpoint_at);

    await fs.writeFile(progressPath, updated, "utf-8");
  } catch {
    // Best effort only: a stamping failure must never fail a session.
  }
}
```

In `handleStop`, immediately after the `if (stale) { warnings.push(...) }` block and before the secret-scanning `try`, insert:

```ts
  if (!stale) {
    // Only stamp when the agent actually updated Progress.md this session.
    // Stamping an unchanged file would assert a verification that never happened.
    await bestEffortStampCheckpoint(cwd, progressPath);
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/plugin/cc-adapter.test.ts`

Expected: PASS, including the three new tests and every pre-existing one.

- [ ] **Step 6: Commit**

```bash
git add src/hook/cc-adapter.ts tests/plugin/cc-adapter.test.ts
git commit -m "feat: stamp checkpoint fields from the Stop hook"
```

---

## Task 6: Report drift and gates at session start

**Files:**
- Modify: `src/hook/cc-adapter.ts` (`handleSessionStart`)
- Test: `tests/plugin/cc-adapter.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/plugin/cc-adapter.test.ts`:

```ts
describe("cc-adapter session-start drift", () => {
  it("reports commits behind and changed files", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      await writeProgress(dir, progressDoc({ project: "Drift" }));
      const base = await commitAll(dir, "init");

      await fs.writeFile(path.join(dir, "src.txt"), "one", "utf-8");
      await commitAll(dir, "one");
      await fs.writeFile(path.join(dir, "other.txt"), "two", "utf-8");
      await commitAll(dir, "two");

      await writeProgress(dir, progressDoc({ project: "Drift", base_commit: base }));

      const result = await handleSessionStart({ cwd: dir, session_id: `s-drift-${Date.now()}` });

      const context = JSON.parse(result.stdout!).hookSpecificOutput.additionalContext;
      expect(context).toContain("Checkpoint drift");
      expect(context).toContain("2 commits behind");
      expect(context).toContain("src.txt");
    });
  });

  it("stays silent when the checkpoint is HEAD", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      await writeProgress(dir, progressDoc({ project: "NoDrift" }));
      const head = await commitAll(dir, "init");
      await writeProgress(dir, progressDoc({ project: "NoDrift", base_commit: head }));

      const result = await handleSessionStart({ cwd: dir, session_id: `s-nodrift-${Date.now()}` });

      const context = JSON.parse(result.stdout!).hookSpecificOutput.additionalContext;
      expect(context).not.toContain("Checkpoint drift");
    });
  });

  it("stays silent when there is no base_commit", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      await writeProgress(dir, progressDoc({ project: "NoBase" }));
      await commitAll(dir, "init");

      const result = await handleSessionStart({ cwd: dir, session_id: `s-nobase-${Date.now()}` });

      const context = JSON.parse(result.stdout!).hookSpecificOutput.additionalContext;
      expect(context).not.toContain("Checkpoint drift");
    });
  });

  it("reports gates that are not done", async () => {
    await withTrackerHome(async () => {
      const dir = await makeRepo();
      await writeProgress(
        dir,
        progressDoc({ project: "Gates", gate_implementation: "done", gate_tests: "failing" })
      );
      await commitAll(dir, "init");

      const result = await handleSessionStart({ cwd: dir, session_id: `s-gates-${Date.now()}` });

      const context = JSON.parse(result.stdout!).hookSpecificOutput.additionalContext;
      expect(context).toContain("Gates at checkpoint: tests=failing");
      expect(context).not.toContain("implementation=");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/plugin/cc-adapter.test.ts -t "reports commits behind"`

Expected: FAIL — context does not contain "Checkpoint drift".

- [ ] **Step 3: Write minimal implementation**

In `handleSessionStart`, after the existing `if (blockers && ...) { lines.push(...) }` block and before the `return`, insert:

```ts
  const baseCommit = typeof frontmatter.base_commit === "string" ? frontmatter.base_commit : "";
  if (baseCommit) {
    const status = resolveDrift(cwd, baseCommit);
    if (status) {
      const drift = renderDrift(status, baseCommit);
      if (drift) lines.push(`\n${boundedContext(drift, 400)}`);
    }
  }

  const gates = renderGates(frontmatter);
  if (gates) lines.push(`\n${gates}`);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/plugin/cc-adapter.test.ts`

Expected: PASS.

Run: `npm test`

Expected: PASS, full suite.

- [ ] **Step 5: Commit**

```bash
git add src/hook/cc-adapter.ts tests/plugin/cc-adapter.test.ts
git commit -m "feat: inject checkpoint drift and gate status into resume context"
```

---

## Task 7: `set_project_gates` MCP tool

**Files:**
- Modify: `src/mcp/server.ts` (`toolDefinitions`, new tool registration after `mark_project_status`)
- Test: `tests/mcp/server.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/mcp/server.test.ts`, adding `gateFrontmatterUpdates` and `toolDefinitions` to the existing import from `../../src/mcp/server.js`:

```ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mcp/server.test.ts`

Expected: FAIL with "does not provide an export named 'gateFrontmatterUpdates'".

- [ ] **Step 3: Write minimal implementation**

In `src/mcp/server.ts`, add to the imports:

```ts
import { ALLOWED_GATE_VALUES } from "../hook/schema.js";
```

Add near the other schema constants, after `lastMilestoneSchema`:

```ts
const GATE_FIELDS = ["implementation", "tests", "review", "deploy"] as const;

export const gateValueSchema = z.enum(ALLOWED_GATE_VALUES);

export type GateInput = Partial<Record<(typeof GATE_FIELDS)[number], string>>;

// Emits [frontmatterKey, value] pairs for supplied gates only, in a fixed
// order so writes are deterministic regardless of argument order.
export function gateFrontmatterUpdates(gates: GateInput): Array<[string, string]> {
  const updates: Array<[string, string]> = [];
  for (const field of GATE_FIELDS) {
    const value = gates[field];
    if (value === undefined) continue;
    updates.push([`gate_${field}`, value]);
  }
  return updates;
}
```

Add `{ name: "set_project_gates" }` to the `toolDefinitions` array.

Register the tool immediately after the `mark_project_status` registration and before `return server;`:

```ts
  server.registerTool(
    "set_project_gates",
    {
      description:
        "Set verification gates (implementation, tests, review, deploy) in a project's Progress.md frontmatter. Only supplied gates are written.",
      inputSchema: {
        project: projectSelectorSchema,
        implementation: gateValueSchema.optional(),
        tests: gateValueSchema.optional(),
        review: gateValueSchema.optional(),
        deploy: gateValueSchema.optional()
      }
    },
    async ({ project, implementation, tests, review, deploy }) => {
      const updates = gateFrontmatterUpdates({ implementation, tests, review, deploy });
      if (updates.length === 0) {
        return textResult(JSON.stringify({ error: "at least one gate must be supplied" }));
      }

      const resolution = await resolveProject(project);
      if (resolution.error) return textResult(JSON.stringify({ error: resolution.error }));
      const match = resolution.project!;

      const fileState = await fs.stat(match.progressPath);
      const markdown = await fs.readFile(match.progressPath, "utf-8");

      let updated = markdown;
      for (const [key, value] of updates) {
        updated = replaceFrontmatterValue(updated, key, value);
      }

      await writeFileAtomic(match.progressPath, updated, fileState.mtimeMs);

      return textResult(
        JSON.stringify({
          updated: true,
          project,
          gates: Object.fromEntries(updates),
          progressPath: match.progressPath
        })
      );
    }
  );
```

Gates are not part of `ProjectSummary`, so this tool deliberately does not call `upsertIndexedProject`: the index carries no gate fields to refresh.

This handler is written against the current `writeFileAtomic(path, content, expectedMtimeMs)` signature. The concurrency plan (`2026-08-19-concurrency-hardening.md`, Task 3) replaces that signature with a content hash and wraps this same call site in conflict handling. Write it as shown here; do not pre-empt that change.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/mcp/server.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/server.ts tests/mcp/server.test.ts
git commit -m "feat: add set_project_gates MCP tool"
```

---

## Task 8: Template, skill, and ADR

**Files:**
- Modify: `templates/project-progress/Progress.md`
- Modify: `skills/project-progress/SKILL.md`
- Create: `docs/adr/0018-checkpoint-validation-and-gates.md`

- [ ] **Step 1: Check whether any test pins the template body**

Run: `grep -rn "templates/project-progress" tests/ src/`

Expected: a list of readers. If any test asserts exact template content, update that assertion as part of this task.

- [ ] **Step 2: Document the optional keys in the template**

Add to `templates/project-progress/Progress.md`, immediately before `## Resume Instructions`:

```markdown
## Verification

Gates are set with the `set_project_gates` tool, not edited by hand. Each of
`implementation`, `tests`, `review`, and `deploy` takes one of `not-started`,
`in-progress`, `done`, `failing`, or `blocked`. An unset gate means unknown.

Checkpoint fields (`base_commit`, `base_branch`, `worktree_dirty`,
`checkpoint_at`) are stamped automatically when a session ends with this file
updated. Do not edit them by hand.
```

Do **not** add `Verification` to `ALLOWED_PROGRESS_SECTIONS` in `src/mcp/writer.ts`. Leaving it out is what prevents `update_project_progress` from overwriting this guidance.

- [ ] **Step 3: Update the skill**

Add to `skills/project-progress/SKILL.md`, in the guidance on updating progress:

```markdown
Set verification gates with `set_project_gates` whenever you learn something
about the project's state: after running the test suite, after a review, after
a deploy. Gates are how a resuming session learns that implementation was
finished but tests were failing, which prose reliably loses.

If resume context reports checkpoint drift, verify the recorded Next Action
against the listed changed files before acting on it.
```

- [ ] **Step 4: Write the ADR**

Create `docs/adr/0018-checkpoint-validation-and-gates.md`:

```markdown
# ADR 0018: Checkpoint validation and verification gates

## Status

Accepted.

## Context

`Progress.md` recorded only an `updated` date. Nothing tied its prose to a
commit, so a session resuming after intervening commits could not tell whether
the recorded `Next Action` had already been done. Separately, "implementation
done" said nothing about whether tests passed or a review happened, so resume
prose routinely lost verification state.

## Decision

Add eight optional frontmatter keys: `base_commit`, `base_branch`,
`worktree_dirty`, `checkpoint_at`, and four `gate_*` keys over a fixed
five-value vocabulary. All are optional, so existing files stay valid without
migration.

Checkpoint fields are stamped by the Stop hook, and only when its freshness
check confirms the agent updated `Progress.md` this session. Gates are written
explicitly by the agent through a new `set_project_gates` MCP tool; the tracker
never infers them and never runs a test suite.

SessionStart resolves the stored checkpoint against the repository and injects
a bounded drift block covering four live cases: ancestor, diverged, missing,
and no drift. It never blocks, because drift after a pull is normal.

## Consequences

Resume context gains up to roughly 400 characters when a checkpoint is stale,
and one line when a gate is not `done`. Projects that never adopt gates see no
change.

The Stop hook now writes to `Progress.md`, which it previously never did. The
write is best-effort and wrapped, preserving the adapter's rule that a hook
failure never breaks a session.

Gate values are agent-asserted, so they are only as honest as the agent that
set them. This is accepted: inferring test state by running suites from a hook
is far more invasive and still wrong for projects whose tests the tracker
cannot run.
```

- [ ] **Step 5: Verify and commit**

Run: `npm test && npm run typecheck && npm run build`

Expected: all three pass.

```bash
git add templates/project-progress/Progress.md skills/project-progress/SKILL.md docs/adr/0018-checkpoint-validation-and-gates.md
git commit -m "docs: document checkpoint fields and verification gates"
```

---

## Self-Review Notes

Spec coverage, section by section:

- eight optional frontmatter keys — Task 1
- fixed gate vocabulary, validated only when present — Task 1
- full-SHA storage, short display — Task 1 (validation), Task 4 (`shortSha`)
- `(detached)` branch handling — Task 2
- stamping only when fresh, skipped outside git, best-effort — Task 5
- `set_project_gates` with partial updates — Task 7
- five drift cases via `merge-base --is-ancestor` and `cat-file -e` — Task 3
- ten-file cap with `(+N more)` — Task 4
- roughly 400 character cap via `boundedContext` — Task 6
- gates line only when a gate is not `done` — Tasks 4 and 6
- `OPTIONAL_FRONTMATTER` as the shared registry — Task 1

Names used consistently across tasks: `readCheckpoint`, `resolveDrift`,
`renderDrift`, `renderGates`, `MAX_DRIFT_FILES`, `GATE_KEYS`,
`ALLOWED_GATE_VALUES`, `OPTIONAL_FRONTMATTER`, `gateFrontmatterUpdates`,
`defaultGitRunner`, `GitRunner`, `CheckpointFields`, `DriftStatus`. The
`diverged` variant uses `onlyOnCheckpoint` and `onlyOnHead` throughout; only
the `ahead` variant carries `commitsBehind`.
