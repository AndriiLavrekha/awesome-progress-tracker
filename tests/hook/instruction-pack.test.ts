import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";

async function read(file: string): Promise<string> {
  return fs.readFile(file, "utf-8");
}

function assertContainsAll(text: string, phrases: string[]): void {
  const missing = phrases.filter((phrase) => !text.includes(phrase));
  expect(missing).toEqual([]);
}

describe("instruction pack", () => {
  it("declares the expected Codex skill frontmatter", async () => {
    const text = await read("skills/project-progress/SKILL.md");
    expect(text).toContain("name: project-progress");
    expect(text).toContain(
      "Maintain project-local Markdown progress state in project-progress/ for " +
        "multi-step work, resumability, lifecycle checkpoints, and " +
        "token-conscious agent handoff."
    );
  });

  it("mentions trigger categories in the Codex skill", async () => {
    const text = await read("skills/project-progress/SKILL.md");
    assertContainsAll(text, [
      "multi-step feature",
      "investigation",
      "refactor",
      "project setup",
      "debugging",
      "deployment",
      "release work"
    ]);
  });

  it("mentions instruction-contract terms in the Codex skill", async () => {
    const text = await read("skills/project-progress/SKILL.md");
    assertContainsAll(text, [
      "project-progress/Progress.md",
      "canonical source of truth",
      "Resume Snapshot",
      "frontmatter",
      "templates",
      "opted-out",
      "awesome-progress-tracker state set . --state opted-out",
      "one-off",
      "meaningful work",
      "major decision",
      "milestone complete",
      "blocker found",
      "scope changed",
      "verification complete",
      "session ending",
      "progress_schema_version: 1",
      "sensitivity",
      "sensitivity: private",
      "commit_progress",
      "Never write secrets",
      "Completion Criteria"
    ]);
  });

  it("mentions required terms in the AGENTS snippet", async () => {
    const text = await read("agent-instructions/AGENTS-snippet.md");
    assertContainsAll(text, [
      "project-progress/Progress.md",
      "Resume Snapshot",
      "meaningful work",
      "secrets",
      "sensitivity",
      "sensitivity: private",
      "commit_progress"
    ]);
    expect(text.includes("token-conscious") || text.includes("Do not read all history by default")).toBe(true);
  });

  it("mentions required terms in the CLAUDE snippet", async () => {
    const text = await read("agent-instructions/CLAUDE-snippet.md");
    assertContainsAll(text, [
      "project-progress/Progress.md",
      "Resume Snapshot",
      "Default read path",
      "Before finishing meaningful work",
      "secrets",
      "sensitivity",
      "sensitivity: private",
      "commit_progress"
    ]);
  });

  it("mentions required terms in the HOOKS doc", async () => {
    const text = await read("agent-instructions/HOOKS.md");
    assertContainsAll(text, [
      "remind, validate, and load compact context",
      "should not be the only mechanism",
      "do not write semantic progress summaries by themselves",
      "startup",
      "during work",
      "final response",
      "commit",
      "PR",
      "deploy",
      "hooks/project-progress-check.ps1",
      "hooks/project-progress-check.sh"
    ]);
  });
});
