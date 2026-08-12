import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  helpText,
  initProject,
  initProjectAndIndex,
  installAgent,
  listStateEntries,
  parseArgs,
  readStatus,
  resetProjectState,
  runDoctor,
  setProjectState,
  uninstallAgent
} from "../../src/cli.js";
import { readProjectIndex } from "../../src/mcp/index.js";
import { readProjectTrackingState } from "../../src/project-state.js";

describe("npm CLI", () => {
  it("exposes package binaries for npm and npx", async () => {
    const packageJson = JSON.parse(await fs.readFile(path.join(process.cwd(), "package.json"), "utf-8"));

    expect(packageJson.private).toBe(false);
    expect(packageJson.name).toBe("awesome-progress-tracker");
    expect(packageJson.bin).toEqual({
      "awesome-progress-tracker": "dist/src/cli.js",
      "project-progress": "dist/src/cli.js"
    });
    expect(packageJson.files).toContain("templates/project-progress");
    expect(packageJson.files).toContain(".codex-plugin");
    expect(packageJson.files).toContain(".agents/plugins");
    expect(packageJson.files).toContain(".mcp.codex.json");
    expect(packageJson.files).toContain("TESTING.md");
    expect(packageJson.scripts.prepare).toBe("npm run build");
    expect(packageJson.scripts.prepack).toBe("npm run build");
  });

  it("parses init options", () => {
    expect(parseArgs(["init", "C:/repo", "--project", "Demo", "--force"])).toEqual({
      command: "init",
      targetDir: "C:/repo",
      projectName: "Demo",
      verify: false,
      force: true
    });
  });

  it("parses install agent selection with claude default", () => {
    expect(parseArgs(["install"])).toEqual({
      command: "install",
      verify: false,
      force: false
    });
    expect(parseArgs(["install", "-g", "claude"]).agent).toBe("claude");
    expect(parseArgs(["install", "-g", "codex"]).agent).toBe("codex");
    expect(parseArgs(["install", "-g", "hermes"]).agent).toBe("hermes");
    expect(parseArgs(["install", "--agent=hermes"]).agent).toBe("hermes");
    expect(helpText()).toContain("claude|codex|hermes");
    expect(parseArgs(["install", "-g", "codex", "--roots", "C:/one;C:/two"]).roots).toBe("C:/one;C:/two");
    expect(parseArgs(["install", "--verify"]).verify).toBe(true);
    expect(parseArgs(["doctor", "--json"])).toMatchObject({ command: "doctor", json: true });
    expect(parseArgs(["install-mcp", "--local"]).scope).toBe("project");
    expect(parseArgs(["install-mcp", "--scope", "project"]).scope).toBe("project");
    expect(parseArgs(["state", "set", "C:/repo", "--state", "opted-out"])).toMatchObject({
      command: "state",
      stateCommand: "set",
      targetDir: "C:/repo",
      trackingState: "opted-out"
    });
    expect(parseArgs(["state", "reset", "C:/repo"])).toMatchObject({
      command: "state",
      stateCommand: "reset",
      targetDir: "C:/repo"
    });
    expect(() => parseArgs(["install", "-g", "both"])).toThrow(/claude, codex, or hermes/);
  });

  it("installs Claude bootstrap instructions and MCP config by default", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-home-"));

    const result = await installAgent({ homeDir: home, cwd: "C:/repo" });
    const claudeMemory = path.join(home, ".claude", "CLAUDE.md");
    const claudeConfig = path.join(home, ".claude.json");
    const markdown = await fs.readFile(claudeMemory, "utf-8");
    const config = JSON.parse(await fs.readFile(claudeConfig, "utf-8"));

    expect(result.agent).toBe("claude");
    expect(result.writtenFiles).toEqual([claudeMemory, claudeConfig]);
    expect(markdown).toContain("This project is not initialized with Awesome Progress Tracker");
    expect(markdown).toContain("Only initialize after the user says yes");
    expect(markdown).toContain("npx github:AndriiLavrekha/awesome-progress-tracker init");
    expect(config.mcpServers["awesome-progress-tracker"]).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "github:AndriiLavrekha/awesome-progress-tracker", "mcp"],
      env: {
        PROJECT_PROGRESS_ROOTS: "C:/repo"
      }
    });
  });

  it("installs Codex bootstrap instructions, skill, and MCP config", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-home-"));

    const result = await installAgent({ agent: "codex", homeDir: home, roots: "C:/one;C:/two" });
    const codexAgents = path.join(home, ".codex", "AGENTS.md");
    const codexSkill = path.join(home, ".codex", "skills", "awesome-progress-tracker", "SKILL.md");
    const codexConfig = path.join(home, ".codex", "config.toml");
    const agentsMarkdown = await fs.readFile(codexAgents, "utf-8");
    const skillMarkdown = await fs.readFile(codexSkill, "utf-8");
    const configToml = await fs.readFile(codexConfig, "utf-8");

    expect(result.agent).toBe("codex");
    expect(result.writtenFiles).toEqual([codexAgents, codexSkill, codexConfig]);
    expect(agentsMarkdown).toContain("ask the user before initializing");
    expect(skillMarkdown).toContain("name: project-progress");
    expect(configToml).toContain("[mcp_servers.awesome-progress-tracker]");
    expect(configToml).toContain('args = ["-y", "github:AndriiLavrekha/awesome-progress-tracker", "mcp"]');
    expect(configToml).toContain('PROJECT_PROGRESS_ROOTS = "C:/one;C:/two"');
  });

  it("installs project-local MCP config without bootstrap instructions", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-project-"));

    const result = await installAgent({
      cwd: project,
      roots: "C:/repo",
      mcpOnly: true,
      scope: "project"
    });

    const projectConfig = path.join(project, ".mcp.json");
    const config = JSON.parse(await fs.readFile(projectConfig, "utf-8"));

    expect(result.writtenFiles).toEqual([projectConfig]);
    expect(config.mcpServers["awesome-progress-tracker"]).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "github:AndriiLavrekha/awesome-progress-tracker", "mcp"],
      env: {
        PROJECT_PROGRESS_ROOTS: "C:/repo"
      }
    });
  });

  it("reports status and uninstalls managed Claude files", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-home-"));
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-project-"));
    await installAgent({ homeDir: home, cwd: project });
    await initProject({ cwd: project, projectName: "Demo Project" });

    expect(await readStatus({ homeDir: home, cwd: project })).toMatchObject({
      agent: "claude",
      projectInitialized: true,
      bootstrapInstalled: true,
      mcpConfigured: true
    });

    const removed = await uninstallAgent({ homeDir: home });
    expect(removed.changedFiles).toHaveLength(2);
    expect(await readStatus({ homeDir: home, cwd: project })).toMatchObject({
      bootstrapInstalled: false,
      mcpConfigured: false
    });
  });

  it("runs doctor checks for a complete Codex install", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-home-"));
    await installAgent({ agent: "codex", homeDir: home, roots: "C:/repo" });

    const doctor = await runDoctor({ agent: "codex", homeDir: home });

    expect(doctor.agent).toBe("codex");
    expect(doctor.checks.find((check) => check.name === "bootstrap")?.ok).toBe(true);
    expect(doctor.checks.find((check) => check.name === "mcp")?.ok).toBe(true);
    expect(doctor.checks.find((check) => check.name === "skill")?.ok).toBe(true);
  });

  it("reports status and uninstalls managed Codex files", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-home-"));
    await installAgent({ agent: "codex", homeDir: home, roots: "C:/repo" });

    expect(await readStatus({ agent: "codex", homeDir: home })).toMatchObject({
      agent: "codex",
      bootstrapInstalled: true,
      mcpConfigured: true,
      skillInstalled: true
    });

    const removed = await uninstallAgent({ agent: "codex", homeDir: home });
    expect(removed.changedFiles).toHaveLength(3);
    expect(await readStatus({ agent: "codex", homeDir: home })).toMatchObject({
      bootstrapInstalled: false,
      mcpConfigured: false,
      skillInstalled: false
    });
  });

  it("initializes project-progress files from templates", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-"));

    const result = await initProject({
      cwd: tmp,
      projectName: "Demo Project",
      today: "2026-06-27"
    });

    const progressPath = path.join(result.targetProgressDir, "Progress.md");
    const markdown = await fs.readFile(progressPath, "utf-8");

    expect(result.createdFiles.map((file) => path.basename(file)).sort()).toEqual([
      "Decisions.md",
      "Open Questions.md",
      "Progress.md",
      "Session Log.md",
      "Tasks.md"
    ]);
    expect(markdown).toContain("project: Demo Project");
    expect(markdown).toContain("# Demo Project");
    expect(markdown).toContain(`path: ${tmp.replace(/\\/g, "/")}`);
    expect(markdown).toContain("updated: 2026-06-27");
  });

  it("initializes project-progress files and updates the global index", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-"));
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-home-"));

    await initProjectAndIndex({
      cwd: tmp,
      homeDir: home,
      projectName: "Indexed Project",
      today: "2026-06-27"
    });

    const index = await readProjectIndex({ homeDir: home });
    expect(index.projects.map((project) => project.project)).toEqual(["Indexed Project"]);
  });

  it("marks initialized state when init updates the index", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-"));
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-home-"));

    await initProjectAndIndex({
      cwd: tmp,
      homeDir: home,
      projectName: "Initialized State",
      today: "2026-06-29"
    });

    expect(await readProjectTrackingState(tmp, { homeDir: home })).toMatchObject({
      state: "initialized"
    });
  });

  it("lists, sets, and resets per-project tracking state", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-state-"));
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-home-"));

    const set = await setProjectState({ targetDir: tmp, state: "opted-out", homeDir: home });
    expect(set.state).toBe("opted-out");
    expect((await listStateEntries({ homeDir: home })).map((entry) => entry.state)).toEqual(["opted-out"]);

    const reset = await resetProjectState({ targetDir: tmp, homeDir: home });
    expect(reset.reset).toBe(true);
    expect(await listStateEntries({ homeDir: home })).toEqual([]);
  });

  it("refuses to overwrite an existing progress folder without force", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "project-progress-"));
    await initProject({ cwd: tmp, projectName: "Demo Project" });

    await expect(initProject({ cwd: tmp, projectName: "Demo Project" })).rejects.toThrow(/already exists/);
  });
});
