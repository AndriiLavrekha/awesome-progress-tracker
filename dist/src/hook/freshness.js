import { promises as fs } from "node:fs";
export async function checkFreshness(progressPath, options) {
    const { meaningfulWorkHappened, sessionStartedAt, completionBoundary = false } = options;
    if (!meaningfulWorkHappened) {
        return { isFresh: true, shouldWarn: false, shouldBlock: false, message: "No meaningful work happened." };
    }
    const stats = await fs.stat(progressPath);
    const mtime = new Date(stats.mtimeMs);
    if (mtime.getTime() >= sessionStartedAt.getTime()) {
        return { isFresh: true, shouldWarn: false, shouldBlock: false, message: "Progress file is fresh." };
    }
    return {
        isFresh: false,
        shouldWarn: true,
        shouldBlock: completionBoundary,
        message: `Progress file is stale: ${progressPath} was last modified at ${mtime.toISOString()}, ` +
            `before session start ${sessionStartedAt.toISOString()}.`
    };
}
