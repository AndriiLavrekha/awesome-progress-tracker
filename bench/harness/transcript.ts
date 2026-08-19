export interface TranscriptEvent {
  kind: "assistant" | "tool";
  text: string;
  tokens: number;
  name: string;
  path: string;
}

// Tools that change files. Only these count toward wrongFileTouches, because
// an agent legitimately reads far more files than it edits.
export const WRITE_TOOLS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);

export function actionString(event: TranscriptEvent): string {
  return event.kind === "tool" ? `${event.name} ${event.path}`.trim() : event.text;
}

// One normalized JSON object per line. Producing this from a raw agent
// transcript is the runner's job; keeping the harness input normalized is what
// lets a disputed score be recomputed by anyone holding the same file.
export function parseTranscript(jsonl: string): TranscriptEvent[] {
  const events: TranscriptEvent[] = [];
  const lines = jsonl.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.length === 0) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      throw new Error(`transcript line ${index + 1} is not valid JSON`);
    }

    const kind = parsed.kind;
    if (kind !== "assistant" && kind !== "tool") {
      throw new Error(`transcript line ${index + 1} has unknown kind ${JSON.stringify(kind)}`);
    }

    const tokens = typeof parsed.tokens === "number" ? parsed.tokens : 0;

    events.push({
      kind,
      text: typeof parsed.text === "string" ? parsed.text : "",
      tokens,
      name: typeof parsed.name === "string" ? parsed.name : "",
      path: typeof parsed.path === "string" ? parsed.path.replace(/\\/g, "/") : ""
    });
  }

  return events;
}
