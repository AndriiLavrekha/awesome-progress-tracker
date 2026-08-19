import type { Expectations } from "./scenario.js";
import { WRITE_TOOLS, actionString, type TranscriptEvent } from "./transcript.js";

export interface Score {
  // Cumulative tokens through the first event matching correctNextAction, or
  // null when the agent never got there.
  tokensToCorrectNextAction: number | null;
  reachedCorrectAction: boolean;
  duplicateWorkCount: number;
  wrongFileTouches: number;
  totalTokens: number;
}

function matchesAny(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => new RegExp(pattern, "i").test(value));
}

export function scoreTranscript(events: TranscriptEvent[], expectations: Expectations): Score {
  let running = 0;
  let tokensToCorrectNextAction: number | null = null;
  let duplicateWorkCount = 0;
  let wrongFileTouches = 0;

  for (const event of events) {
    running += event.tokens;
    const action = actionString(event);

    if (tokensToCorrectNextAction === null && matchesAny(action, expectations.correctNextAction)) {
      tokensToCorrectNextAction = running;
    }

    if (matchesAny(action, expectations.alreadyDone)) {
      duplicateWorkCount += 1;
    }

    if (event.kind === "tool" && WRITE_TOOLS.has(event.name)) {
      const forbidden = expectations.mustNotTouch.includes(event.path);
      // An empty mustTouch means the scenario does not constrain which files
      // may be edited, so only the explicit deny list applies.
      const outsideAllowed =
        expectations.mustTouch.length > 0 && !expectations.mustTouch.includes(event.path);
      if (forbidden || outsideAllowed) wrongFileTouches += 1;
    }
  }

  return {
    tokensToCorrectNextAction,
    reachedCorrectAction: tokensToCorrectNextAction !== null,
    duplicateWorkCount,
    wrongFileTouches,
    totalTokens: running
  };
}
