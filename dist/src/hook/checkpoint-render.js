import { GATE_KEYS } from "./schema.js";
export const MAX_DRIFT_FILES = 10;
export const MAX_DRIFT_LENGTH = 400;
const MAX_BRANCH_DISPLAY = 40;
const MAX_GATE_VALUE_DISPLAY = 24;
const CLOSING = "Verify Next Action still applies before acting.";
function shortSha(sha) {
    return sha.slice(0, 7);
}
function shortBranch(branch) {
    return branch.length <= MAX_BRANCH_DISPLAY
        ? branch
        : `${branch.slice(0, MAX_BRANCH_DISPLAY - 1)}…`;
}
function shortValue(value, maxLength) {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}
function renderFiles(files, budget) {
    if (files.length === 0)
        return "";
    const header = "\nChanged since checkpoint:\n";
    const lines = [];
    let used = header.length;
    for (const file of files.slice(0, MAX_DRIFT_FILES)) {
        const line = `  ${file}`;
        // Reserve room for a possible "(+N more)" line so the suffix can never
        // be the thing that overflows the budget. Computed from the true
        // "  (+N more)" width rather than assumed, since digits(N) is unbounded
        // in principle even though the 1MB maxBuffer ceiling keeps it small
        // today.
        const reserve = lines.length + 1 < files.length ? `  (+${files.length} more)`.length : 0;
        if (used + line.length + 1 + reserve > budget)
            break;
        lines.push(line);
        used += line.length + 1;
    }
    if (lines.length === 0)
        return "";
    const extra = files.length - lines.length;
    if (extra > 0)
        lines.push(`  (+${extra} more)`);
    return `${header}${lines.join("\n")}`;
}
export function renderDrift(status, baseCommit, maxLength = MAX_DRIFT_LENGTH) {
    const base = shortSha(baseCommit);
    switch (status.kind) {
        case "none":
            return "";
        case "missing":
            return (`Checkpoint drift: stored base_commit ${base} is no longer in this ` +
                `repository's history (squashed, rebased, or garbage collected). HEAD is ` +
                `${shortSha(status.head)} (branch ${shortBranch(status.branch)}). ${CLOSING}`);
        case "ahead": {
            const noun = status.commitsBehind === 1 ? "commit" : "commits";
            const head = `Checkpoint drift: stored base_commit ${base} is ${status.commitsBehind} ` +
                `${noun} behind HEAD ${shortSha(status.head)} (branch ${shortBranch(status.branch)}).`;
            const tail = `\n${CLOSING}`;
            return `${head}${renderFiles(status.files, maxLength - head.length - tail.length)}${tail}`;
        }
        case "diverged": {
            const head = `Checkpoint drift: stored base_commit ${base} has diverged from HEAD ` +
                `${shortSha(status.head)} (branch ${shortBranch(status.branch)}): ` +
                `${status.onlyOnCheckpoint} on the checkpoint side, ${status.onlyOnHead} on HEAD.`;
            const tail = `\n${CLOSING}`;
            return `${head}${renderFiles(status.files, maxLength - head.length - tail.length)}${tail}`;
        }
        case "behind": {
            const noun = status.onlyOnCheckpoint === 1 ? "commit" : "commits";
            const head = `Checkpoint drift: HEAD ${shortSha(status.head)} (branch ${shortBranch(status.branch)}) is ` +
                `${status.onlyOnCheckpoint} ${noun} behind the stored checkpoint ${base}, so the ` +
                `tree was reset backwards past it.`;
            const tail = `\n${CLOSING}`;
            return `${head}${renderFiles(status.files, maxLength - head.length - tail.length)}${tail}`;
        }
        case "unknown":
            return (`Checkpoint drift could not be determined: git could not compare stored ` +
                `base_commit ${base} against HEAD ${shortSha(status.head)} (branch ` +
                `${shortBranch(status.branch)}). This is expected in a shallow clone. ${CLOSING}`);
    }
}
// Reports stored gate values verbatim (capped in length). Vocabulary
// enforcement belongs to validateFrontmatter; a file hand-edited to an odd
// value should surface it rather than hide it.
export function renderGates(frontmatter) {
    const parts = [];
    for (const key of GATE_KEYS) {
        const value = frontmatter[key];
        if (value === undefined || value === "done")
            continue;
        parts.push(`${key.replace(/^gate_/, "")}=${shortValue(String(value), MAX_GATE_VALUE_DISPLAY)}`);
    }
    if (parts.length === 0)
        return "";
    return `Gates at checkpoint: ${parts.join(", ")}`;
}
