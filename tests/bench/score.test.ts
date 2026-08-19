import { describe, expect, it } from "vitest";
import { scoreTranscript } from "../../bench/harness/score.js";
import type { Expectations } from "../../bench/harness/scenario.js";
import type { TranscriptEvent } from "../../bench/harness/transcript.js";

const expectations: Expectations = {
  correctNextAction: ["wire foldDoneSection"],
  mustTouch: ["src/mcp/server.ts"],
  mustNotTouch: ["src/mcp/writer.ts"],
  alreadyDone: ["implement foldDoneSection"]
};

function assistant(text: string, tokens: number): TranscriptEvent {
  return { kind: "assistant", text, tokens, name: "", path: "" };
}

function tool(name: string, filePath: string, tokens: number): TranscriptEvent {
  return { kind: "tool", text: "", tokens, name, path: filePath };
}

describe("scoreTranscript", () => {
  it("counts tokens up to and including the first correct action", () => {
    const events = [
      assistant("Reading Progress.md", 100),
      assistant("I will wire foldDoneSection into the server", 60),
      assistant("Done", 40)
    ];

    expect(scoreTranscript(events, expectations).tokensToCorrectNextAction).toBe(160);
  });

  it("matches the correct action case-insensitively", () => {
    const events = [assistant("WIRE FOLDDONESECTION now", 25)];

    expect(scoreTranscript(events, expectations).tokensToCorrectNextAction).toBe(25);
  });

  it("reports null when the correct action never happens", () => {
    const events = [assistant("Refactoring something unrelated", 500)];

    const result = scoreTranscript(events, expectations);

    expect(result.tokensToCorrectNextAction).toBeNull();
    expect(result.reachedCorrectAction).toBe(false);
  });

  it("counts duplicate work", () => {
    const events = [
      assistant("Let me implement foldDoneSection from scratch", 30),
      assistant("Now I will implement foldDoneSection again", 30),
      assistant("wire foldDoneSection", 10)
    ];

    expect(scoreTranscript(events, expectations).duplicateWorkCount).toBe(2);
  });

  it("counts an edit to a mustNotTouch file as a wrong touch", () => {
    const events = [tool("Edit", "src/mcp/writer.ts", 20), assistant("wire foldDoneSection", 5)];

    expect(scoreTranscript(events, expectations).wrongFileTouches).toBe(1);
  });

  it("counts an edit outside mustTouch as a wrong touch", () => {
    const events = [tool("Edit", "src/unrelated.ts", 20), assistant("wire foldDoneSection", 5)];

    expect(scoreTranscript(events, expectations).wrongFileTouches).toBe(1);
  });

  it("does not count an edit inside mustTouch", () => {
    const events = [tool("Edit", "src/mcp/server.ts", 20), assistant("wire foldDoneSection", 5)];

    expect(scoreTranscript(events, expectations).wrongFileTouches).toBe(0);
  });

  it("does not count reads as touches", () => {
    const events = [tool("Read", "src/mcp/writer.ts", 20), assistant("wire foldDoneSection", 5)];

    expect(scoreTranscript(events, expectations).wrongFileTouches).toBe(0);
  });

  it("treats every edit as allowed when mustTouch is empty", () => {
    const permissive: Expectations = { ...expectations, mustTouch: [], mustNotTouch: [] };
    const events = [tool("Edit", "anything.ts", 20), assistant("wire foldDoneSection", 5)];

    expect(scoreTranscript(events, permissive).wrongFileTouches).toBe(0);
  });

  it("reports totals for an empty transcript", () => {
    expect(scoreTranscript([], expectations)).toEqual({
      tokensToCorrectNextAction: null,
      reachedCorrectAction: false,
      duplicateWorkCount: 0,
      wrongFileTouches: 0,
      totalTokens: 0
    });
  });
});
