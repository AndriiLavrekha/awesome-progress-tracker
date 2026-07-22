import { describe, expect, it, vi } from "vitest";
import { main, parseSessionDatetime } from "../../src/hook/cli.js";

function captureStreams() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    stdout.push(String(chunk));
    return true;
  });
  const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderr.push(String(chunk));
    return true;
  });
  return {
    stdout,
    stderr,
    restore() {
      outSpy.mockRestore();
      errSpy.mockRestore();
    }
  };
}

describe("hook cli main", () => {
  it("reports an invalid --session-started-at on stderr and exits 1", async () => {
    const streams = captureStreams();
    const code = await main([
      "--project-root",
      "tests/fixtures/valid-project",
      "--session-started-at",
      "not-a-date",
      "--meaningful-work"
    ]);
    streams.restore();

    expect(code).toBe(1);
    expect(streams.stderr.join("")).toContain("Invalid --session-started-at");
    expect(streams.stderr.join("")).not.toContain("at Object.");
  });

  it("reports an invalid date before a missing progress file", async () => {
    const streams = captureStreams();
    const code = await main([
      "--project-root",
      "tests/fixtures/does-not-exist",
      "--session-started-at",
      "not-a-date",
      "--completion-boundary"
    ]);
    streams.restore();

    expect(code).toBe(1);
    expect(streams.stderr.join("")).toContain("Invalid --session-started-at");
    expect(streams.stdout.join("")).not.toContain("Missing progress file");
  });

  it("blocks on a missing progress file at a completion boundary", async () => {
    const streams = captureStreams();
    const code = await main([
      "--project-root",
      "tests/fixtures/does-not-exist",
      "--session-started-at",
      "2026-07-01T00:00:00+00:00",
      "--completion-boundary"
    ]);
    streams.restore();

    expect(code).toBe(1);
    expect(streams.stdout.join("")).toContain("Missing progress file");
  });

  it("passes a missing progress file outside a completion boundary", async () => {
    const streams = captureStreams();
    const code = await main([
      "--project-root",
      "tests/fixtures/does-not-exist",
      "--session-started-at",
      "2026-07-01T00:00:00+00:00"
    ]);
    streams.restore();

    expect(code).toBe(0);
  });

  it("passes a valid, fresh project at a completion boundary", async () => {
    const streams = captureStreams();
    const code = await main([
      "--project-root",
      "tests/fixtures/valid-project",
      "--session-started-at",
      "2026-01-01T00:00:00+00:00",
      "--meaningful-work",
      "--completion-boundary"
    ]);
    streams.restore();

    expect(code).toBe(0);
  });

  it("requires --session-started-at", async () => {
    const streams = captureStreams();
    const code = await main(["--project-root", "tests/fixtures/valid-project"]);
    streams.restore();

    expect(code).toBe(2);
    expect(streams.stderr.join("")).toContain("Missing required argument");
  });
});

describe("parseSessionDatetime", () => {
  it("treats naive datetimes as UTC", () => {
    expect(parseSessionDatetime("2026-06-28T00:00:00").toISOString()).toBe("2026-06-28T00:00:00.000Z");
  });

  it("treats bare dates as UTC midnight", () => {
    expect(parseSessionDatetime("2026-06-28").toISOString()).toBe("2026-06-28T00:00:00.000Z");
  });

  it("honors explicit offsets", () => {
    expect(parseSessionDatetime("2026-06-28T02:00:00+02:00").toISOString()).toBe("2026-06-28T00:00:00.000Z");
  });

  it("rejects non-datetime strings", () => {
    expect(() => parseSessionDatetime("not-a-date")).toThrow();
  });
});
