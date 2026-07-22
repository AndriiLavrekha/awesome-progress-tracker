import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
function defaultHomeDir() {
    return (process.env.AWESOME_PROGRESS_TRACKER_HOME ??
        process.env.PLUGIN_DATA ??
        path.join(os.homedir(), ".awesome-progress-tracker"));
}
export function projectStatePath(options = {}) {
    return path.join(options.homeDir ?? defaultHomeDir(), "project-state.json");
}
export function normalizeProjectPath(projectPath) {
    const normalized = path.resolve(projectPath).replace(/\\/g, "/");
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
function displayProjectPath(projectPath) {
    return path.resolve(projectPath).replace(/\\/g, "/");
}
function unknownEntry(projectPath) {
    return {
        path: displayProjectPath(projectPath),
        state: "unknown",
        updatedAt: ""
    };
}
async function readStateFile(options = {}) {
    const filePath = projectStatePath(options);
    try {
        const raw = await fs.readFile(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.schemaVersion !== 1 || typeof parsed.projects !== "object") {
            throw new Error("invalid project-state file");
        }
        return parsed;
    }
    catch (error) {
        if (error.code !== "ENOENT")
            throw error;
        return { schemaVersion: 1, updatedAt: "", projects: {} };
    }
}
async function writeStateFile(stateFile, options = {}) {
    const filePath = projectStatePath(options);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(stateFile, null, 2)}\n`, "utf-8");
}
export async function readProjectTrackingState(projectPath, options = {}) {
    const stateFile = await readStateFile(options);
    return stateFile.projects[normalizeProjectPath(projectPath)] ?? unknownEntry(projectPath);
}
export async function listProjectTrackingStates(options = {}) {
    const stateFile = await readStateFile(options);
    return Object.values(stateFile.projects).sort((left, right) => left.path.localeCompare(right.path));
}
export async function setProjectTrackingState(projectPath, state, options = {}) {
    const stateFile = await readStateFile(options);
    const normalized = normalizeProjectPath(projectPath);
    const updatedAt = (options.now ?? new Date()).toISOString();
    stateFile.updatedAt = updatedAt;
    if (state === "unknown") {
        delete stateFile.projects[normalized];
        await writeStateFile(stateFile, options);
        return unknownEntry(projectPath);
    }
    const entry = {
        path: displayProjectPath(projectPath),
        state,
        updatedAt
    };
    stateFile.projects[normalized] = entry;
    await writeStateFile(stateFile, options);
    return entry;
}
export async function resetProjectTrackingState(projectPath, options = {}) {
    const stateFile = await readStateFile(options);
    const normalized = normalizeProjectPath(projectPath);
    const existed = normalized in stateFile.projects;
    delete stateFile.projects[normalized];
    stateFile.updatedAt = (options.now ?? new Date()).toISOString();
    await writeStateFile(stateFile, options);
    return existed;
}
