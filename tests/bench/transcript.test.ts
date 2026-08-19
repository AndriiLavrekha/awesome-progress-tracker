import { describe, expect, it } from "vitest";
import { WRITE_TOOLS, actionString, parseTranscript } from "../../bench/harness/transcript.js";

describe("parseTranscript", () => {
  it("parses assistant and tool events", () => {
    const jsonl = [
      JSON.stringify({ kind: "assistant", text: "Reading Progress.md", tokens: 100 }),
      JSON.stringify({ kind: "tool", name: "Edit", path: "src/a.ts", tokens: 50 })
    ].join("\n");

    expect(parseTranscript(jsonl)).toEqual([
      { kind: "assistant", text: "Reading Progress.md", tokens: 100, name: "", path: "" },
      { kind: "tool", text: "", tokens: 50, name: "Edit", path: "src/a.ts" }
    ]);
  });

  it("ignores blank lines", () => {
    const jsonl = `\n${JSON.stringify({ kind: "assistant", text: "hi", tokens: 1 })}\n\n`;
    expect(parseTranscript(jsonl)).toHaveLength(1);
  });

  it("defaults missing tokens to zero", () => {
    const jsonl = JSON.stringify({ kind: "assistant", text: "hi" });
    expect(parseTranscript(jsonl)[0].tokens).toBe(0);
  });

  it("fails loudly on an unparseable line rather than scoring zero", () => {
    const jsonl = [JSON.stringify({ kind: "assistant", text: "ok", tokens: 1 }), "{not json"].join("\n");

    expect(() => parseTranscript(jsonl)).toThrow(/line 2 is not valid JSON/);
  });

  it("fails loudly on an unknown event kind", () => {
    const jsonl = JSON.stringify({ kind: "thinking", text: "hm", tokens: 1 });

    expect(() => parseTranscript(jsonl)).toThrow(/line 1 has unknown kind "thinking"/);
  });

  it("normalizes backslash paths", () => {
    const jsonl = JSON.stringify({ kind: "tool", name: "Edit", path: "src\\a.ts", tokens: 1 });
    expect(parseTranscript(jsonl)[0].path).toBe("src/a.ts");
  });
});

describe("actionString", () => {
  it("uses the text for assistant events", () => {
    expect(actionString({ kind: "assistant", text: "do it", tokens: 0, name: "", path: "" })).toBe(
      "do it"
    );
  });

  it("combines name and path for tool events", () => {
    expect(actionString({ kind: "tool", text: "", tokens: 0, name: "Edit", path: "src/a.ts" })).toBe(
      "Edit src/a.ts"
    );
  });
});

describe("WRITE_TOOLS", () => {
  it("covers the mutating tools", () => {
    expect(WRITE_TOOLS.has("Edit")).toBe(true);
    expect(WRITE_TOOLS.has("Write")).toBe(true);
    expect(WRITE_TOOLS.has("Read")).toBe(false);
  });
});
