import { describe, expect, it } from "vitest";
import {
  renderDrift,
  renderGates,
  MAX_DRIFT_FILES,
  MAX_DRIFT_LENGTH
} from "../../src/hook/checkpoint-render.js";

const BASE = "e7d3f98a1b2c3d4e5f60718293a4b5c6d7e8f900";
const HEAD = "def456ab1c2d3e4f5061728394a5b6c7d8e9f001";

describe("renderDrift", () => {
  it("renders nothing when there is no drift", () => {
    expect(renderDrift({ kind: "none" }, BASE)).toBe("");
  });

  it("renders an ancestor checkpoint with a file list", () => {
    const text = renderDrift(
      {
        kind: "ahead",
        commitsBehind: 4,
        head: HEAD,
        branch: "main",
        files: ["src/mcp/writer.ts", "src/hook/cc-adapter.ts"]
      },
      BASE
    );

    expect(text).toContain("stored base_commit e7d3f98");
    expect(text).toContain("4 commits behind HEAD def456a (branch main)");
    expect(text).toContain("  src/mcp/writer.ts");
    expect(text).toContain("Verify Next Action still applies");
  });

  it("uses singular wording for a single commit", () => {
    const text = renderDrift(
      { kind: "ahead", commitsBehind: 1, head: HEAD, branch: "main", files: [] },
      BASE
    );
    expect(text).toContain("1 commit behind");
    expect(text).not.toContain("Changed since checkpoint");
  });

  it("caps the file list and reports the remainder", () => {
    const files = Array.from({ length: MAX_DRIFT_FILES + 3 }, (_, index) => `f${index}.ts`);
    const text = renderDrift(
      { kind: "ahead", commitsBehind: 2, head: HEAD, branch: "main", files },
      BASE
    );

    expect(text).toContain("  f0.ts");
    expect(text).toContain(`  f${MAX_DRIFT_FILES - 1}.ts`);
    expect(text).not.toContain(`  f${MAX_DRIFT_FILES}.ts`);
    expect(text).toContain("(+3 more)");
  });

  it("renders divergence with both sides", () => {
    const text = renderDrift(
      {
        kind: "diverged",
        onlyOnCheckpoint: 2,
        onlyOnHead: 3,
        head: HEAD,
        branch: "main",
        files: ["a.ts"]
      },
      BASE
    );

    expect(text).toContain("has diverged from HEAD def456a");
    expect(text).toContain("2 on the checkpoint side, 3 on HEAD");
  });

  it("renders a missing checkpoint without a file list", () => {
    const text = renderDrift({ kind: "missing", head: HEAD, branch: "main" }, BASE);

    expect(text).toContain("no longer in this repository's history");
    expect(text).not.toContain("Changed since checkpoint");
  });

  it("renders a backwards reset as behind the checkpoint", () => {
    const text = renderDrift(
      { kind: "behind", onlyOnCheckpoint: 3, head: HEAD, branch: "main", files: ["a.ts"] },
      BASE
    );

    expect(text).toContain("3 commits behind the stored checkpoint");
    expect(text).toContain("reset backwards past it");
    expect(text).toContain("  a.ts");
  });

  it("uses singular wording for a single commit behind the checkpoint", () => {
    const text = renderDrift(
      { kind: "behind", onlyOnCheckpoint: 1, head: HEAD, branch: "main", files: [] },
      BASE
    );

    expect(text).toContain("1 commit behind the stored checkpoint");
  });

  it("renders an undetermined comparison without inventing counts", () => {
    const text = renderDrift({ kind: "unknown", head: HEAD, branch: "main" }, BASE);

    expect(text).toContain("could not be determined");
    expect(text).toContain("shallow clone");
    expect(text).not.toContain("Changed since checkpoint");
  });

  const realisticFiles = Array.from(
    { length: 10 },
    (_, index) => `src/some/realistic/path/file-${index}.ts`
  );

  it("fits the ahead variant within the length budget with realistic inputs", () => {
    const text = renderDrift(
      { kind: "ahead", commitsBehind: 4, head: HEAD, branch: "main", files: realisticFiles },
      BASE
    );
    expect(text.length).toBeLessThanOrEqual(MAX_DRIFT_LENGTH);
  });

  it("fits the diverged variant within the length budget with realistic inputs", () => {
    const text = renderDrift(
      {
        kind: "diverged",
        onlyOnCheckpoint: 2,
        onlyOnHead: 3,
        head: HEAD,
        branch: "main",
        files: realisticFiles
      },
      BASE
    );
    expect(text.length).toBeLessThanOrEqual(MAX_DRIFT_LENGTH);
  });

  it("fits the behind variant within the length budget with realistic inputs", () => {
    const text = renderDrift(
      { kind: "behind", onlyOnCheckpoint: 3, head: HEAD, branch: "main", files: realisticFiles },
      BASE
    );
    expect(text.length).toBeLessThanOrEqual(MAX_DRIFT_LENGTH);
  });

  it("keeps the closing instruction even when the file list is oversized", () => {
    for (const text of [
      renderDrift(
        { kind: "ahead", commitsBehind: 4, head: HEAD, branch: "main", files: realisticFiles },
        BASE
      ),
      renderDrift(
        {
          kind: "diverged",
          onlyOnCheckpoint: 2,
          onlyOnHead: 3,
          head: HEAD,
          branch: "main",
          files: realisticFiles
        },
        BASE
      ),
      renderDrift(
        { kind: "behind", onlyOnCheckpoint: 3, head: HEAD, branch: "main", files: realisticFiles },
        BASE
      )
    ]) {
      expect(text.endsWith("Verify Next Action still applies before acting.")).toBe(true);
    }
  });

  it("drops file lines rather than prose or the closing line when paths are very long", () => {
    const longFiles = Array.from({ length: 10 }, (_, index) => `a${"x".repeat(115)}${index}.ts`);
    const text = renderDrift(
      { kind: "ahead", commitsBehind: 4, head: HEAD, branch: "main", files: longFiles },
      BASE
    );

    expect(text).toContain("Checkpoint drift:");
    expect(text.endsWith("Verify Next Action still applies before acting.")).toBe(true);

    const fileLineCount = longFiles.filter((file) => text.includes(`  ${file}`)).length;
    expect(fileLineCount).toBeLessThan(10);
  });

  it("reports the actual number of omitted files, not a hardcoded count", () => {
    const files = Array.from({ length: 13 }, (_, index) => `src/module/component-${index}.ts`);
    const text = renderDrift(
      { kind: "ahead", commitsBehind: 4, head: HEAD, branch: "main", files },
      BASE
    );

    const shown = files.filter((file) => text.includes(`  ${file}`)).length;
    const expectedOmitted = files.length - shown;

    expect(text).toContain(`(+${expectedOmitted} more)`);
  });

  const LONG_BRANCH = "x".repeat(300);

  it("bounds the missing variant even with a 300-character branch name", () => {
    const text = renderDrift({ kind: "missing", head: HEAD, branch: LONG_BRANCH }, BASE);
    expect(text.length).toBeLessThanOrEqual(MAX_DRIFT_LENGTH);
  });

  it("bounds the unknown variant even with a 300-character branch name", () => {
    const text = renderDrift({ kind: "unknown", head: HEAD, branch: LONG_BRANCH }, BASE);
    expect(text.length).toBeLessThanOrEqual(MAX_DRIFT_LENGTH);
  });

  it("visibly abbreviates a long branch name rather than dropping it silently", () => {
    const text = renderDrift({ kind: "missing", head: HEAD, branch: LONG_BRANCH }, BASE);
    expect(text).not.toContain(LONG_BRANCH);
    expect(text).toContain("…");
  });

  it("leaves a normal branch name unabbreviated", () => {
    const text = renderDrift({ kind: "missing", head: HEAD, branch: "main" }, BASE);
    expect(text).toContain("(branch main)");
  });
});

describe("renderGates", () => {
  it("renders nothing when no gates are present", () => {
    expect(renderGates({ project: "Demo" })).toBe("");
  });

  it("renders nothing when every present gate is done", () => {
    expect(renderGates({ gate_tests: "done", gate_review: "done" })).toBe("");
  });

  it("renders only the gates that are not done, in canonical key order", () => {
    const text = renderGates({
      gate_implementation: "done",
      gate_tests: "failing",
      gate_review: "pending",
      gate_deploy: "not-started"
    });

    expect(text).toBe("Gates at checkpoint: tests=failing, review=pending, deploy=not-started");
  });

  it("caps an absurdly long hand-edited value while leaving normal values intact", () => {
    const text = renderGates({
      gate_tests: "x".repeat(200),
      gate_review: "pending"
    });

    expect(text).toContain("review=pending");
    expect(text).toContain("…");
    expect(text).not.toContain("x".repeat(200));
  });
});
