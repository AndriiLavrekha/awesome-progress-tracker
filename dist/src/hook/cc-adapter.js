import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { bodyHash, sha256 } from "../hash.js";
import { extractSection, parseFrontmatter } from "../mcp/markdown.js";
import { replaceFrontmatterValue, writeFileAtomic } from "../mcp/writer.js";
import { readProjectTrackingState, setProjectTrackingState } from "../project-state.js";
// defaultGitRunner's implementation lives in checkpoint.ts, not here.
import { defaultGitRunner as git, readCheckpoint, resolveDrift } from "./checkpoint.js";
import { renderDrift, renderGates } from "./checkpoint-render.js";
import { checkFreshness } from "./freshness.js";
import { validateProgressFile } from "./validator.js";
function progressPathFor(cwd) {
    return path.join(cwd, "project-progress", "Progress.md");
}
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
function sessionStateDir() {
    return path.join(os.tmpdir(), "awesome-progress-tracker", "sessions");
}
function sessionStatePath(sessionId) {
    const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, "_");
    return path.join(sessionStateDir(), `${safe}.json`);
}
async function readSessionState(sessionId) {
    if (!sessionId)
        return {};
    try {
        const raw = await fs.readFile(sessionStatePath(sessionId), "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
async function writeSessionState(sessionId, state) {
    await fs.mkdir(sessionStateDir(), { recursive: true });
    await fs.writeFile(sessionStatePath(sessionId), JSON.stringify(state), "utf-8");
}
async function recordSessionStart(sessionId, cwd) {
    if (!sessionId)
        return;
    try {
        await writeSessionState(sessionId, { startedAt: new Date().toISOString(), cwd });
    }
    catch {
        // best effort only
    }
}
async function bestEffortRecordBodyHash(sessionId, markdown) {
    if (!sessionId)
        return;
    try {
        const state = await readSessionState(sessionId);
        await writeSessionState(sessionId, { ...state, bodyHash: bodyHash(markdown) });
    }
    catch {
        // best effort only
    }
}
async function bestEffortSetProjectState(cwd, state) {
    try {
        await setProjectTrackingState(cwd, state);
    }
    catch {
        // best effort only
    }
}
async function bestEffortReadProjectState(cwd) {
    try {
        return (await readProjectTrackingState(cwd)).state;
    }
    catch {
        return "unknown";
    }
}
async function bestEffortMarkHandoff(progressPath, handoff, sessionId) {
    try {
        const markdown = await fs.readFile(progressPath, "utf-8");
        const expectedHash = sha256(markdown);
        let updated = replaceFrontmatterValue(markdown, "handoff", handoff);
        if (sessionId)
            updated = replaceFrontmatterValue(updated, "session_id", sessionId);
        await writeFileAtomic(progressPath, updated, expectedHash);
        return true;
    }
    catch {
        // Best effort only: a handoff write must never fail a session.
        return false;
    }
}
async function bestEffortRecordSessionEnd(cwd, progressPath, now = new Date()) {
    try {
        const markdown = await fs.readFile(progressPath, "utf-8");
        const expectedHash = sha256(markdown);
        let updated = replaceFrontmatterValue(markdown, "handoff", "clean");
        const fields = readCheckpoint(cwd, now);
        if (fields) {
            updated = replaceFrontmatterValue(updated, "base_commit", fields.base_commit);
            updated = replaceFrontmatterValue(updated, "base_branch", fields.base_branch);
            updated = replaceFrontmatterValue(updated, "worktree_dirty", String(fields.worktree_dirty));
            updated = replaceFrontmatterValue(updated, "checkpoint_at", fields.checkpoint_at);
        }
        // writeFileAtomic throws "Progress file changed on disk" when another
        // writer (e.g. an MCP update_project_progress call) raced us and won.
        // That is the correct outcome to swallow: their content is newer and
        // must not be clobbered by our stamp.
        await writeFileAtomic(progressPath, updated, expectedHash);
        return true;
    }
    catch {
        // Best effort only: a recording failure must never fail a session.
        return false;
    }
}
// A porcelain line is "XY path", or "XY orig -> path" for a rename. The two
// status columns are fixed-width, so the path starts at index 2.
//
// Returns a normalized classification KEY for a porcelain line, not a usable
// filesystem path. Git quotes and octal-escapes paths containing non-ASCII or
// special bytes; this deliberately does not unescape them, because the only
// consumer is an ASCII prefix test that is unaffected by escaped tails. Do not
// use this value to open a file.
function porcelainPathKey(line) {
    const rest = line.slice(2).trim();
    const arrow = rest.indexOf(" -> ");
    const target = arrow === -1 ? rest : rest.slice(arrow + 4);
    const unquoted = target.replace(/^"|"$/g, "");
    // Only normalize separators on unquoted paths. A quoted path may contain
    // backslash escape sequences that are not separators.
    return unquoted === target ? unquoted.replace(/\\/g, "/") : unquoted;
}
function isProgressPath(line) {
    const target = porcelainPathKey(line);
    return target.startsWith("project-progress/") || target.includes("/project-progress/");
}
// SessionStart and checkpoint stamping now write Progress.md, so a dirty
// progress folder is no longer evidence that the agent did any work. Only
// changes elsewhere count.
function gitHasChanges(cwd) {
    // --untracked-files=all keeps git from collapsing a wholly-untracked
    // directory to a single "?? dir/" line, which would hide a nested
    // project-progress/ folder inside another untracked directory.
    const out = git(cwd, ["status", "--porcelain", "--untracked-files=all"]);
    if (out === null)
        return false;
    return out
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .some((line) => !isProgressPath(line));
}
function stagedFiles(cwd) {
    const out = git(cwd, ["diff", "--cached", "--name-only"]);
    if (!out)
        return [];
    return out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}
function isCommitCommand(command) {
    // Match `git commit ...` (allow flags/env prefixes), not `git commit-graph` etc.
    return /\bgit\b[\s\S]*\bcommit\b(?![\w-])/.test(command);
}
function emitJson(value) {
    return JSON.stringify(value);
}
function boundedContext(value, maxLength) {
    if (value.length <= maxLength)
        return value;
    return `${value.slice(0, Math.max(0, maxLength - 14))}… [truncated]`;
}
export async function handleSessionStart(event) {
    const cwd = event.cwd ?? process.cwd();
    await recordSessionStart(event.session_id, cwd);
    const progressPath = progressPathFor(cwd);
    if (!(await fileExists(progressPath))) {
        const state = await bestEffortReadProjectState(cwd);
        if (state === "opted-out")
            return { code: 0 };
        const statusLine = state === "opted-in"
            ? "This project previously opted in to Awesome Progress Tracker, but `project-progress/Progress.md` is missing."
            : "This project is not initialized with Awesome Progress Tracker.";
        return {
            code: 0,
            stdout: emitJson({
                hookSpecificOutput: {
                    hookEventName: "SessionStart",
                    additionalContext: [
                        `${statusLine} For multi-step feature, investigation, refactor, debugging, deployment, release, or setup work, ask exactly:`,
                        "\"This project is not initialized with Awesome Progress Tracker. Do you want me to create `project-progress/` here?\"",
                        "Only initialize after the user says yes. If the user says no, record a per-project opt-out with `awesome-progress-tracker state set . --state opted-out`.",
                        "Do not ask for trivial one-off or read-only tasks. Do not create files from hooks. Never write secrets to progress files."
                    ].join("\n")
                }
            })
        };
    }
    await bestEffortSetProjectState(cwd, "initialized");
    const markdown = await fs.readFile(progressPath, "utf-8");
    await bestEffortRecordBodyHash(event.session_id, markdown);
    const frontmatter = parseFrontmatter(markdown);
    const lines = [
        "This project uses Awesome Progress Tracker. `project-progress/Progress.md` is the canonical " +
            "resume source: read it before changing project files, and update Progress.md (Resume Snapshot, " +
            "Next Action, Blockers) before finishing meaningful work.",
        `Project: ${frontmatter.project ?? "(unknown)"} | Status: ${frontmatter.status ?? "?"} | Updated: ${frontmatter.updated ?? "?"}`
    ];
    // Drift is pushed before Resume Snapshot/Next Action/Blockers so the agent
    // is warned that the recorded state may be stale before it absorbs that
    // state, not after.
    const baseCommit = typeof frontmatter.base_commit === "string" ? frontmatter.base_commit : "";
    if (baseCommit) {
        const status = resolveDrift(cwd, baseCommit);
        if (status) {
            // renderDrift is self-bounding to MAX_DRIFT_LENGTH: it trims its own file
            // list to fit and never sheds prose. Do NOT wrap it in boundedContext —
            // that truncates from the end, which would cut the closing instruction
            // and keep the file names, exactly backwards.
            const drift = renderDrift(status, baseCommit);
            if (drift)
                lines.push(`\n${drift}`);
        }
    }
    if (frontmatter.handoff === "interrupted") {
        const previous = frontmatter.session_id ? String(frontmatter.session_id) : "(unknown)";
        lines.push(`\nPrevious session ${previous} ended without a clean handoff. ` +
            "Progress.md may predate uncommitted work in the tree.");
    }
    const resume = extractSection(markdown, "Resume Snapshot");
    const next = extractSection(markdown, "Next Action");
    const blockers = extractSection(markdown, "Blockers");
    if (resume)
        lines.push(`\nResume Snapshot:\n${boundedContext(resume, 800)}`);
    if (next)
        lines.push(`\nNext Action:\n${boundedContext(next, 300)}`);
    if (blockers && blockers.trim() && blockers.trim().toLowerCase() !== "none.") {
        lines.push(`\nBlockers:\n${boundedContext(blockers, 200)}`);
    }
    const gates = renderGates(frontmatter);
    if (gates)
        lines.push(`\n${gates}`);
    await bestEffortMarkHandoff(progressPath, "interrupted", event.session_id);
    return {
        code: 0,
        stdout: emitJson({
            hookSpecificOutput: {
                hookEventName: "SessionStart",
                additionalContext: lines.join("\n")
            }
        })
    };
}
export async function handlePreCommit(event) {
    const cwd = event.cwd ?? process.cwd();
    const command = event.tool_input?.command ?? "";
    if (!isCommitCommand(command))
        return { code: 0 };
    const progressPath = progressPathFor(cwd);
    if (!(await fileExists(progressPath)))
        return { code: 0 };
    const markdown = await fs.readFile(progressPath, "utf-8");
    const frontmatter = parseFrontmatter(markdown);
    const restricted = frontmatter.commit_progress === false || frontmatter.sensitivity === "sensitive";
    if (!restricted)
        return { code: 0 };
    const progressStaged = stagedFiles(cwd).some((file) => file.replace(/\\/g, "/").includes("project-progress/"));
    if (!progressStaged)
        return { code: 0 };
    const why = frontmatter.commit_progress === false ? "commit_progress: false" : "sensitivity: sensitive";
    return {
        code: 0,
        stdout: emitJson({
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: `project-progress files are staged but Progress.md declares ${why}. ` +
                    "Unstage them with `git restore --staged project-progress/` before committing, " +
                    "or change the policy in Progress.md if sharing is intended."
            }
        })
    };
}
export async function handlePreEdit(event) {
    const cwd = event.cwd ?? process.cwd();
    const progressPath = progressPathFor(cwd);
    if (!(await fileExists(progressPath)))
        return { code: 0 };
    const filePath = event.tool_input?.file_path ?? "";
    const normalized = filePath.replace(/\\/g, "/");
    if (normalized.includes("/project-progress/") || normalized.startsWith("project-progress/")) {
        return { code: 0 };
    }
    const state = await readSessionState(event.session_id);
    if (state.editReminderShown)
        return { code: 0 };
    if (event.session_id) {
        await writeSessionState(event.session_id, { ...state, editReminderShown: true });
    }
    return {
        code: 0,
        stdout: emitJson({
            systemMessage: "[project-progress] Before making changes, check `project-progress/Tasks.md` and " +
                "`Open Questions.md` for relevant remaining work, then update Progress.md at meaningful checkpoints."
        })
    };
}
export async function handleStop(event, options = {}) {
    const { allowBlock = true } = options;
    const cwd = event.cwd ?? process.cwd();
    const progressPath = progressPathFor(cwd);
    if (!(await fileExists(progressPath)))
        return { code: 0 };
    // Only nudge when the working tree shows activity, so projects that just read
    // progress (or aren't git repos) are never nagged.
    if (!gitHasChanges(cwd))
        return { code: 0 };
    const warnings = [];
    let stale = true;
    const sessionState = await readSessionState(event.session_id);
    const startedAt = sessionState.startedAt ? Date.parse(sessionState.startedAt) : NaN;
    if (Number.isFinite(startedAt)) {
        try {
            const freshness = await checkFreshness(progressPath, {
                meaningfulWorkHappened: true,
                sessionStartedAt: new Date(startedAt),
                completionBoundary: true,
                sessionBodyHash: sessionState.bodyHash
            });
            stale = !freshness.isFresh;
        }
        catch {
            // keep stale = true
        }
    }
    if (stale) {
        warnings.push("project-progress/Progress.md was not updated this session. If you did meaningful work, " +
            "update Resume Snapshot, Next Action, and Blockers before finishing.");
    }
    if (!stale) {
        // Only stamp when the agent actually updated Progress.md this session.
        // Stamping an unchanged file would assert a verification that never happened.
        const recorded = await bestEffortRecordSessionEnd(cwd, progressPath);
        if (!recorded) {
            warnings.push("Checkpoint and handoff were not recorded; drift detection may be unavailable next session.");
        }
    }
    try {
        const secretErrors = (await validateProgressFile(progressPath)).filter((error) => error.includes("secret-like"));
        if (secretErrors.length > 0) {
            warnings.push(`Progress file may contain secrets (${secretErrors.join("; ")}); remove them.`);
        }
    }
    catch {
        // validation is best effort
    }
    if (warnings.length === 0)
        return { code: 0 };
    const message = `[project-progress] ${warnings.join(" ")}`;
    if (stale && allowBlock) {
        const state = await readSessionState(event.session_id);
        if (!state.stopBlocked) {
            if (event.session_id) {
                await writeSessionState(event.session_id, { ...state, stopBlocked: true });
            }
            // Exit code 2 blocks Claude Code's Stop event and feeds stderr back so
            // the agent keeps working instead of ending its turn. Capped to once
            // per session (via stopBlocked) so a session that truly can't update
            // Progress.md doesn't loop forever.
            return { code: 2, stderr: message };
        }
    }
    // `systemMessage` is the portable output field surfaced to the user by both
    // Claude Code and Codex; keep the "[project-progress]" prefix for grep-ability.
    return { code: 0, stdout: emitJson({ systemMessage: message }) };
}
export async function runHook(sub, event) {
    try {
        switch (sub) {
            case "session-start":
                return await handleSessionStart(event);
            case "pre-commit":
                return await handlePreCommit(event);
            case "pre-edit":
                return await handlePreEdit(event);
            case "stop":
                return await handleStop(event);
            case "stop-soft":
                return await handleStop(event, { allowBlock: false });
            default:
                return { code: 0 };
        }
    }
    catch {
        // Never break a session because of a hook failure.
        return { code: 0 };
    }
}
function readStdin() {
    return new Promise((resolve) => {
        if (process.stdin.isTTY) {
            resolve("");
            return;
        }
        let data = "";
        process.stdin.setEncoding("utf-8");
        process.stdin.on("data", (chunk) => {
            data += chunk;
        });
        process.stdin.on("end", () => resolve(data));
        process.stdin.on("error", () => resolve(data));
    });
}
export async function main(argv) {
    const sub = argv[0] ?? "";
    const raw = await readStdin();
    let event = {};
    if (raw.trim()) {
        try {
            event = JSON.parse(raw);
        }
        catch {
            event = {};
        }
    }
    const result = await runHook(sub, event);
    if (result.stdout)
        process.stdout.write(result.stdout);
    if (result.stderr)
        process.stderr.write(result.stderr);
    return result.code;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main(process.argv.slice(2)).then((code) => process.exit(code), () => process.exit(0));
}
