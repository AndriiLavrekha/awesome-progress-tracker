import { execFileSync } from "node:child_process";
export function defaultGitRunner(cwd, args) {
    try {
        return execFileSync("git", args, {
            cwd,
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "ignore"]
        });
    }
    catch {
        return null;
    }
}
function currentBranch(cwd, git) {
    const branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])?.trim();
    return branch && branch !== "HEAD" ? branch : "(detached)";
}
export function readCheckpoint(cwd, now, git = defaultGitRunner) {
    const head = git(cwd, ["rev-parse", "HEAD"])?.trim();
    if (!head)
        return null;
    const status = git(cwd, ["status", "--porcelain"]);
    return {
        base_commit: head,
        base_branch: currentBranch(cwd, git),
        worktree_dirty: status !== null && status.trim().length > 0,
        checkpoint_at: now.toISOString().replace(/\.\d{3}Z$/, "Z")
    };
}
// The file list is deliberately uncapped here: execFileSync's default 1MB
// maxBuffer already bounds it in practice. An enormous diff throws inside
// defaultGitRunner, gets caught there, and degrades to null then [] below.
function diffNames(cwd, git, range) {
    const out = git(cwd, ["diff", "--name-only", range]);
    if (!out)
        return [];
    return out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}
function countCommits(cwd, git, range) {
    const out = git(cwd, ["rev-list", "--count", range])?.trim();
    const count = out === undefined ? NaN : Number(out);
    return Number.isFinite(count) ? count : 0;
}
export function resolveDrift(cwd, baseCommit, git = defaultGitRunner) {
    const head = git(cwd, ["rev-parse", "HEAD"])?.trim();
    if (!head)
        return null;
    if (head === baseCommit)
        return { kind: "none" };
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
    if (raw === null)
        return { kind: "unknown", head, branch };
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
