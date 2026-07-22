import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkFreshness } from "../../src/hook/freshness.js";

async function progressFileWithMtime(mtime: Date): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-freshness-"));
  const file = path.join(dir, "Progress.md");
  await fs.writeFile(file, "content", "utf-8");
  await fs.utimes(file, mtime, mtime);
  return file;
}

describe("checkFreshness", () => {
  it("treats no meaningful work as fresh", async () => {
    const file = await progressFileWithMtime(new Date("2026-06-01T00:00:00Z"));
    const result = await checkFreshness(file, {
      meaningfulWorkHappened: false,
      sessionStartedAt: new Date("2026-07-01T00:00:00Z"),
      completionBoundary: true
    });
    expect(result).toMatchObject({ isFresh: true, shouldWarn: false, shouldBlock: false });
  });

  it("treats a file modified after session start as fresh", async () => {
    const file = await progressFileWithMtime(new Date("2026-07-02T00:00:00Z"));
    const result = await checkFreshness(file, {
      meaningfulWorkHappened: true,
      sessionStartedAt: new Date("2026-07-01T00:00:00Z")
    });
    expect(result.isFresh).toBe(true);
    expect(result.shouldWarn).toBe(false);
  });

  it("warns without blocking on stale progress outside a completion boundary", async () => {
    const file = await progressFileWithMtime(new Date("2026-06-01T00:00:00Z"));
    const result = await checkFreshness(file, {
      meaningfulWorkHappened: true,
      sessionStartedAt: new Date("2026-07-01T00:00:00Z")
    });
    expect(result.shouldWarn).toBe(true);
    expect(result.shouldBlock).toBe(false);
    expect(result.message).toContain("stale");
  });

  it("warns and blocks on stale progress at a completion boundary", async () => {
    const file = await progressFileWithMtime(new Date("2026-06-01T00:00:00Z"));
    const result = await checkFreshness(file, {
      meaningfulWorkHappened: true,
      sessionStartedAt: new Date("2026-07-01T00:00:00Z"),
      completionBoundary: true
    });
    expect(result.shouldWarn).toBe(true);
    expect(result.shouldBlock).toBe(true);
  });
});
