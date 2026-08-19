import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadScenario, parseExpectations } from "../../bench/harness/scenario.js";

const VALID = {
  correctNextAction: ["wire foldDoneSection into update_project_progress"],
  mustTouch: ["src/mcp/server.ts"],
  mustNotTouch: ["src/mcp/writer.ts"],
  alreadyDone: ["foldDoneSection is already implemented"]
};

describe("parseExpectations", () => {
  it("accepts a complete expectations file", () => {
    expect(parseExpectations(JSON.stringify(VALID))).toEqual(VALID);
  });

  it("defaults the optional lists to empty", () => {
    const parsed = parseExpectations(JSON.stringify({ correctNextAction: ["do the thing"] }));

    expect(parsed).toEqual({
      correctNextAction: ["do the thing"],
      mustTouch: [],
      mustNotTouch: [],
      alreadyDone: []
    });
  });

  it("rejects a file with no correctNextAction matcher", () => {
    expect(() => parseExpectations(JSON.stringify({ mustTouch: ["a.ts"] }))).toThrow(
      /correctNextAction must be a non-empty array/
    );
  });

  it("rejects a non-string matcher", () => {
    expect(() => parseExpectations(JSON.stringify({ correctNextAction: [42] }))).toThrow(
      /correctNextAction entries must be strings/
    );
  });

  it("rejects an invalid regular expression", () => {
    expect(() => parseExpectations(JSON.stringify({ correctNextAction: ["("] }))).toThrow(
      /is not a valid regular expression/
    );
  });

  it("rejects malformed JSON with a useful message", () => {
    expect(() => parseExpectations("{not json")).toThrow(/could not be parsed as JSON/);
  });
});

describe("loadScenario", () => {
  it("loads a scenario directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bench-scn-"));
    const dir = path.join(root, "01-demo");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "expected.json"), JSON.stringify(VALID), "utf-8");
    await fs.writeFile(path.join(dir, "repo.bundle"), "not-a-real-bundle", "utf-8");

    const scenario = await loadScenario(root, "01-demo");

    expect(scenario.id).toBe("01-demo");
    expect(scenario.bundlePath).toBe(path.join(dir, "repo.bundle"));
    expect(scenario.expectations.mustTouch).toEqual(["src/mcp/server.ts"]);
  });

  it("reports a missing scenario by name", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bench-scn-missing-"));

    await expect(loadScenario(root, "99-nope")).rejects.toThrow(/scenario 99-nope not found/);
  });

  it("reports a scenario with no bundle", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bench-scn-nobundle-"));
    const dir = path.join(root, "02-demo");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "expected.json"), JSON.stringify(VALID), "utf-8");

    await expect(loadScenario(root, "02-demo")).rejects.toThrow(/repo.bundle/);
  });
});
