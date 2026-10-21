#!/usr/bin/env node
import { promises as fs, realpathSync } from "node:fs";
import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { parseProjectSummary } from "./mcp/markdown.js";
import { upsertIndexedProject } from "./mcp/index.js";
import { main as runMcpServer } from "./mcp/server.js";
import { sha256 } from "./hash.js";
import { planCompaction, readProgressFiles, applyArchive } from "./compact.js";
import { ProgressConflictError, updateArchiveFile, writeFileAtomic } from "./mcp/writer.js";
import { PACKAGE_ROOT, PACKAGE_VERSION } from "./package.js";
import {
  listProjectTrackingStates,
  resetProjectTrackingState,
  setProjectTrackingState
} from "./project-state.js";
import type { ProjectStateOptions, ProjectTrackingState, ProjectTrackingStateEntry } from "./project-state.js";

const execFileAsync = promisify(execFile);
const TEMPLATE_DIR = path.join(PACKAGE_ROOT, "templates", "project-progress");
const MCP_SERVER_NAME = "breadcrumbs";
const LEGACY_MCP_SERVER_NAME = "awesome-progress-tracker";
const PACKAGE_SPEC = "github:AndriiLavrekha/breadcrumbs";
const HERMES_SKILL_NAME = "breadcrumbs";
const HERMES_MCP_NAME = MCP_SERVER_NAME;

export interface InitOptions {
  cwd?: string;
  targetDir?: string;
  projectName?: string;
  force?: boolean;
  today?: string;
  homeDir?: string;
}

export interface InitResult {
  targetProgressDir: string;
  createdFiles: string[];
}

export type AgentTarget = "claude" | "codex" | "hermes";

export interface CommandRunnerOptions {
  stdin?: string;
  timeout?: number;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options?: CommandRunnerOptions
) => Promise<{ stdout: string; stderr: string }>;

export interface InstallOptions {
  agent?: AgentTarget;
  homeDir?: string;
  cwd?: string;
  roots?: string;
  mcpOnly?: boolean;
  scope?: InstallScope;
  commandRunner?: CommandRunner;
}

export interface InstallResult {
  agent: AgentTarget;
  writtenFiles: string[];
}

export interface StatusOptions {
  agent?: AgentTarget;
  homeDir?: string;
  cwd?: string;
  commandRunner?: CommandRunner;
}

export interface StatusResult {
  agent: AgentTarget;
  projectInitialized: boolean;
  bootstrapInstalled: boolean;
  mcpConfigured: boolean;
  skillInstalled?: boolean;
  files: Record<string, string>;
}

export type InstallScope = "user" | "project";

export interface UninstallOptions {
  agent?: AgentTarget;
  homeDir?: string;
  commandRunner?: CommandRunner;
}

export interface UninstallResult {
  agent: AgentTarget;
  changedFiles: string[];
}

export interface DoctorCheck {
  name: string;
  ok: boolean;
  message: string;
}

export interface DoctorResult {
  agent: AgentTarget;
  ok: boolean;
  checks: DoctorCheck[];
}

const BOOTSTRAP_START = "<!-- breadcrumbs:start -->";
const BOOTSTRAP_END = "<!-- breadcrumbs:end -->";
const CODEX_MCP_START = "# breadcrumbs:mcp:start";
const CODEX_MCP_END = "# breadcrumbs:mcp:end";
const LEGACY_MARKERS: Record<string, readonly [string, string]> = {
  [BOOTSTRAP_START]: ["<!-- awesome-progress-tracker:start -->", "<!-- awesome-progress-tracker:end -->"],
  [CODEX_MCP_START]: ["# awesome-progress-tracker:mcp:start", "# awesome-progress-tracker:mcp:end"]
};

