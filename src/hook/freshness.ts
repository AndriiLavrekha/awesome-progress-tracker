import { promises as fs } from "node:fs";
import { bodyHash } from "../hash.js";

export interface FreshnessResult {
  isFresh: boolean;
  shouldWarn: boolean;
  shouldBlock: boolean;
  message: string;
}

export interface FreshnessOptions {
  meaningfulWorkHappened: boolean;
  sessionStartedAt: Date;
  completionBoundary?: boolean;
  // Hash of the Markdown body as it stood at session start. When present it
  // replaces the mtime comparison entirely, so hook writes that only touch
  // frontmatter cannot satisfy the gate. Absent means the session-state file
  // was unavailable; the mtime comparison is kept as the degraded fallback.
  sessionBodyHash?: string;
}

export async function checkFreshness(
  progressPath: string,
  options: FreshnessOptions
): Promise<FreshnessResult> {
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
    message:
      `Progress file is stale: ${progressPath} was last modified at ${mtime.toISOString()}, ` +
      `before session start ${sessionStartedAt.toISOString()}.`
  };
}
