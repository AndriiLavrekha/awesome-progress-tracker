import { describe, expect, it } from "vitest";
import { applyArchive, compactProgress, compactSessionLog, compactTasks, insertArchiveRun, planCompaction, renderArchiveRun, type CompactResult } from "../src/compact.js";
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

const entry = (heading: string) => `## ${heading}\n\n${heading} details.\n`;
const headings = (text: string) => text.match(/^## .*$/gm) ?? [];

describe("compactSessionLog", () => {
  it("keeps the newest 20 dated entries oldest to newest and moves the rest", () => {
    const dates = Array.from({ length: 25 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`);
    const mixed = [...dates.slice(10), ...dates.slice(0, 10)];
    const input = `# Session Log\n\n${mixed.map(entry).join("\n")}`;
    const result = compactSessionLog(input);
    expect(headings(result.kept)).toEqual(dates.slice(5).map((d) => `## ${d}`));
    expect(result.moved.map((block) => block.split("\n")[0])).toEqual(dates.slice(0, 5).map((d) => `## ${d}`));
    expectConserved(input, result);
    expect(compactSessionLog(result.kept)).toEqual({ ...result, moved: [] });
  });

  it("breaks same-day ties by HH:MM, then by file position", () => {
    const input = `# Session Log\n\n${[entry("2026-10-01 18:00 late"), entry("2026-10-01 09:00 early"), entry("2026-10-01 09:00 early-second")].join("\n")}`;
    expect(headings(compactSessionLog(input).kept)).toEqual([
      "## 2026-10-01 09:00 early",
      "## 2026-10-01 09:00 early-second",
      "## 2026-10-01 18:00 late"
    ]);
  });

  it("keeps undated entries ahead of dated ones and moves a second H1", () => {
    const input = `# Session Log\n\n${entry("2026-10-02 b")}\n${entry("Respawn checkpoint")}\n# Session Log\n\n${entry("2026-10-01 a")}`;
    const result = compactSessionLog(input);
    expect(headings(result.kept)).toEqual(["## Respawn checkpoint", "## 2026-10-01 a", "## 2026-10-02 b"]);
    expect(result.moved.map((block) => block.trim())).toEqual(["# Session Log"]);
    expect(result.notes).toEqual(["Session Log.md: 1 undated entries kept"]);
  });
});

describe("compactTasks", () => {
  it("moves finished blocks beyond the newest 3", () => {
    const finished = Array.from({ length: 5 }, (_, i) => `## Checkpoint ${i}\n\nprose ${i}\n`);
    const input = `# Tasks\n\n## Active\n\n- [ ] open\n\n${finished.join("\n")}`;
    const result = compactTasks(input);
    expect(result.moved.map((block) => block.split("\n")[0])).toEqual(["## Checkpoint 0", "## Checkpoint 1"]);
    expect(headings(result.kept)).toEqual(["## Active", "## Checkpoint 2", "## Checkpoint 3", "## Checkpoint 4"]);
    expectConserved(input, result);
  });

  it("moves old checked tasks with children, grouped by heading, never one with an open child", () => {
    const done = Array.from({ length: 12 }, (_, i) => `- [x] done ${i}\n  - note ${i}`).join("\n");
    const input = `# Tasks\n\n## Active\n\n- [ ] open one\n- [X] parent\n  - [ ] open child\n${done}\n`;
    const result = compactTasks(input);
    expect(result.moved).toEqual(["## Active\n\n- [x] done 0\n  - note 0\n- [x] done 1\n  - note 1\n"]);
    expect(result.kept).toContain("- [X] parent\n  - [ ] open child");
    expect(result.kept).toContain("- [x] done 11\n  - note 11");
    expect(result.kept).not.toContain("note 0");
    expectConserved(input, result);
    expect(compactTasks(result.kept).moved).toEqual([]);
  });

  it("moves a checked task's indented continuation after a blank line", () => {
    const rest = Array.from({ length: 10 }, (_, i) => `- [x] later ${i}`).join("\n");
    const result = compactTasks(`# Tasks\n\n- [x] first\n\n  continued\n${rest}\n`);
    expect(result.moved).toEqual(["## Tasks\n\n- [x] first\n\n  continued\n"]);
    expect(result.kept).not.toContain("continued");
  });

  it("keeps a checked task whose lines touch a fence", () => {
    const rest = Array.from({ length: 10 }, (_, i) => `- [x] later ${i}`).join("\n");
    const result = compactTasks(`# Tasks\n\n## Active\n\n- [x] first\n  \`\`\`\ncode\n  \`\`\`\n${rest}\n`);
    expect(result.moved).toEqual([]);
  });

  it("ignores task markers inside fenced code", () => {
    const fenced = "```\n" + Array.from({ length: 12 }, (_, i) => `- [x] fenced ${i}`).join("\n") + "\n```\n";
    expect(compactTasks(`# Tasks\n\n## Active\n\n- [ ] open\n\n${fenced}`).moved).toEqual([]);
  });

  it("never moves a block holding an open task in another list syntax", () => {
    const finished = Array.from({ length: 3 }, (_, i) => `## Done ${i}\n\nprose ${i}\n`).join("\n");
    const input = `# Tasks\n\n## A\n\n+ [ ] x\n\n## B\n\n1. [ ] x\n\n## C\n\n> - [ ] x\n\n${finished}`;
    expect(compactTasks(input)).toEqual({ kept: input, moved: [], folded: [], notes: [] });
  });

  it("never moves a checked task with a numbered open child", () => {
    const rest = Array.from({ length: 10 }, (_, i) => `- [x] later ${i}`).join("\n");
    const result = compactTasks(`# Tasks\n\n## Active\n\n- [x] parent\n  1. [ ] child\n${rest}\n`);
    expect(result.moved).toEqual([]);
    expect(result.kept).toContain("- [x] parent\n  1. [ ] child");
  });

  it("keeps a checked task followed by a lazy continuation line", () => {
    const rest = Array.from({ length: 10 }, (_, i) => `- [x] l${i}`).join("\n");
    const result = compactTasks(`# Tasks\n\n- [ ] keep\n- [x] first\nlazy text\n${rest}\n`);
    expect(result.kept).toContain("- [x] first\nlazy text");
    expect(result.moved).toEqual([]);
  });

  it("leaves a small file unchanged", () => {
    const input = "# Tasks\n\n- [ ] a\n- [x] b\n";
    expect(compactTasks(input)).toEqual({ kept: input, moved: [], folded: [], notes: [] });
  });
});

describe("planCompaction", () => {
  it("collects new texts, moved headings, the archive run and repaired files", () => {
    const files = new Map([
      ["Progress.md", progress("\n## Historical\n\nold\n", bigDone)],
      ["Decisions.md", "# Decisions\n\nUse \u00e2\u20ac\u201d dashes.\n"],
      ["Open Questions.md", "# Open Questions\n"]
    ]);
    const plan = planCompaction(files, "2026-10-20");
    expect([...plan.outputs.keys()]).toEqual(["Progress.md", "Decisions.md"]);
    expect(plan.outputs.get("Decisions.md")).toBe("# Decisions\n\nUse — dashes.\n");
    expect(plan.moved.get("Progress.md")).toEqual(["## Historical"]);
    expect(plan.folded.length).toBeGreaterThan(0);
    expect(plan.repaired).toEqual(["Decisions.md"]);
    expect(plan.run).toBe("## Compacted 2026-10-20\n\n### From Progress.md\n\n#### Historical\n\nold\n");
  });
});

describe("insertArchiveRun / applyArchive", () => {
  it("inserts the run before Archived Done Items and appends folded lines under it", () => {
    const archive = "# Archive\n\n## Archived Done Items\n\n### 2026-10-01\n\n- [x] older\n";
    const run = "## Compacted 2026-10-20\n\n### From Progress.md\n\n#### Old\n\nold\n";
    expect(insertArchiveRun(archive, run)).toBe(
      "# Archive\n\n## Compacted 2026-10-20\n\n### From Progress.md\n\n#### Old\n\nold\n\n## Archived Done Items\n\n### 2026-10-01\n\n- [x] older\n"
    );
    const applied = applyArchive(archive, { run, folded: ["- [x] newer"] });
    expect(applied.indexOf("## Compacted")).toBeLessThan(applied.indexOf("## Archived Done Items"));
    expect(applied.trimEnd().endsWith("- [x] newer")).toBe(true);
  });

  it("appends the run when there is no Archived Done Items heading", () => {
    expect(insertArchiveRun("# Archive\n", "## Compacted x\n")).toBe("# Archive\n\n## Compacted x\n");
  });
});
