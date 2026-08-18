import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { handlePreCommit, handlePreEdit, handleSessionStart, handleStop } from "../../src/hook/cc-adapter.js";
import { readProjectTrackingState, setProjectTrackingState } from "../../src/project-state.js";

async function withTrackerHome(run: (home: string) => Promise<void>): Promise<void> {
  const previous = process.env.AWESOME_PROGRESS_TRACKER_HOME;
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-home-"));
  process.env.AWESOME_PROGRESS_TRACKER_HOME = home;
  try {
    await run(home);
  } finally {
    if (previous === undefined) delete process.env.AWESOME_PROGRESS_TRACKER_HOME;
    else process.env.AWESOME_PROGRESS_TRACKER_HOME = previous;
  }
}

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-cc-"));
  execFileSync("git", ["init", "-q"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir, stdio: "ignore" });
  return dir;
}

function progressDoc(fields: Record<string, string>, blockers = "None."): string {
  const fm = Object.entries({
    project: "Demo",
    status: "active",
    progress_schema_version: "1",
    sensitivity: "normal",
    commit_progress: "true",
    ...fields
  })
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `---\n${fm}\n---\n\n## Resume Snapshot\n\nWorking on the widget.\n\n## Next Action\n\nWire the widget.\n\n## Blockers\n\n${blockers}\n`;
}

async function writeProgress(dir: string, content: string): Promise<string> {
  const pdir = path.join(dir, "project-progress");
  await fs.mkdir(pdir, { recursive: true });
  const file = path.join(pdir, "Progress.md");
  await fs.writeFile(file, content, "utf-8");
  return file;
}

describe("cc-adapter session-start", () => {
  it("emits initialization guidance when there is no progress file and state is unknown", async () => {
    await withTrackerHome(async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-cc-empty-"));
      const result = await handleSessionStart({ cwd: dir, session_id: `s-${Date.now()}` });
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout!);
      const context = payload.hookSpecificOutput.additionalContext;
      expect(payload.hookSpecificOutput.hookEventName).toBe("SessionStart");
      expect(context).toContain("This project is not initialized with Awesome Progress Tracker");
      expect(context).toContain("Do you want me to create `project-progress/` here?");
      expect(context).toContain("Do not ask for trivial one-off or read-only tasks");
      await expect(fs.access(path.join(dir, "project-progress"))).rejects.toThrow();
    });
  });

  it("stays silent when a missing-progress project is opted out", async () => {
    await withTrackerHome(async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-cc-optout-"));
      await setProjectTrackingState(dir, "opted-out");

      const result = await handleSessionStart({ cwd: dir, session_id: `s-${Date.now()}` });

      expect(result.code).toBe(0);
      expect(result.stdout).toBeUndefined();
    });
  });

  it("repeats initialization guidance for an opted-in project until files exist", async () => {
    await withTrackerHome(async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-cc-optin-"));
      await setProjectTrackingState(dir, "opted-in");

      const result = await handleSessionStart({ cwd: dir, session_id: `s-${Date.now()}` });

      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout!);
      expect(payload.hookSpecificOutput.additionalContext).toContain("previously opted in");
      await expect(fs.access(path.join(dir, "project-progress"))).rejects.toThrow();
    });
  });

  it("injects resume context when a progress file exists", async () => {
    await withTrackerHome(async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-cc-ss-"));
      await writeProgress(dir, progressDoc({ project: "Acme" }));

      const result = await handleSessionStart({ cwd: dir, session_id: `s-${Date.now()}` });
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout!);
      expect(payload.hookSpecificOutput.hookEventName).toBe("SessionStart");
      expect(payload.hookSpecificOutput.additionalContext).toContain("Acme");
      expect(payload.hookSpecificOutput.additionalContext).toContain("Resume Snapshot");
      expect(payload.hookSpecificOutput.additionalContext).toContain("Wire the widget");
      expect((await readProjectTrackingState(dir)).state).toBe("initialized");
    });
  });

  it("bounds an oversized resume snapshot in session context", async () => {
    await withTrackerHome(async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-cc-long-resume-"));
      await writeProgress(dir, progressDoc({ project: "Acme" }).replace("Working on the widget.", "x".repeat(4000)));

      const result = await handleSessionStart({ cwd: dir, session_id: `s-${Date.now()}` });
      const payload = JSON.parse(result.stdout!);
      const context = payload.hookSpecificOutput.additionalContext as string;

      expect(context).toContain("[truncated]");
      expect(context).toContain("Wire the widget");
      expect(context.length).toBeLessThanOrEqual(1600);
    });
  });
});

