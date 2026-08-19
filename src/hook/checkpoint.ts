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
  | { kind: "missing"; head: string; branch: string }
  | { kind: "behind"; onlyOnCheckpoint: number; head: string; branch: string; files: string[] }
  | { kind: "unknown"; head: string; branch: string };

// The file list is deliberately uncapped here: execFileSync's default 1MB
// maxBuffer already bounds it in practice. An enormous diff throws inside
// defaultGitRunner, gets caught there, and degrades to null then [] below.
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
  const baseIsAncestor = git(cwd, ["merge-base", "--is-ancestor", baseCommit, head]) !== null;

  if (baseIsAncestor) {
    return {
      kind: "ahead",
      commitsBehind: countCommits(cwd, git, `${baseCommit}..${head}`),
      head,
      branch,
      files: diffNames(cwd, git, `${baseCommit}..${head}`)
    };
  }

  const headIsAncestor = git(cwd, ["merge-base", "--is-ancestor", head, baseCommit]) !== null;

  if (headIsAncestor) {
    return {
      kind: "behind",
      onlyOnCheckpoint: countCommits(cwd, git, `${head}..${baseCommit}`),
      head,
      branch,
      files: diffNames(cwd, git, `${head}..${baseCommit}`)
    };
  }

  const raw = git(cwd, ["rev-list", "--left-right", "--count", `${baseCommit}...${head}`]);
  if (raw === null) return { kind: "unknown", head, branch };

  const counts = raw.trim().split(/\s+/);
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
    case "behind": {
      const noun = status.onlyOnCheckpoint === 1 ? "commit" : "commits";
      return (
        `Checkpoint drift: HEAD ${shortSha(status.head)} (branch ${status.branch}) is ` +
        `${status.onlyOnCheckpoint} ${noun} behind the stored checkpoint ${base}, so the ` +
        `tree was reset backwards past it.${renderFiles(status.files)}\n${CLOSING}`
      );
    }
    case "unknown":
      return (
        `Checkpoint drift could not be determined: git could not compare stored ` +
        `base_commit ${base} against HEAD ${shortSha(status.head)} (branch ` +
        `${status.branch}). This is expected in a shallow clone. ${CLOSING}`
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
