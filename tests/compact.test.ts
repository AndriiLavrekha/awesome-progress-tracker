import { describe, expect, it } from "vitest";
import { compactProgress, renderArchiveRun, type CompactResult } from "../src/compact.js";
import { repairEncoding } from "../src/encoding.js";

const FM = "---\nproject: Demo\nstatus: active\n---\n";
const SECTIONS = [
  "Resume Snapshot", "Current State", "Last Session", "Next Action", "Remaining Work",
  "Done", "Blockers", "Deployment", "Completion Criteria", "Verification", "Resume Instructions"
];

function progress(extra = "", done = "Done body."): string {
  return `${FM}\n# Demo\n\n${SECTIONS.map((t) => `## ${t}\n\n${t === "Done" ? done : `${t} body.`}\n`).join("\n")}${extra}`;
}

const bigDone = Array.from({ length: 100 }, (_, i) => `- [x] item ${i} finished with detail`).join("\n");

function lineCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const raw of repairEncoding(text).split("\n")) {
    const line = raw.replace(/^#+\s+/, "").trim();
    if (line) counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return counts;
}

function expectConserved(input: string, result: CompactResult): void {
  const archive = renderArchiveRun("2026-10-20", [{ file: "X", blocks: result.moved }]);
  const output = lineCounts([result.kept, archive, result.folded.join("\n")].join("\n"));
  for (const [line, count] of lineCounts(input)) {
    expect(output.get(line) ?? 0, line).toBeGreaterThanOrEqual(count);
  }
}

describe("compactProgress", () => {
  it("leaves a clean file unchanged, including Verification", () => {
    const result = compactProgress(progress());
    expect(result).toEqual({ kept: progress(), moved: [], folded: [], notes: [] });
  });

  it("moves unknown sections, a second H1 and later duplicates with their subsections", () => {
    const extra = "\n## Historical Archive\n\nold\n\n### Detail\n\nolder\n\n# Second Title\n\nstray prose\n\n## Blockers\n\nduplicate\n";
    const result = compactProgress(progress(extra));
    expect(result.kept).toBe(progress());
    expect(result.moved.map((block) => block.trim())).toEqual([
      "## Historical Archive\n\nold\n\n### Detail\n\nolder",
      "# Second Title\n\nstray prose",
      "## Blockers\n\nduplicate"
    ]);
  });

  it("ignores headings inside fenced code", () => {
    const extra = "\n```md\n## Not A Section\n# Not A Title\n```\n";
    const result = compactProgress(progress(extra));
    expect(result.moved).toEqual([]);
    expect(result.kept).toBe(progress(extra));
  });

  it("repairs garbled text and drops exact duplicate moved blocks", () => {
    const extra = "\n## Old \u00e2\u20ac\u201d A\n\nsame\n\n## Old — A\n\nsame\n";
    const result = compactProgress(progress(extra).replace("Current State body.", "Current \u00e2\u20ac\u201d state."));
    expect(result.moved.map((block) => block.trim())).toEqual(["## Old — A\n\nsame"]);
    expect(result.kept).toContain("Current — state.");
  });

  it("does not fold a Done section that contains fenced code", () => {
    expect(compactProgress(progress("", `${bigDone}\n\`\`\`\ncode\n\`\`\``)).folded).toEqual([]);
  });

  it("folds a large Done section into folded lines", () => {
    const result = compactProgress(progress("", bigDone));
    expect(result.folded[0]).toBe("- [x] item 0 finished with detail");
    expect(result.kept).toContain("- [x] item 99 finished with detail");
    expect(result.kept).not.toContain("item 0 finished");
  });

  it("conserves every line and is idempotent", () => {
    const input = progress("\n## Historical\n\nalpha\n\n### Deep\n\nbeta\n\n# Again\n\ngamma\n", bigDone);
    const result = compactProgress(input);
    expectConserved(input, result);
    const again = compactProgress(result.kept);
    expect(again).toEqual({ kept: result.kept, moved: [], folded: [], notes: [] });
  });
});

describe("renderArchiveRun", () => {
  it("renders one dated run with headings shifted two levels", () => {
    const run = renderArchiveRun("2026-10-20", [
      { file: "Progress.md", blocks: ["## Old\n\n### Sub\n\ntext\n"] },
      { file: "Tasks.md", blocks: [] }
    ]);
    expect(run).toBe("## Compacted 2026-10-20\n\n### From Progress.md\n\n#### Old\n\n##### Sub\n\ntext\n");
  });

  it("renders nothing without moved blocks and never shifts fenced lines", () => {
    expect(renderArchiveRun("2026-10-20", [{ file: "Tasks.md", blocks: [] }])).toBe("");
    expect(renderArchiveRun("2026-10-20", [{ file: "X", blocks: ["## A\n\n```\n## fenced\n```\n"] }])).toContain("```\n## fenced\n```");
  });
});
