import { promises as fs } from "node:fs";
import { bodyHash } from "../hash.js";
export async function checkFreshness(progressPath, options) {
    const { meaningfulWorkHappened, sessionStartedAt, completionBoundary = false, sessionBodyHash } = options;
    if (!meaningfulWorkHappened) {
        return { isFresh: true, shouldWarn: false, shouldBlock: false, message: "No meaningful work happened." };
    }
    if (sessionBodyHash !== undefined) {
        const markdown = await fs.readFile(progressPath, "utf-8");
        if (bodyHash(markdown) !== sessionBodyHash) {
            return {
                isFresh: true,
                shouldWarn: false,
                shouldBlock: false,
                message: "Progress body changed this session."
            };
        }
        return {
            isFresh: false,
            shouldWarn: true,
            shouldBlock: completionBoundary,
            message: `Progress file is stale: the body of ${progressPath} is unchanged since session start.`
        };
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
