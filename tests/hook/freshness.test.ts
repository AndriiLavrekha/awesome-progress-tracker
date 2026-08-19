import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkFreshness } from "../../src/hook/freshness.js";
import { bodyHash } from "../../src/hash.js";

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

async function writeTempProgress(content: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-fresh-"));
  const file = path.join(dir, "Progress.md");
  await fs.writeFile(file, content, "utf-8");
  return file;
}

const DOC = "---\nproject: Demo\n---\n\n## Next Action\n\nDo the thing.\n";

describe("checkFreshness with a session body hash", () => {
  it("reports stale when only frontmatter changed", async () => {
    const file = await writeTempProgress(DOC);
    const recorded = bodyHash(DOC);

    await fs.writeFile(
      file,
      "---\nproject: Demo\nhandoff: interrupted\n---\n\n## Next Action\n\nDo the thing.\n",
      "utf-8"
    );

    const result = await checkFreshness(file, {
      meaningfulWorkHappened: true,
      sessionStartedAt: new Date(0),
      completionBoundary: true,
      sessionBodyHash: recorded
    });

    expect(result.isFresh).toBe(false);
    expect(result.shouldBlock).toBe(true);
  });

  it("reports fresh when the body changed", async () => {
    const file = await writeTempProgress(DOC);
    const recorded = bodyHash(DOC);

    await fs.writeFile(
      file,
      "---\nproject: Demo\n---\n\n## Next Action\n\nDo something else.\n",
      "utf-8"
    );

    const result = await checkFreshness(file, {
      meaningfulWorkHappened: true,
      sessionStartedAt: new Date(0),
      completionBoundary: true,
      sessionBodyHash: recorded
    });

    expect(result.isFresh).toBe(true);
  });

  it("falls back to mtime when no hash was recorded", async () => {
    const file = await writeTempProgress(DOC);

    const result = await checkFreshness(file, {
      meaningfulWorkHappened: true,
      sessionStartedAt: new Date(0),
      completionBoundary: true
    });

    expect(result.isFresh).toBe(true);
  });

  // Proves the fallback actually compares mtime rather than always returning
  // fresh when no hash is supplied: session start is set after the file's
  // (deliberately aged) mtime, so a correct fallback must report stale.
  it("reports stale via the mtime fallback when no hash was recorded", async () => {
    const file = await writeTempProgress(DOC);
    const old = new Date("2020-01-01T00:00:00Z");
    await fs.utimes(file, old, old);

    const result = await checkFreshness(file, {
      meaningfulWorkHappened: true,
      sessionStartedAt: new Date("2026-01-01T00:00:00Z"),
      completionBoundary: true
    });

    expect(result.isFresh).toBe(false);
    expect(result.shouldWarn).toBe(true);
    expect(result.shouldBlock).toBe(true);
  });

  it("warns without blocking when the body is unchanged outside a completion boundary", async () => {
    const file = await writeTempProgress(DOC);

    const result = await checkFreshness(file, {
      meaningfulWorkHappened: true,
      sessionStartedAt: new Date(0),
      sessionBodyHash: bodyHash(DOC)
    });

    expect(result.isFresh).toBe(false);
    expect(result.shouldWarn).toBe(true);
    expect(result.shouldBlock).toBe(false);
  });

  it("still short-circuits when no meaningful work happened", async () => {
    const file = await writeTempProgress(DOC);

    const result = await checkFreshness(file, {
      meaningfulWorkHappened: false,
      sessionStartedAt: new Date(0),
      sessionBodyHash: bodyHash(DOC)
    });

    expect(result.isFresh).toBe(true);
    expect(result.shouldWarn).toBe(false);
  });
});
