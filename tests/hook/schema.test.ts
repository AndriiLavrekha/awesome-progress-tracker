import { describe, expect, it } from "vitest";
import {
  ALLOWED_GATE_VALUES,
  ALLOWED_HANDOFF,
  GATE_KEYS,
  OPTIONAL_FRONTMATTER,
  validateFrontmatter
} from "../../src/hook/schema.js";

function baseFrontmatter(extra: Record<string, string | boolean | number> = {}) {
  return {
    project: "Demo",
    progress_schema_version: 1,
    status: "active",
    path: "/tmp/demo",
    agent_last_used: "claude",
    updated: "2026-08-19",
    last_milestone: "did a thing",
    deployed: false,
    deployment_url: "",
    sensitivity: "normal",
    commit_progress: true,
    ...extra
  };
}

describe("optional checkpoint frontmatter", () => {
  it("exposes the four gate keys and five gate values", () => {
    expect([...GATE_KEYS]).toEqual([
      "gate_implementation",
      "gate_tests",
      "gate_review",
      "gate_deploy"
    ]);
    expect([...ALLOWED_GATE_VALUES]).toEqual([
      "not-started",
      "in-progress",
      "done",
      "failing",
      "blocked"
    ]);
    for (const key of GATE_KEYS) {
      expect(OPTIONAL_FRONTMATTER).toContain(key);
    }
  });

  it("accepts frontmatter with no optional keys at all", () => {
    expect(validateFrontmatter(baseFrontmatter())).toEqual([]);
  });

  it("accepts a complete valid checkpoint", () => {
    const errors = validateFrontmatter(
      baseFrontmatter({
        base_commit: "e7d3f98a1b2c3d4e5f60718293a4b5c6d7e8f900",
        base_branch: "main",
        worktree_dirty: true,
        checkpoint_at: "2026-08-19T14:02:11Z",
        gate_implementation: "done",
        gate_tests: "failing"
      })
    );
    expect(errors).toEqual([]);
  });

  it("rejects a gate value outside the vocabulary", () => {
    const errors = validateFrontmatter(baseFrontmatter({ gate_tests: "green" }));
    expect(errors).toContain(
      "gate_tests must be one of: blocked, done, failing, in-progress, not-started"
    );
  });

  it("rejects a non-boolean worktree_dirty", () => {
    const errors = validateFrontmatter(baseFrontmatter({ worktree_dirty: "yes" }));
    expect(errors).toContain("worktree_dirty must be a boolean");
  });

  it("rejects a short or non-hex base_commit", () => {
    expect(validateFrontmatter(baseFrontmatter({ base_commit: "e7d3f98" }))).toContain(
      "base_commit must be a full 40-character hex SHA"
    );
    expect(validateFrontmatter(baseFrontmatter({ base_commit: "z".repeat(40) }))).toContain(
      "base_commit must be a full 40-character hex SHA"
    );
  });

  it("rejects an unparseable checkpoint_at", () => {
    const errors = validateFrontmatter(baseFrontmatter({ checkpoint_at: "yesterday" }));
    expect(errors).toContain("checkpoint_at must be an ISO 8601 timestamp");
  });

  it("rejects a gate key holding a non-string", () => {
    const errors = validateFrontmatter(baseFrontmatter({ gate_tests: true }));
    expect(errors).toContain(
      "gate_tests must be one of: blocked, done, failing, in-progress, not-started"
    );
  });

  it("rejects an uppercase-hex base_commit", () => {
    const errors = validateFrontmatter(
      baseFrontmatter({ base_commit: "E7D3F98A1B2C3D4E5F60718293A4B5C6D7E8F900" })
    );
    expect(errors).toContain("base_commit must be a full 40-character hex SHA");
  });

  it("rejects checkpoint_at as a bare number", () => {
    const errors = validateFrontmatter(baseFrontmatter({ checkpoint_at: 1755612131 }));
    expect(errors).toContain("checkpoint_at must be an ISO 8601 timestamp");
  });

  it("accepts checkpoint_at with an explicit offset", () => {
    const errors = validateFrontmatter(
      baseFrontmatter({ checkpoint_at: "2026-08-19T14:02:11+02:00" })
    );
    expect(errors).toEqual([]);
  });
});

describe("handoff frontmatter", () => {
  it("registers both keys as optional", () => {
    expect(OPTIONAL_FRONTMATTER).toContain("handoff");
    expect(OPTIONAL_FRONTMATTER).toContain("session_id");
  });

  it("accepts both handoff values", () => {
    for (const value of ALLOWED_HANDOFF) {
      expect(validateFrontmatter(baseFrontmatter({ handoff: value }))).toEqual([]);
    }
  });

  it("rejects any other handoff value", () => {
    expect(validateFrontmatter(baseFrontmatter({ handoff: "partial" }))).toContain(
      "handoff must be one of: clean, interrupted"
    );
  });

  it("rejects a non-string handoff", () => {
    expect(validateFrontmatter(baseFrontmatter({ handoff: true }))).toContain(
      "handoff must be one of: clean, interrupted"
    );
  });

  it("accepts frontmatter with no handoff at all", () => {
    expect(validateFrontmatter(baseFrontmatter())).toEqual([]);
  });

  it("accepts an arbitrary session_id without validating its format", () => {
    expect(
      validateFrontmatter(baseFrontmatter({ session_id: "cc27106a-264d-4a30-af81-c989f856fb17" }))
    ).toEqual([]);
    expect(validateFrontmatter(baseFrontmatter({ session_id: "anything at all" }))).toEqual([]);
  });
});
