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
