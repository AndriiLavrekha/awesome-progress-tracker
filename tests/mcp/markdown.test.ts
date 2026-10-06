import { describe, expect, it } from "vitest";
import { parseFrontmatter, parseProjectSummary, renderLastRuntime } from "../../src/mcp/markdown.js";

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

describe("parseProjectSummary path reconciliation", () => {
  const STALE = [
    "---",
    "project: Demo",
    "path: C:/old/location",
    "---",
    "",
    "## Next Action",
    "",
    "Continue.",
    ""
  ].join("\n");

  it("derives path from progressPath rather than trusting stale frontmatter", () => {
    const summary = parseProjectSummary(STALE, "D:/depot/repo/project-progress/Progress.md");

    expect(summary.path).toBe("D:/depot/repo");
  });

  it("normalizes separators in the derived path", () => {
    const summary = parseProjectSummary(
      STALE,
      "D:\\depot\\repo\\project-progress\\Progress.md"
    );

    expect(summary.path).toBe("D:/depot/repo");
  });

  it("falls back to the frontmatter path when no progressPath is known", () => {
    expect(parseProjectSummary(STALE).path).toBe("C:/old/location");
  });
});

describe("renderLastRuntime", () => {
  it("renders the full line in field order", () => {
    expect(
      renderLastRuntime({
        provider_last_used: "grok",
        agent_last_used: "grok",
        model_last_used: "grok-4.7",
        effort_last_used: "high",
        updated: "2026-10-06"
      })
    ).toBe("Last runtime: provider grok · agent grok · model grok-4.7 · effort high · updated 2026-10-06");
  });

  it("omits unknown parts and stays quiet when none of the three new fields is known", () => {
    expect(
      renderLastRuntime({
        provider_last_used: "UNKNOWN",
        agent_last_used: "grok",
        model_last_used: "grok-4.7",
        effort_last_used: "   ",
        updated: "2026-10-06"
      })
    ).toBe("Last runtime: agent grok · model grok-4.7 · updated 2026-10-06");
    expect(renderLastRuntime({ agent_last_used: "claude", updated: "2026-08-20" })).toBe("");
    expect(
      renderLastRuntime({
        provider_last_used: "unknown",
        model_last_used: "Unknown",
        effort_last_used: ""
      })
    ).toBe("");
  });

  it("treats quoted unknown as unknown and displays booleans and integers", () => {
    const quoted = parseFrontmatter('---\nprovider_last_used: "unknown"\nmodel_last_used: grok-4\n---\n');
    expect(renderLastRuntime(quoted)).toBe("Last runtime: model grok-4");
    const single = parseFrontmatter("---\nprovider_last_used: 'unknown'\neffort_last_used: high\n---\n");
    expect(renderLastRuntime(single)).toBe("Last runtime: effort high");
    const scalars = parseFrontmatter("---\nprovider_last_used: false\nmodel_last_used: 0\n---\n");
    expect(renderLastRuntime(scalars)).toBe("Last runtime: provider false · model 0");
    const ten = parseFrontmatter("---\nprovider_last_used: 10\n---\n");
    expect(renderLastRuntime(ten)).toBe("Last runtime: provider 10");
  });

  it("cuts a displayed value to 79 characters plus an ellipsis", () => {
    const model = "m".repeat(81);
    expect(renderLastRuntime({ model_last_used: model })).toBe(`Last runtime: model ${"m".repeat(79)}…`);
  });

  it("sets lastRuntime on the project summary", () => {
    const markdown = `---
project: MCP Fixture
progress_schema_version: 1
status: active
path: C:/repo
agent_last_used: codex
provider_last_used: grok
model_last_used: grok-4.7
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
    expect(summary.lastRuntime).toBe(
      "Last runtime: provider grok · agent codex · model grok-4.7 · updated 2026-06-26"
    );
    expect(parseProjectSummary("---\nproject: Quiet\nstatus: active\n---\n", "C:/repo/project-progress/Progress.md").lastRuntime).toBe("");
  });
});
