import { execFileSync } from "node:child_process";

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