export const defaultCommandRunner: CommandRunner = async (command, args, options = {}) => {
  const child = spawn(command, args, {
    stdio: "pipe",
    windowsHide: true
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let timeoutId: NodeJS.Timeout | undefined;

  child.stdout.on("data", (chunk: Buffer) => {
    stdoutChunks.push(chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk);
  });

  if (options.stdin !== undefined) {
    child.stdin.write(options.stdin);
  }
  child.stdin.end();

  return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    child.on("error", reject);

    if (options.timeout !== undefined) {
      timeoutId = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out after ${options.timeout}ms: ${command}`));
      }, options.timeout);
    }

    child.on("close", (code, signal) => {
      if (timeoutId) clearTimeout(timeoutId);

      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          signal
            ? `Command failed with signal ${signal}: ${command}`
            : `Command failed with exit code ${code ?? "unknown"}: ${command}\n${stderr || stdout}`.trimEnd()
        )
      );
    });
  });
};

export function helpText(): string {
  return `Breadcrumbs

Usage:
  breadcrumbs install [-g claude|codex|hermes] [--roots <paths>] [--verify]
  breadcrumbs install-mcp [-g claude|codex] [--roots <paths>] [--local] [--verify]
  breadcrumbs install-mcp -g hermes [--roots <paths>] [--verify]
  breadcrumbs doctor [-g claude|codex|hermes] [--json]
  breadcrumbs uninstall [-g claude|codex|hermes]
  breadcrumbs uninstall [-g claude|codex] --scope project
  breadcrumbs status [-g claude|codex|hermes]
  breadcrumbs state list
  breadcrumbs state set [directory] --state opted-in|opted-out|initialized|unknown
  breadcrumbs state reset [directory]
  breadcrumbs init [directory] [--project <name>] [--force]
  breadcrumbs compact [directory] [--write]
  breadcrumbs mcp
  breadcrumbs help

Commands:
  install  Install bootstrap instructions for Claude Code/Codex or Skill + MCP for Hermes.
  install-mcp  Install only MCP configuration; Hermes MCP is profile-managed.
  doctor  Verify the agent-specific install plus project/index state.
  uninstall  Remove managed instructions or skill plus MCP configuration.
  status  Show project and agent-specific installation status.
  state  List, set, or reset per-project opt-in/opt-out state.
  init   Create project-progress/ Markdown files in a project.
  compact  Move old progress history into Archive.md (dry run unless --write).
  mcp    Start the Breadcrumbs MCP stdio server.
  help   Show this help.

Aliases:
  awesome-progress-tracker, project-progress (same commands and data)

Environment:
  PROJECT_PROGRESS_ROOTS  Semicolon-separated roots scanned by the MCP server.
`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function inferProjectName(targetRoot: string): string {
  const name = path.basename(path.resolve(targetRoot));
  return name || "Project";
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function replaceTemplateValues(markdown: string, options: Required<Pick<InitOptions, "projectName" | "today">> & { targetRoot: string }): string {
  return markdown
    .replaceAll("Example Project", options.projectName)
    .replace("path: C:/path/to/project", `path: ${options.targetRoot.replace(/\\/g, "/")}`)
    .replaceAll("2026-06-26", options.today);
}

export async function initProject(options: InitOptions = {}): Promise<InitResult> {
  const cwd = options.cwd ?? process.cwd();
  const targetRoot = path.resolve(cwd, options.targetDir ?? ".");
  const projectName = options.projectName ?? inferProjectName(targetRoot);
  const today = options.today ?? todayIso();
  const targetProgressDir = path.join(targetRoot, "project-progress");

  if ((await pathExists(targetProgressDir)) && !options.force) {
    throw new Error(`project-progress already exists at ${targetProgressDir}. Use --force to overwrite template files.`);
  }

  await fs.mkdir(targetProgressDir, { recursive: true });
  const entries = await fs.readdir(TEMPLATE_DIR, { withFileTypes: true });
  const createdFiles: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

    const sourcePath = path.join(TEMPLATE_DIR, entry.name);
    const targetPath = path.join(targetProgressDir, entry.name);
    if ((await pathExists(targetPath)) && !options.force) {
      throw new Error(`${targetPath} already exists. Use --force to overwrite template files.`);
    }

    const source = await fs.readFile(sourcePath, "utf-8");
    await fs.writeFile(
      targetPath,
      replaceTemplateValues(source, { projectName, targetRoot, today }),
      "utf-8"
    );
    createdFiles.push(targetPath);
  }

  return { targetProgressDir, createdFiles };
}

export async function initProjectAndIndex(options: InitOptions = {}): Promise<InitResult> {
  const result = await initProject(options);
  const progressPath = path.join(result.targetProgressDir, "Progress.md");
  const markdown = await fs.readFile(progressPath, "utf-8");
  await upsertIndexedProject(parseProjectSummary(markdown, progressPath), { homeDir: options.homeDir });
  await setProjectTrackingState(path.resolve(options.cwd ?? process.cwd(), options.targetDir ?? "."), "initialized", {
    homeDir: options.homeDir
  });
  return result;
}

function bootstrapBlock(agent: AgentTarget): string {
  const agentName = agent === "codex" ? "Codex" : "Claude Code";
  return `${BOOTSTRAP_START}
## Breadcrumbs

For multi-step work in ${agentName}, use project-local progress files from Breadcrumbs.

At kickoff for any feature, investigation, refactor, debugging session, deployment, or release work:

1. Check whether \`project-progress/Progress.md\` exists in the current project.
2. If it exists, read the frontmatter and \`Resume Snapshot\` first, then load only the smallest extra sections needed.
3. If it does not exist, ask the user before initializing:
   "This project is not initialized with Breadcrumbs. Do you want me to create \`project-progress/\` here?"
4. Only initialize after the user says yes. Use:
   \`npx --package=${PACKAGE_SPEC} breadcrumbs init . --project "<project name>"\`
5. If the user says no, record a per-project opt-out outside the repo with:
   \`npx --package=${PACKAGE_SPEC} breadcrumbs state set . --state opted-out\`
   Then continue without creating progress files and do not ask again unless the user brings it up.

Never create or overwrite \`project-progress/\` silently. Keep progress updates compact and avoid secrets.

If the user asks you to test Breadcrumbs itself, follow the self-test report format from the package documentation and clearly mark each scenario PASS, FAIL, PARTIAL, or NOT TESTED.
${BOOTSTRAP_END}`;
}

function upsertManagedBlock(existing: string, block: string, start: string, end: string): string {
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`, "m");
  if (pattern.test(existing)) {
    return `${existing.replace(pattern, block).trimEnd()}\n`;
  }
  return `${existing.trimEnd()}${existing.trim() ? "\n\n" : ""}${block}\n`;
}

async function writeManagedBlock(
  filePath: string,
  block: string,
  start = BOOTSTRAP_START,
  end = BOOTSTRAP_END
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  let existing = (await pathExists(filePath)) ? await fs.readFile(filePath, "utf-8") : "";
  const legacy = LEGACY_MARKERS[start];
  if (legacy && existing.includes(legacy[0])) existing = removeManagedBlock(existing, ...legacy);
  await fs.writeFile(filePath, upsertManagedBlock(existing, block, start, end), "utf-8");
}

function removeManagedBlock(existing: string, start: string, end: string): string {
  const pattern = new RegExp(`\\n?${start}[\\s\\S]*?${end}\\n?`, "g");
  return `${existing.replace(pattern, "\n").trimEnd()}\n`;
}

function normalizeRoots(options: Pick<InstallOptions, "cwd" | "roots">): string {
  return options.roots ?? path.resolve(options.cwd ?? process.cwd()).replace(/\\/g, "/");
}

function mcpServerConfig(roots: string) {
  return {
    type: "stdio",
    command: "npx",
    args: ["-y", PACKAGE_SPEC, "mcp"],
    env: {
      PROJECT_PROGRESS_ROOTS: roots
    }
  };
}

function projectMcpConfigPath(cwd = process.cwd()): string {
  return path.join(cwd, ".mcp.json");
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown>> {
  if (!(await pathExists(filePath))) return {};
  const raw = await fs.readFile(filePath, "utf-8");
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

async function installJsonMcpConfig(filePath: string, roots: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const config = await readJsonObject(filePath);
  const mcpServers = config.mcpServers;
  if (!mcpServers || typeof mcpServers !== "object" || Array.isArray(mcpServers)) {
    config.mcpServers = {};
  }
  (config.mcpServers as Record<string, unknown>)[MCP_SERVER_NAME] = mcpServerConfig(roots);
  delete (config.mcpServers as Record<string, unknown>)[LEGACY_MCP_SERVER_NAME];
  await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

async function removeJsonMcpConfig(filePath: string): Promise<boolean> {
  if (!(await pathExists(filePath))) return false;
  const config = await readJsonObject(filePath);
  const mcpServers = config.mcpServers;
  if (!mcpServers || typeof mcpServers !== "object" || Array.isArray(mcpServers)) return false;
  if (!(MCP_SERVER_NAME in mcpServers) && !(LEGACY_MCP_SERVER_NAME in mcpServers)) return false;
  delete (mcpServers as Record<string, unknown>)[MCP_SERVER_NAME];
  delete (mcpServers as Record<string, unknown>)[LEGACY_MCP_SERVER_NAME];
  await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  return true;
}

function codexMcpBlock(roots: string): string {
  return `${CODEX_MCP_START}
[mcp_servers.${MCP_SERVER_NAME}]
command = "npx"
args = ["-y", "${PACKAGE_SPEC}", "mcp"]
startup_timeout_sec = 20

[mcp_servers.${MCP_SERVER_NAME}.env]
PROJECT_PROGRESS_ROOTS = "${roots.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"
${CODEX_MCP_END}`;
}

async function installCodexMcpConfig(filePath: string, roots: string): Promise<void> {
  await writeManagedBlock(filePath, codexMcpBlock(roots), CODEX_MCP_START, CODEX_MCP_END);
}

async function removeTextBlock(filePath: string, start: string, end: string): Promise<boolean> {
  if (!(await pathExists(filePath))) return false;
  const existing = await fs.readFile(filePath, "utf-8");
  const legacy = LEGACY_MARKERS[start];
  if (!existing.includes(start) && !(legacy && existing.includes(legacy[0]))) return false;
  let updated = removeManagedBlock(existing, start, end);
  if (legacy) updated = removeManagedBlock(updated, ...legacy);
  await fs.writeFile(filePath, updated, "utf-8");
  return true;
}

async function fileContains(filePath: string, value: string): Promise<boolean> {
  if (!(await pathExists(filePath))) return false;
  const content = await fs.readFile(filePath, "utf-8");
  const legacy = LEGACY_MARKERS[value];
  return content.includes(value) || Boolean(legacy && content.includes(legacy[0]));
}

function hermesSkillUrl(): string {
  return `https://raw.githubusercontent.com/AndriiLavrekha/breadcrumbs/v${PACKAGE_VERSION}/skills/breadcrumbs/SKILL.md`;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}

function parseHermesFirstColumnList(output: string): Set<string> {
  const names = new Set<string>();
  for (const line of stripAnsi(output).split(/\r?\n/)) {
    const trimmed = line.trimStart();
    if (!trimmed) continue;
    if (/^[\u2500-\u257F\s]+$/u.test(trimmed)) continue;

    const boxTableCells = [...trimmed.matchAll(/│([^│]*)/g)].map((match) => match[1].trim()).filter(Boolean);
    const firstColumn = boxTableCells[0] ?? trimmed.match(/^(\S+)/)?.[1];
    if (!firstColumn) continue;
    if (firstColumn.toLowerCase() === "name") continue;
    names.add(firstColumn);
  }
  return names;
}

function parseHermesSkillList(output: string): Set<string> {
  return parseHermesFirstColumnList(output);
}

function parseHermesMcpList(output: string): Set<string> {
  return parseHermesFirstColumnList(output);
}

function formatHermesCommand(args: string[]): string {
  return ["hermes", ...args].join(" ");
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runHermesCommand(
  commandRunner: CommandRunner,
  args: string[],
  options?: CommandRunnerOptions
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await commandRunner("hermes", args, options);
  } catch (error) {
    throw new Error(`Failed Hermes command: ${formatHermesCommand(args)}\n${asErrorMessage(error)}`);
  }
}

export async function installAgent(options: InstallOptions = {}): Promise<InstallResult> {
  const agent = options.agent ?? "claude";
  const homeDir = options.homeDir ?? process.env.HOME ?? process.env.USERPROFILE;
  if (!homeDir) throw new Error("Could not determine the user home directory.");

  const writtenFiles: string[] = [];
  const roots = normalizeRoots(options);
  const scope = options.scope ?? "user";

  if (agent === "hermes" && scope === "project") {
    throw new Error(
      "Hermes only supports profile-managed MCP; project-local MCP install and uninstall are not supported."
    );
  }

  if (scope === "project") {
    const projectConfig = projectMcpConfigPath(options.cwd);
    await installJsonMcpConfig(projectConfig, roots);
    return { agent, writtenFiles: [projectConfig] };
  }

  if (agent === "claude") {
    if (!options.mcpOnly) {
      const claudeMemory = path.join(homeDir, ".claude", "CLAUDE.md");
      await writeManagedBlock(claudeMemory, bootstrapBlock(agent));
      writtenFiles.push(claudeMemory);
    }

    const claudeConfig = path.join(homeDir, ".claude.json");
    await installJsonMcpConfig(claudeConfig, roots);
    writtenFiles.push(claudeConfig);
    return { agent, writtenFiles };
  }

  if (agent === "hermes") {
    const commandRunner = options.commandRunner ?? defaultCommandRunner;
    const collisions: string[] = [];
    let skillAlreadyInstalled = false;

    if (!options.mcpOnly) {
      const skillList = await runHermesCommand(commandRunner, ["skills", "list", "--source", "hub"]);
      const skills = parseHermesSkillList(skillList.stdout);
      skillAlreadyInstalled = skills.has(HERMES_SKILL_NAME);
      if (skillAlreadyInstalled) collisions.push(`Hermes skill already exists: ${HERMES_SKILL_NAME}`);
      if (skills.has("project-progress")) {
        collisions.push("Legacy Hermes skill exists. Run `breadcrumbs uninstall -g hermes` before reinstalling.");
      }
    }

    const mcpList = await runHermesCommand(commandRunner, ["mcp", "list"]);
    if (parseHermesMcpList(mcpList.stdout).has(HERMES_MCP_NAME)) {
      collisions.push(`Hermes MCP server already exists: ${HERMES_MCP_NAME}`);
    }
    if (parseHermesMcpList(mcpList.stdout).has(LEGACY_MCP_SERVER_NAME)) {
      collisions.push("Legacy Hermes MCP server exists. Run `breadcrumbs uninstall -g hermes` before reinstalling.");
    }

    if (collisions.length > 0) {
      throw new Error(collisions.join("\n"));
    }

    if (!options.mcpOnly) {
      await runHermesCommand(commandRunner, ["skills", "install", hermesSkillUrl(), "--name", HERMES_SKILL_NAME, "--yes"]);
      writtenFiles.push(`Hermes skill: ${HERMES_SKILL_NAME}`);
    }

    try {
      await runHermesCommand(commandRunner, [
        "mcp",
        "add",
        HERMES_MCP_NAME,
        "--command",
        "npx",
        "--env",
        `PROJECT_PROGRESS_ROOTS=${roots}`,
        "--args",
        "-y",
        PACKAGE_SPEC,
        "mcp"
      ], { stdin: "y\n" });

      const updatedMcpList = await runHermesCommand(commandRunner, ["mcp", "list"]);
      if (!parseHermesMcpList(updatedMcpList.stdout).has(HERMES_MCP_NAME)) {
        throw new Error(`Hermes MCP server was not present after add: ${HERMES_MCP_NAME}`);
      }
    } catch (error) {
      if (!options.mcpOnly) {
        try {
          await runHermesCommand(commandRunner, ["skills", "uninstall", HERMES_SKILL_NAME], { stdin: "y\n" });
        } catch (rollbackError) {
          const message = asErrorMessage(error);
          const rollbackMessage = asErrorMessage(rollbackError);
          throw new Error(`${message}\nRollback failed: ${rollbackMessage}`);
        }
      }
      throw error;
    }

    writtenFiles.push(`Hermes MCP server: ${HERMES_MCP_NAME}`);
    return { agent, writtenFiles };
  }

  if (!options.mcpOnly) {
    const codexAgents = path.join(homeDir, ".codex", "AGENTS.md");
    await writeManagedBlock(codexAgents, bootstrapBlock(agent));
    writtenFiles.push(codexAgents);

    const skillSource = path.join(PACKAGE_ROOT, "skills", "breadcrumbs", "SKILL.md");
    const skillTarget = path.join(homeDir, ".codex", "skills", "breadcrumbs", "SKILL.md");
    await fs.mkdir(path.dirname(skillTarget), { recursive: true });
    await fs.copyFile(skillSource, skillTarget);
    await fs.rm(path.join(homeDir, ".codex", "skills", "awesome-progress-tracker", "SKILL.md"), { force: true });
    writtenFiles.push(skillTarget);
  }

  const codexConfig = path.join(homeDir, ".codex", "config.toml");
  await installCodexMcpConfig(codexConfig, roots);
  writtenFiles.push(codexConfig);

  return { agent, writtenFiles };
}

export async function uninstallAgent(options: UninstallOptions = {}): Promise<UninstallResult> {
  const agent = options.agent ?? "claude";
  const homeDir = options.homeDir ?? process.env.HOME ?? process.env.USERPROFILE;
  if (!homeDir) throw new Error("Could not determine the user home directory.");

  const changedFiles: string[] = [];

  if (agent === "claude") {
    const claudeMemory = path.join(homeDir, ".claude", "CLAUDE.md");
    if (await removeTextBlock(claudeMemory, BOOTSTRAP_START, BOOTSTRAP_END)) changedFiles.push(claudeMemory);
    const claudeConfig = path.join(homeDir, ".claude.json");
    if (await removeJsonMcpConfig(claudeConfig)) changedFiles.push(claudeConfig);
    return { agent, changedFiles };
  }

  if (agent === "hermes") {
    const commandRunner = options.commandRunner ?? defaultCommandRunner;
    const skillList = await runHermesCommand(commandRunner, ["skills", "list", "--source", "hub"]);
    const mcpList = await runHermesCommand(commandRunner, ["mcp", "list"]);
    const skills = parseHermesSkillList(skillList.stdout);
    const servers = parseHermesMcpList(mcpList.stdout);

    for (const name of [HERMES_MCP_NAME, LEGACY_MCP_SERVER_NAME]) {
      if (!servers.has(name)) continue;
      await runHermesCommand(commandRunner, ["mcp", "remove", name], { stdin: "y\n" });
      changedFiles.push(`Hermes MCP server: ${name}`);
    }

    for (const name of [HERMES_SKILL_NAME, "project-progress"]) {
      if (!skills.has(name)) continue;
      await runHermesCommand(commandRunner, ["skills", "uninstall", name], { stdin: "y\n" });
      changedFiles.push(`Hermes skill: ${name}`);
    }

    return { agent, changedFiles };
  }

  const codexAgents = path.join(homeDir, ".codex", "AGENTS.md");
  if (await removeTextBlock(codexAgents, BOOTSTRAP_START, BOOTSTRAP_END)) changedFiles.push(codexAgents);

  for (const name of ["breadcrumbs", "awesome-progress-tracker"]) {
    const codexSkill = path.join(homeDir, ".codex", "skills", name, "SKILL.md");
    if (await pathExists(codexSkill)) {
      await fs.unlink(codexSkill);
      changedFiles.push(codexSkill);
    }
  }

  const codexConfig = path.join(homeDir, ".codex", "config.toml");
  if (await removeTextBlock(codexConfig, CODEX_MCP_START, CODEX_MCP_END)) changedFiles.push(codexConfig);

  return { agent, changedFiles };
}

export async function uninstallProjectMcp(cwd = process.cwd()): Promise<UninstallResult> {
  const projectConfig = projectMcpConfigPath(cwd);
  const changedFiles: string[] = [];
  if (await removeJsonMcpConfig(projectConfig)) changedFiles.push(projectConfig);
  return { agent: "claude", changedFiles };
}

export async function readStatus(options: StatusOptions = {}): Promise<StatusResult> {
  const agent = options.agent ?? "claude";
  const homeDir = options.homeDir ?? process.env.HOME ?? process.env.USERPROFILE;
  if (!homeDir) throw new Error("Could not determine the user home directory.");

  const cwd = options.cwd ?? process.cwd();
  const projectProgress = path.join(cwd, "project-progress", "Progress.md");

  if (agent === "claude") {
    const claudeMemory = path.join(homeDir, ".claude", "CLAUDE.md");
    const claudeConfig = path.join(homeDir, ".claude.json");
    const config = await readJsonObject(claudeConfig);
    const mcpServers = config.mcpServers;
    return {
      agent,
      projectInitialized: await pathExists(projectProgress),
      bootstrapInstalled: await fileContains(claudeMemory, BOOTSTRAP_START),
      mcpConfigured: Boolean(
        mcpServers &&
          typeof mcpServers === "object" &&
          !Array.isArray(mcpServers) &&
          (MCP_SERVER_NAME in mcpServers || LEGACY_MCP_SERVER_NAME in mcpServers)
      ),
      files: {
        bootstrap: claudeMemory,
        mcpConfig: claudeConfig,
        projectProgress
      }
    };
  }

  if (agent === "hermes") {
    const commandRunner = options.commandRunner ?? defaultCommandRunner;
    const skillList = await runHermesCommand(commandRunner, ["skills", "list", "--source", "hub"]);
    const mcpList = await runHermesCommand(commandRunner, ["mcp", "list"]);
    const skills = parseHermesSkillList(skillList.stdout);
    const servers = parseHermesMcpList(mcpList.stdout);
    const skillName = !skills.has(HERMES_SKILL_NAME) && skills.has("project-progress") ? "project-progress" : HERMES_SKILL_NAME;
    const mcpName = !servers.has(HERMES_MCP_NAME) && servers.has(LEGACY_MCP_SERVER_NAME) ? LEGACY_MCP_SERVER_NAME : HERMES_MCP_NAME;
    return {
      agent,
      projectInitialized: await pathExists(projectProgress),
      bootstrapInstalled: false,
      mcpConfigured: servers.has(mcpName),
      skillInstalled: skills.has(skillName),
      files: {
        skill: `Hermes skill: ${skillName}`,
        mcpConfig: `Hermes MCP server: ${mcpName}`,
        projectProgress
      }
    };
  }

  const codexAgents = path.join(homeDir, ".codex", "AGENTS.md");
  let codexSkill = path.join(homeDir, ".codex", "skills", "breadcrumbs", "SKILL.md");
  const legacySkill = path.join(homeDir, ".codex", "skills", "awesome-progress-tracker", "SKILL.md");
  if (!(await pathExists(codexSkill)) && await pathExists(legacySkill)) codexSkill = legacySkill;
  const codexConfig = path.join(homeDir, ".codex", "config.toml");
  return {
    agent,
    projectInitialized: await pathExists(projectProgress),
    bootstrapInstalled: await fileContains(codexAgents, BOOTSTRAP_START),
    mcpConfigured: await fileContains(codexConfig, CODEX_MCP_START),
    skillInstalled: await pathExists(codexSkill),
    files: {
      bootstrap: codexAgents,
      skill: codexSkill,
      mcpConfig: codexConfig,
      projectProgress
    }
  };
}

async function checkNpx(): Promise<DoctorCheck> {
  if (process.env.npm_execpath) {
    return { name: "npx", ok: true, message: "npm/npx runtime is available" };
  }

  try {
    await execFileAsync("npx", ["--version"], { timeout: 10000 });
    return { name: "npx", ok: true, message: "npx is available" };
  } catch {
    return { name: "npx", ok: false, message: "npx is not available on PATH" };
  }
}

async function checkIndexWritable(homeDir: string): Promise<DoctorCheck> {
  const dir = path.join(homeDir, ".awesome-progress-tracker");
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.access(dir);
    return { name: "index", ok: true, message: `${dir} is available` };
  } catch {
    return { name: "index", ok: false, message: `${dir} is not writable` };
  }
}

export async function runDoctor(options: StatusOptions = {}): Promise<DoctorResult> {
  const agent = options.agent ?? "claude";
  const homeDir = options.homeDir ?? process.env.HOME ?? process.env.USERPROFILE;
  if (!homeDir) throw new Error("Could not determine the user home directory.");

  if (agent === "hermes") {
    const commandRunner = options.commandRunner ?? defaultCommandRunner;
    const projectPath = path.join(options.cwd ?? process.cwd(), "project-progress", "Progress.md");
    let hermesAvailable = false;
    let hermesMessage = "Hermes CLI is available";
    try {
      await runHermesCommand(commandRunner, ["--version"]);
      hermesAvailable = true;
    } catch (error) {
      hermesMessage = asErrorMessage(error);
    }

    let skillInstalled = false;
    let skillMessage = "Hermes skill is missing";
    let mcpConfigured = false;
    let mcpMessage = "Hermes MCP server is missing";
    let mcpName = HERMES_MCP_NAME;

    if (hermesAvailable) {
      try {
        const skillList = await runHermesCommand(commandRunner, ["skills", "list", "--source", "hub"]);
        const skills = parseHermesSkillList(skillList.stdout);
        skillInstalled = skills.has(HERMES_SKILL_NAME) || skills.has("project-progress");
        skillMessage = skillInstalled ? "Hermes skill is installed" : "Hermes skill is missing";
      } catch (error) {
        skillMessage = asErrorMessage(error);
      }

      try {
        const mcpList = await runHermesCommand(commandRunner, ["mcp", "list"]);
        const servers = parseHermesMcpList(mcpList.stdout);
        if (!servers.has(mcpName) && servers.has(LEGACY_MCP_SERVER_NAME)) mcpName = LEGACY_MCP_SERVER_NAME;
        mcpConfigured = servers.has(mcpName);
        mcpMessage = mcpConfigured ? "Hermes MCP server is installed" : "Hermes MCP server is missing";
      } catch (error) {
        mcpMessage = asErrorMessage(error);
      }
    } else {
      skillMessage = hermesMessage;
      mcpMessage = hermesMessage;
    }

    let mcpConnectionOk = false;
    let mcpConnectionMessage = mcpConfigured
      ? "Hermes MCP connection has not been tested yet"
      : "Hermes MCP server is not configured";

    if (!hermesAvailable) {
      mcpConnectionMessage = hermesMessage;
    } else if (mcpConfigured) {
      try {
        await runHermesCommand(commandRunner, ["mcp", "test", mcpName]);
        mcpConnectionOk = true;
        mcpConnectionMessage = "Hermes MCP connection test passed";
      } catch (error) {
        mcpConnectionMessage = asErrorMessage(error);
      }
    }

    const checks: DoctorCheck[] = [
      { name: "hermes", ok: hermesAvailable, message: hermesMessage },
      { name: "skill", ok: skillInstalled, message: skillMessage },
      { name: "mcp", ok: mcpConfigured, message: mcpMessage },
      { name: "mcp-connection", ok: mcpConnectionOk, message: mcpConnectionMessage },
      await checkIndexWritable(homeDir),
      {
        name: "project",
        ok: true,
        message: (await pathExists(projectPath))
          ? "current project has project-progress/Progress.md"
          : "current project is not initialized; the agent should ask before initializing"
      }
    ];

    return {
      agent,
      ok: checks.every((check) => check.ok),
      checks
    };
  }

  const status = await readStatus(options);
  const checks: DoctorCheck[] = [
    await checkNpx(),
    {
      name: "bootstrap",
      ok: status.bootstrapInstalled,
      message: status.bootstrapInstalled ? "bootstrap instructions are installed" : "bootstrap instructions are missing"
    },
    {
      name: "mcp",
      ok: status.mcpConfigured,
      message: status.mcpConfigured ? "MCP config is installed" : "MCP config is missing"
    },
    await checkIndexWritable(homeDir),
    {
      name: "project",
      ok: true,
      message: status.projectInitialized
        ? "current project has project-progress/Progress.md"
        : "current project is not initialized; the agent should ask before initializing"
    }
  ];

  if (agent === "codex") {
    checks.push({
      name: "skill",
      ok: status.skillInstalled === true,
      message: status.skillInstalled ? "Codex skill is installed" : "Codex skill is missing"
    });
  }

  return {
    agent,
    ok: checks.every((check) => check.ok),
    checks
  };
}

interface ParsedArgs {
  command: string;
  stateCommand?: string;
  targetDir?: string;
  projectName?: string;
  agent?: AgentTarget;
  roots?: string;
  scope?: InstallScope;
  trackingState?: ProjectTrackingState;
  verify: boolean;
  force: boolean;
  json?: boolean;
  write?: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command = "help", ...rest] = argv;
  const parsed: ParsedArgs = { command, force: false, verify: false };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--force") {
      parsed.force = true;
    } else if (arg === "--verify") {
      parsed.verify = true;
    } else if (arg === "--write") {
      parsed.write = true;
    } else if (arg === "--json") {
      parsed.json = true;
    } else if (arg === "--local") {
      parsed.scope = "project";
    } else if (arg === "--project") {
      const value = rest[index + 1];
      if (!value) throw new Error("--project requires a value");
      parsed.projectName = value;
      index += 1;
    } else if (arg.startsWith("--project=")) {
      parsed.projectName = arg.slice("--project=".length);
    } else if (arg === "-g" || arg === "--agent") {
      const value = rest[index + 1];
      if (value !== "claude" && value !== "codex" && value !== "hermes") {
        throw new Error(`${arg} requires claude, codex, or hermes`);
      }
      parsed.agent = value;
      index += 1;
    } else if (arg.startsWith("--agent=")) {
      const value = arg.slice("--agent=".length);
      if (value !== "claude" && value !== "codex" && value !== "hermes") {
        throw new Error("--agent requires claude, codex, or hermes");
      }
      parsed.agent = value;
    } else if (arg === "--roots") {
      const value = rest[index + 1];
      if (!value) throw new Error("--roots requires a value");
      parsed.roots = value;
      index += 1;
    } else if (arg.startsWith("--roots=")) {
      parsed.roots = arg.slice("--roots=".length);
    } else if (arg === "--scope") {
      const value = rest[index + 1];
      if (value !== "user" && value !== "project") {
        throw new Error("--scope requires user or project");
      }
      parsed.scope = value;
      index += 1;
    } else if (arg.startsWith("--scope=")) {
      const value = arg.slice("--scope=".length);
      if (value !== "user" && value !== "project") {
        throw new Error("--scope requires user or project");
      }
      parsed.scope = value;
    } else if (arg === "--state") {
      const value = rest[index + 1];
      if (!isTrackingState(value)) throw new Error("--state requires opted-in, opted-out, initialized, or unknown");
      parsed.trackingState = value;
      index += 1;
    } else if (arg.startsWith("--state=")) {
      const value = arg.slice("--state=".length);
      if (!isTrackingState(value)) throw new Error("--state requires opted-in, opted-out, initialized, or unknown");
      parsed.trackingState = value;
    } else if (parsed.command === "state" && !parsed.stateCommand) {
      parsed.stateCommand = arg;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!parsed.targetDir) {
      parsed.targetDir = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (
    parsed.agent === "hermes" &&
    parsed.scope === "project" &&
    (parsed.command === "install" || parsed.command === "install-mcp" || parsed.command === "uninstall")
  ) {
    throw new Error(
      "Hermes only supports profile-managed MCP; project-local MCP install and uninstall are not supported."
    );
  }

  return parsed;
}

function isTrackingState(value: string | undefined): value is ProjectTrackingState {
  return value === "unknown" || value === "opted-in" || value === "opted-out" || value === "initialized";
}

export interface ProjectStateCommandOptions extends ProjectStateOptions {
  targetDir?: string;
  state?: ProjectTrackingState;
}

function targetForState(options: Pick<ProjectStateCommandOptions, "targetDir">): string {
  return path.resolve(options.targetDir ?? process.cwd());
}

export async function listStateEntries(options: ProjectStateOptions = {}): Promise<ProjectTrackingStateEntry[]> {
  return listProjectTrackingStates(options);
}

export async function setProjectState(options: ProjectStateCommandOptions): Promise<ProjectTrackingStateEntry> {
  if (!options.state) throw new Error("state set requires --state");
  return setProjectTrackingState(targetForState(options), options.state, options);
}

export async function resetProjectState(options: ProjectStateCommandOptions = {}): Promise<{ reset: boolean; path: string }> {
  const target = targetForState(options);
  return {
    reset: await resetProjectTrackingState(target, options),
    path: target.replace(/\\/g, "/")
  };
}

function printDoctor(result: DoctorResult, json = false): void {
  if (json) {
    console.log(JSON.stringify(result));
    return;
  }
  console.log(`doctor_agent: ${result.agent}`);
  console.log(`doctor_ok: ${result.ok}`);
  for (const check of result.checks) {
    console.log(`${check.ok ? "ok" : "fail"} ${check.name}: ${check.message}`);
  }
}

export interface CompactReport {
  progressDir: string;
  written: boolean;
  files: Array<{ file: string; beforeBytes: number; afterBytes: number; moved: string[] }>;
  folded: number;
  repaired: string[];
  notes: string[];
}

export async function compactProject(options: { targetDir?: string; write?: boolean; date?: string } = {}): Promise<CompactReport> {
  const progressDir = path.join(path.resolve(options.targetDir ?? process.cwd()), "project-progress");
  const sources = await readProgressFiles(progressDir);
  if (!sources.has("Progress.md")) {
    throw new Error(`No project-progress/Progress.md under ${path.dirname(progressDir)}`);
  }

  const plan = planCompaction(
    new Map([...sources].map(([name, source]) => [name, source.text])),
    options.date ?? new Date().toISOString().slice(0, 10)
  );
  const report: CompactReport = {
    progressDir,
    written: false,
    files: [...sources].map(([name, source]) => ({
      file: name,
      beforeBytes: Buffer.byteLength(source.raw, "utf-8"),
      afterBytes: Buffer.byteLength((plan.outputs.get(name) ?? source.text).replace(/\n/g, source.eol), "utf-8"),
      moved: plan.moved.get(name) ?? []
    })),
    folded: plan.folded.length,
    repaired: plan.repaired,
    notes: plan.notes
  };
  if (!options.write || plan.outputs.size === 0) return report;

  const written: string[] = [];
  try {
    // Any change since planning means another writer is active; stop before the archive grows.
    for (const [name, source] of sources) {
      const filePath = path.join(progressDir, name);
      if (sha256(await fs.readFile(filePath, "utf-8")) !== sha256(source.raw)) throw new ProgressConflictError(filePath);
    }
    // Archive first: a failure after this point duplicates text in Archive.md instead of losing it.
    if (plan.run || plan.folded.length > 0) {
      const eol = sources.get("Progress.md")!.eol;
      await updateArchiveFile(progressDir, (current) =>
        applyArchive(current.replace(/\r\n/g, "\n"), plan).replace(/\n/g, eol)
      );
      written.push("Archive.md");
    }
    for (const [name, text] of plan.outputs) {
      const source = sources.get(name)!;
      await writeFileAtomic(path.join(progressDir, name), text.replace(/\n/g, source.eol), sha256(source.raw));
      written.push(name);
    }
  } catch (error) {
    if (error instanceof ProgressConflictError) {
      throw new Error(withWritten(`${path.basename(error.filePath)} changed while compact was running; rerun compact.`, written));
    }
    if (written.length > 0 && error instanceof Error) throw new Error(withWritten(error.message, written));
    throw error;
  }
  return { ...report, written: true };
}

// A failure after the first write leaves the folder half-compacted; say which files already changed.
export function withWritten(message: string, written: string[]): string {
  return written.length > 0 ? `${message} Already written: ${written.join(", ")}.` : message;
}

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  const parsed = parseArgs(argv);

  if (parsed.command === "help" || parsed.command === "--help" || parsed.command === "-h") {
    console.log(helpText());
    return 0;
  }

  if (parsed.command === "install") {
    const result = await installAgent({ agent: parsed.agent, roots: parsed.roots, scope: parsed.scope });
    if (result.agent === "hermes") {
      console.log("Installed Breadcrumbs Skill + MCP for Hermes.");
    } else {
      console.log(`Installed Breadcrumbs bootstrap for ${result.agent}.`);
    }
    for (const file of result.writtenFiles) {
      console.log(`- ${file}`);
    }
    if (result.agent === "hermes") {
      console.log("Restart Hermes so it reloads the skill and MCP server.");
      console.log(
        "Run `breadcrumbs status -g hermes` and `breadcrumbs doctor -g hermes` to verify setup."
      );
    } else {
      console.log("Restart Claude Code/Codex so it reloads bootstrap instructions and MCP config.");
      console.log("Run `breadcrumbs status` or `breadcrumbs doctor` to verify setup.");
    }
    if (parsed.verify) {
      printDoctor(await runDoctor({ agent: parsed.agent }));
    }
    return 0;
  }

  if (parsed.command === "install-mcp") {
    const result = await installAgent({
      agent: parsed.agent,
      roots: parsed.roots,
      scope: parsed.scope ?? "user",
      mcpOnly: true
    });
    if (result.agent === "hermes") {
      console.log("Installed Breadcrumbs MCP server for Hermes.");
    } else {
      console.log(`Installed Breadcrumbs MCP config for ${result.agent}.`);
    }
    for (const file of result.writtenFiles) {
      console.log(`- ${file}`);
    }
    if (result.agent === "hermes") {
      console.log("Restart Hermes so it reloads the MCP server.");
      console.log(
        "Run `breadcrumbs status -g hermes` and `breadcrumbs doctor -g hermes` to verify setup."
      );
    } else {
      console.log("Restart Claude Code/Codex so it reloads MCP config.");
    }
    if (parsed.verify) {
      printDoctor(await runDoctor({ agent: parsed.agent }));
    }
    return 0;
  }

  if (parsed.command === "doctor") {
    const result = await runDoctor({ agent: parsed.agent });
    printDoctor(result, parsed.json);
    return result.ok ? 0 : 1;
  }

  if (parsed.command === "uninstall") {
    const result = parsed.scope === "project"
      ? await uninstallProjectMcp()
      : await uninstallAgent({ agent: parsed.agent });
    if (result.agent === "hermes") {
      console.log("Removed Breadcrumbs Skill + MCP for Hermes.");
    } else {
      console.log(`Removed Breadcrumbs bootstrap for ${result.agent}.`);
    }
    for (const file of result.changedFiles) {
      console.log(`- ${file}`);
    }
    return 0;
  }

  if (parsed.command === "status") {
    const status = await readStatus({ agent: parsed.agent });
    console.log(`agent: ${status.agent}`);
    console.log(`project_initialized: ${status.projectInitialized}`);
    console.log(`bootstrap_installed: ${status.bootstrapInstalled}`);
    console.log(`mcp_configured: ${status.mcpConfigured}`);
    if (status.skillInstalled !== undefined) {
      console.log(`skill_installed: ${status.skillInstalled}`);
    }
    for (const [label, file] of Object.entries(status.files)) {
      console.log(`${label}: ${file}`);
    }
    return 0;
  }

  if (parsed.command === "state") {
    const subcommand = parsed.stateCommand ?? "list";
    if (subcommand === "list") {
      const entries = await listStateEntries();
      if (entries.length === 0) {
        console.log("No project tracking state recorded.");
      } else {
        for (const entry of entries) {
          console.log(`${entry.state}\t${entry.path}\t${entry.updatedAt}`);
        }
      }
      return 0;
    }
    if (subcommand === "set") {
      const entry = await setProjectState({
        targetDir: parsed.targetDir,
        state: parsed.trackingState
      });
      console.log(`state: ${entry.state}`);
      console.log(`project: ${entry.path}`);
      return 0;
    }
    if (subcommand === "reset") {
      const result = await resetProjectState({ targetDir: parsed.targetDir });
      console.log(`reset: ${result.reset}`);
      console.log(`project: ${result.path}`);
      return 0;
    }
    throw new Error("state requires list, set, or reset");
  }

  if (parsed.command === "init") {
    const result = await initProjectAndIndex({
      targetDir: parsed.targetDir,
      projectName: parsed.projectName,
      force: parsed.force
    });
    console.log(`Initialized ${result.targetProgressDir}`);
    return 0;
  }

  if (parsed.command === "compact") {
    const report = await compactProject({ targetDir: parsed.targetDir, write: parsed.write });
    const noBlocksMoved =
      report.folded === 0 && report.repaired.length === 0 && report.files.every((file) => file.moved.length === 0);
    console.log(
      report.written
        ? noBlocksMoved
          ? "compact: written (no blocks moved)"
          : "compact: written"
        : parsed.write
          ? "compact: nothing to change"
          : "compact: dry run, nothing written (add --write to apply)"
    );
    for (const file of report.files) {
      console.log(`${file.file}: ${formatKb(file.beforeBytes)} -> ${formatKb(file.afterBytes)}, ${file.moved.length} blocks moved`);
      for (const heading of file.moved) console.log(`  - ${heading}`);
    }
    if (report.folded > 0) console.log(`Done: ${report.folded} lines folded into Archive.md`);
    for (const name of report.repaired) console.log(`repaired garbled characters: ${name}`);
    for (const note of report.notes) console.log(`note: ${note}`);
    return 0;
  }

  if (parsed.command === "mcp") {
    await runMcpServer();
    return 0;
  }

  throw new Error(`Unknown command: ${parsed.command}\n\n${helpText()}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
