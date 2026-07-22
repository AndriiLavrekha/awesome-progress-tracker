import { describe, expect, it } from "vitest";
import { parseProjectSummary } from "../../src/mcp/markdown.js";

describe("parseProjectSummary", () => {
  it("returns a compact project summary", () => {
    const markdown = `---
project: MCP Fixture
progress_schema_version: 1
status: active
path: C:/repo
agent_last_used: codex
updated: 2026-06-26
last_milestone: parser test
deployed: false
deployment_url:
sensitivity: normal
commit_progress: true
---

# MCP Fixture

## Resume Snapshot

Compact summary.

## Next Action

Continue.

## Blockers

None.
`;

    const summary = parseProjectSummary(markdown, "C:/repo/project-progress/Progress.md");

    expect(summary).toMatchObject({
      progressPath: "C:/repo/project-progress/Progress.md",
      project: "MCP Fixture",
      status: "active",
      path: "C:/repo",
      updated: "2026-06-26",
      lastMilestone: "parser test",
      deployed: false,
      deploymentUrl: "",
      sensitivity: "normal",
      commitProgress: true,
      resumeSnapshot: "Compact summary.",
      nextAction: "Continue.",
      blockers: "None."
    });
  });

  it("ignores heading-like text inside fenced code blocks", () => {
    const markdown = `---
project: Fence Fixture
status: blocked
path: C:/repo
updated: 2026-06-26
last_milestone: fence test
deployed: true
deployment_url: https://example.com
sensitivity: private
commit_progress: false
---

# Fence Fixture

## Resume Snapshot

\`\`\`md
## Not A Real Section
\`\`\`

Actual summary.

## Next Action

Ship it.

## Blockers

Waiting.
`;

    const summary = parseProjectSummary(markdown);

    expect(summary.resumeSnapshot).toContain("## Not A Real Section");
    expect(summary.resumeSnapshot).toContain("Actual summary.");
    expect(summary.nextAction).toBe("Ship it.");
    expect(summary.deployed).toBe(true);
    expect(summary.commitProgress).toBe(false);
  });
});