describe("cc-adapter pre-commit guard", () => {
  it("allows non-commit commands", async () => {
    const dir = await makeRepo();
    await writeProgress(dir, progressDoc({ commit_progress: "false" }));
    const result = await handlePreCommit({ cwd: dir, tool_input: { command: "git status" } });
    expect(result.code).toBe(0);
    expect(result.stdout).toBeUndefined();
  });

  it("denies committing staged progress when commit_progress is false", async () => {
    const dir = await makeRepo();
    await writeProgress(dir, progressDoc({ commit_progress: "false" }));
    execFileSync("git", ["add", "project-progress/Progress.md"], { cwd: dir, stdio: "ignore" });

    const result = await handlePreCommit({ cwd: dir, tool_input: { command: "git commit -m wip" } });
    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout!);
    expect(payload.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(payload.hookSpecificOutput.permissionDecisionReason).toContain("commit_progress: false");
  });

  it("denies committing staged progress when sensitivity is sensitive", async () => {
    const dir = await makeRepo();
    await writeProgress(dir, progressDoc({ sensitivity: "sensitive" }));
    execFileSync("git", ["add", "project-progress/Progress.md"], { cwd: dir, stdio: "ignore" });

    const result = await handlePreCommit({ cwd: dir, tool_input: { command: "git commit -m wip" } });
    const payload = JSON.parse(result.stdout!);
    expect(payload.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(payload.hookSpecificOutput.permissionDecisionReason).toContain("sensitivity: sensitive");
  });

  it("allows committing progress when policy permits it", async () => {
    const dir = await makeRepo();
    await writeProgress(dir, progressDoc({ commit_progress: "true" }));
    execFileSync("git", ["add", "project-progress/Progress.md"], { cwd: dir, stdio: "ignore" });

    const result = await handlePreCommit({ cwd: dir, tool_input: { command: "git commit -m ok" } });
    expect(result.code).toBe(0);
    expect(result.stdout).toBeUndefined();
  });

  it("allows the commit when no progress files are staged", async () => {
    const dir = await makeRepo();
    await writeProgress(dir, progressDoc({ commit_progress: "false" }));
    await fs.writeFile(path.join(dir, "app.txt"), "code", "utf-8");
    execFileSync("git", ["add", "app.txt"], { cwd: dir, stdio: "ignore" });

    const result = await handlePreCommit({ cwd: dir, tool_input: { command: "git commit -m feat" } });
    expect(result.code).toBe(0);
    expect(result.stdout).toBeUndefined();
  });
});

describe("cc-adapter pre-edit reminder", () => {
  it("stays silent without a progress file", async () => {
    const dir = await makeRepo();
    const result = await handlePreEdit({
      cwd: dir,
      session_id: `s-${Date.now()}`,
      tool_name: "Edit",
      tool_input: { file_path: path.join(dir, "app.txt") }
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toBeUndefined();
  });

  it("stays silent when the edited file is inside project-progress/", async () => {
    const dir = await makeRepo();
    await writeProgress(dir, progressDoc({}));
    const result = await handlePreEdit({
      cwd: dir,
      session_id: `s-${Date.now()}`,
      tool_name: "Edit",
      tool_input: { file_path: path.join(dir, "project-progress", "Tasks.md") }
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toBeUndefined();
  });

  it("reminds once per session when editing project files with a progress file present", async () => {
    const dir = await makeRepo();
    await writeProgress(dir, progressDoc({}));
    const sessionId = `s-${Date.now()}`;
    const result = await handlePreEdit({
      cwd: dir,
      session_id: sessionId,
      tool_name: "Edit",
      tool_input: { file_path: path.join(dir, "app.txt") }
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("[project-progress]");
    expect(result.stdout).toContain("Tasks.md");
  });

  it("does not repeat the reminder within the same session", async () => {
    const dir = await makeRepo();
    await writeProgress(dir, progressDoc({}));
    const sessionId = `s-${Date.now()}`;
    await handlePreEdit({
      cwd: dir,
      session_id: sessionId,
      tool_name: "Edit",
      tool_input: { file_path: path.join(dir, "app.txt") }
    });
    const second = await handlePreEdit({
      cwd: dir,
      session_id: sessionId,
      tool_name: "Write",
      tool_input: { file_path: path.join(dir, "other.txt") }
    });
    expect(second.code).toBe(0);
    expect(second.stdout).toBeUndefined();
  });
});

describe("cc-adapter stop reminder", () => {
  it("stays silent without a progress file", async () => {
    const dir = await makeRepo();
    await fs.writeFile(path.join(dir, "app.txt"), "x", "utf-8");
    const result = await handleStop({ cwd: dir, session_id: `s-${Date.now()}` });
    expect(result.code).toBe(0);
    expect(result.stdout).toBeUndefined();
  });

  it("stays silent when the working tree is clean", async () => {
    const dir = await makeRepo();
    await writeProgress(dir, progressDoc({}));
    execFileSync("git", ["add", "-A"], { cwd: dir, stdio: "ignore" });
    execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: dir, stdio: "ignore" });

    const result = await handleStop({ cwd: dir, session_id: `s-${Date.now()}` });
    expect(result.code).toBe(0);
    expect(result.stdout).toBeUndefined();
  });

  it("blocks the first stop on stale progress when the tree changed this session", async () => {
    const dir = await makeRepo();
    await writeProgress(dir, progressDoc({}));
    await fs.writeFile(path.join(dir, "app.txt"), "new work", "utf-8");

    const result = await handleStop({ cwd: dir, session_id: `no-state-${Date.now()}` });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("[project-progress]");
    expect(result.stderr).toContain("not updated");
    expect(result.stdout).toBeUndefined();
  });

  it("falls back to a soft warning once the hard block already fired this session", async () => {
    const dir = await makeRepo();
    await writeProgress(dir, progressDoc({}));
    await fs.writeFile(path.join(dir, "app.txt"), "new work", "utf-8");
    const sessionId = `stop-twice-${Date.now()}`;

    const first = await handleStop({ cwd: dir, session_id: sessionId });
    expect(first.code).toBe(2);

    const second = await handleStop({ cwd: dir, session_id: sessionId });
    expect(second.code).toBe(0);
    expect(second.stdout).toContain("[project-progress]");
    expect(second.stdout).toContain("not updated");
    expect(second.stderr).toBeUndefined();
  });

  it("only soft-warns, never hard-blocks, when hard blocking is disabled", async () => {
    const dir = await makeRepo();
    await writeProgress(dir, progressDoc({}));
    await fs.writeFile(path.join(dir, "app.txt"), "new work", "utf-8");

    const result = await handleStop({ cwd: dir, session_id: `no-state-${Date.now()}` }, { allowBlock: false });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("[project-progress]");
    expect(result.stdout).toContain("not updated");
    expect(result.stderr).toBeUndefined();
  });

  it("includes secret-like value warnings in the block message", async () => {
    const dir = await makeRepo();
    await writeProgress(dir, progressDoc({}).replace("Wire the widget.", "token sk-abcdefghijklmnop0123456789"));
    await fs.writeFile(path.join(dir, "app.txt"), "new work", "utf-8");

    const result = await handleStop({ cwd: dir, session_id: `no-state-${Date.now()}` });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("secrets");
  });
});
