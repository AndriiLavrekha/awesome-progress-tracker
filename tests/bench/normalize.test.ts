import { describe, expect, it } from "vitest";
import { normalizeSession } from "../../bench/harness/normalize.js";

function assistantLine(content: unknown[], outputTokens: number, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "assistant",
    message: {
      content,
      usage: { input_tokens: 2, cache_creation_input_tokens: 8, cache_read_input_tokens: 9999, output_tokens: outputTokens }
    },
    ...extra
  });
}

describe("normalizeSession", () => {
  it("emits an assistant event carrying the message's billed tokens", () => {
    const jsonl = assistantLine([{ type: "text", text: "I will wire it up" }], 30);

    expect(normalizeSession(jsonl)).toEqual([
      { kind: "assistant", text: "I will wire it up", tokens: 40, name: "", path: "" }
    ]);
  });

  it("excludes cache reads from the billed total", () => {
    const jsonl = assistantLine([{ type: "text", text: "hi" }], 0);

    expect(normalizeSession(jsonl)[0].tokens).toBe(10);
  });

  it("emits a tool event with the edited file path", () => {
    const jsonl = assistantLine(
      [{ type: "tool_use", name: "Edit", input: { file_path: "D:/tmp/src/server.ts" } }],
      5
    );

    expect(normalizeSession(jsonl)[0]).toMatchObject({
      kind: "tool",
      name: "Edit",
      path: "D:/tmp/src/server.ts"
    });
  });

  it("reads a tool path from either file_path or path", () => {
    const jsonl = assistantLine([{ type: "tool_use", name: "Read", input: { path: "a.ts" } }], 5);

    expect(normalizeSession(jsonl)[0].path).toBe("a.ts");
  });

  it("charges a message's tokens once when it produces several events", () => {
    const jsonl = assistantLine(
      [
        { type: "text", text: "wiring it" },
        { type: "tool_use", name: "Edit", input: { file_path: "src/server.ts" } }
      ],
      30
    );

    const events = normalizeSession(jsonl);

    expect(events.map((event) => event.tokens)).toEqual([40, 0]);
  });

  it("counts thinking tokens without exposing thinking as an action", () => {
    const jsonl = assistantLine(
      [
        { type: "thinking", thinking: "the answer is to wire foldDoneSection" },
        { type: "text", text: "Reading the code" }
      ],
      30
    );

    const events = normalizeSession(jsonl);

    expect(events).toHaveLength(1);
    expect(events[0].text).toBe("Reading the code");
    expect(events[0].tokens).toBe(40);
  });

  it("ignores non-assistant records and sidechain agents", () => {
    const jsonl = [
      JSON.stringify({ type: "user", message: { content: "go" } }),
      JSON.stringify({ type: "mode", mode: "normal" }),
      assistantLine([{ type: "text", text: "subagent work" }], 10, { isSidechain: true }),
      assistantLine([{ type: "text", text: "main work" }], 10)
    ].join("\n");

    expect(normalizeSession(jsonl)).toHaveLength(1);
    expect(normalizeSession(jsonl)[0].text).toBe("main work");
  });

  it("skips an unparseable line rather than abandoning the run", () => {
    const jsonl = ["{partial", assistantLine([{ type: "text", text: "ok" }], 10)].join("\n");

    expect(normalizeSession(jsonl)).toHaveLength(1);
  });

  it("drops a message that produced no text or tool use", () => {
    expect(normalizeSession(assistantLine([{ type: "thinking", thinking: "hm" }], 10))).toEqual([]);
  });
});
