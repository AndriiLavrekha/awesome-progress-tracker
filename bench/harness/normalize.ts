import type { TranscriptEvent } from "./transcript.js";

interface Usage {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  output_tokens?: number;
}

// Billed tokens for one assistant step: what the step actually cost to produce.
// Cache reads are excluded. They are dominated by the unchanged system prompt
// being re-read every turn, which says nothing about how well the agent
// resumed, and counting them would make a long session look expensive no
// matter how directly it reached the answer.
function billedTokens(usage: Usage | undefined): number {
  if (!usage) return 0;
  return (
    (usage.input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.output_tokens ?? 0)
  );
}

function toolPath(input: Record<string, unknown> | undefined): string {
  if (!input) return "";
  const value = input.file_path ?? input.path ?? input.notebook_path;
  return typeof value === "string" ? value.replace(/\\/g, "/") : "";
}

// Converts a Claude Code session transcript into the harness's normalized
// event stream. Nothing else produces that stream, so without this the scorer
// can only be fed a hand-written file, and a hand-written file cannot carry
// real token counts.
//
// Thinking blocks are counted but never emitted: their tokens are part of what
// the step cost, while their content is not an action the agent took and must
// not satisfy a correctNextAction matcher.
//
// Sidechain records are dropped. They belong to subagents, which run their own
// budget and would otherwise be scored as if the main agent had said it.
export function normalizeSession(jsonl: string): TranscriptEvent[] {
  const events: TranscriptEvent[] = [];

  for (const line of jsonl.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    let record: Record<string, unknown>;
    try {
      record = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      // A session file is an append-only log that can end mid-write, and
      // unrelated record types come and go across versions. Skipping a line we
      // cannot read is right here, unlike in parseTranscript, where the input
      // is the graded artifact itself.
      continue;
    }

    if (record.type !== "assistant" || record.isSidechain === true) continue;

    const message = record.message as { content?: unknown; usage?: Usage } | undefined;
    const content = Array.isArray(message?.content) ? (message.content as Record<string, unknown>[]) : [];

    let remaining = billedTokens(message?.usage);
    for (const block of content) {
      const emit = (event: TranscriptEvent): void => {
        events.push({ ...event, tokens: remaining });
        remaining = 0;
      };

      if (block.type === "text" && typeof block.text === "string") {
        emit({ kind: "assistant", text: block.text, tokens: 0, name: "", path: "" });
      } else if (block.type === "tool_use" && typeof block.name === "string") {
        emit({
          kind: "tool",
          text: "",
          tokens: 0,
          name: block.name,
          path: toolPath(block.input as Record<string, unknown> | undefined)
        });
      }
    }
  }

  return events;
}
