#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseProjectSummary } from "./mcp/markdown.js";
import { upsertIndexedProject } from "./mcp/index.js";
import { main as runMcpServer } from "./mcp/server.js";
import {
  listProjectTrackingStates,
  resetProjectTrackingState,
  setProjectTrackingState
} from "./project-state.js";
import type { ProjectStateOptions, ProjectTrackingState, ProjectTrackingStateEntry } from "./project-state.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function findPackageRoot(): string {
  const candidates = [
    path.resolve(__dirname, ".."),
    path.resolve(__dirname, "..", ".."),
    process.cwd()
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "templates", "project-progress"))) {
      return candidate;
    }
  }

  return path.resolve(__dirname, "..", "..");
}

const PACKAGE_ROOT = findPackageRoot();
const execFileAsync = promisify(execFile);
const TEMPLATE_DIR = path.join(PACKAGE_ROOT, "templates", "project-progress");
const MCP_SERVER_NAME = "awesome-progress-tracker";
const PACKAGE_SPEC = "github:AndriiLavrekha/awesome-progress-tracker";

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

const BOOTSTRAP_START = "<!-- awesome-progress-tracker:start -->";
const BOOTSTRAP_END = "<!-- awesome-progress-tracker:end -->";
const CODEX_MCP_START = "# awesome-progress-tracker:mcp:start";
const CODEX_MCP_END = "# awesome-progress-tracker:mcp:end";

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
  return `Project Progress

Usage:
  awesome-progress-tracker install [-g claude|codex|hermes] [--roots <paths>] [--verify]
  awesome-progress-tracker install-mcp [-g claude|codex|hermes] [--roots <paths>] [--local] [--verify]
  awesome-progress-tracker doctor [-g claude|codex|hermes] [--json]
  awesome-progress-tracker uninstall [-g claude|codex|hermes] [--scope project]
  awesome-progress-tracker status [-g claude|codex|hermes]
  awesome-progress-tracker state list
  awesome-progress-tracker state set [directory] --state opted-in|opted-out|initialized|unknown
  awesome-progress-tracker state reset [directory]
  awesome-progress-tracker init [directory] [--project <name>] [--force]
  awesome-progress-tracker mcp
  awesome-progress-tracker help

Commands:
  install  Install global bootstrap instructions for Claude Code or Codex.
  install-mcp  Install only MCP configuration.
  doctor  Verify npx, bootstrap, MCP config, and project/index state.
  uninstall  Remove installed bootstrap instructions and MCP config.
  status  Show project, bootstrap, and MCP installation status.
  state  List, set, or reset per-project opt-in/opt-out state.
  init   Create project-progress/ Markdown files in a project.
  mcp    Start the Project Progress MCP stdio server.
  help   Show this help.

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
## Awesome Progress Tracker

For multi-step work in ${agentName}, use project-local progress files from Awesome Progress Tracker.

At kickoff for any feature, investigation, refactor, debugging session, deployment, or release work:

1. Check whether \`project-progress/Progress.md\` exists in the current project.
2. If it exists, read the frontmatter and \`Resume Snapshot\` first, then load only the smallest extra sections needed.
3. If it does not exist, ask the user before initializing:
   "This project is not initialized with Awesome Progress Tracker. Do you want me to create \`project-progress/\` here?"
4. Only initialize after the user says yes. Use:
   \`npx github:AndriiLavrekha/awesome-progress-tracker init . --project "<project name>"\`
5. If the user says no, record a per-project opt-out outside the repo with:
   \`npx github:AndriiLavrekha/awesome-progress-tracker state set . --state opted-out\`
   Then continue without creating progress files and do not ask again unless the user brings it up.

Never create or overwrite \`project-progress/\` silently. Keep progress updates compact and avoid secrets.

If the user asks you to test Awesome Progress Tracker itself, follow the self-test report format from the package documentation and clearly mark each scenario PASS, FAIL, PARTIAL, or NOT TESTED.
${BOOTSTRAP_END}`;
}

function upsertManagedBlock(existing: string, block: string): string {
  const pattern = new RegExp(`${BOOTSTRAP_START}[\\s\\S]*?${BOOTSTRAP_END}`, "m");
  if (pattern.test(existing)) {
    return `${existing.replace(pattern, block).trimEnd()}\n`;
  }
  return `${existing.trimEnd()}${existing.trim() ? "\n\n" : ""}${block}\n`;
}

async function writeManagedBlock(filePath: string, block: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const existing = (await pathExists(filePath)) ? await fs.readFile(filePath, "utf-8") : "";
  await fs.writeFile(filePath, upsertManagedBlock(existing, block), "utf-8");
}

function removeManagedBlock(existing: string, start: string, end: string): string {
  const pattern = new RegExp(`\\n?${start}[\\s\\S]*?${end}\\n?`, "m");
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

async function installProjectMcpConfig(filePath: string, roots: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const config = await readJsonObject(filePath);
  const mcpServers = config.mcpServers;
  if (!mcpServers || typeof mcpServers !== "object" || Array.isArray(mcpServers)) {
    config.mcpServers = {};
  }
  (config.mcpServers as Record<string, unknown>)[MCP_SERVER_NAME] = mcpServerConfig(roots);
  await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

async function removeJsonMcpConfig(filePath: string): Promise<boolean> {
  if (!(await pathExists(filePath))) return false;
  const config = await readJsonObject(filePath);
  const mcpServers = config.mcpServers;
  if (!mcpServers || typeof mcpServers !== "object" || Array.isArray(mcpServers)) return false;
  if (!(MCP_SERVER_NAME in mcpServers)) return false;
  delete (mcpServers as Record<string, unknown>)[MCP_SERVER_NAME];
  await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  return true;
}

async function installClaudeMcpConfig(filePath: string, roots: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const config = await readJsonObject(filePath);
  const mcpServers = config.mcpServers;
  if (!mcpServers || typeof mcpServers !== "object" || Array.isArray(mcpServers)) {
    config.mcpServers = {};
  }
  (config.mcpServers as Record<string, unknown>)[MCP_SERVER_NAME] = mcpServerConfig(roots);
  await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

async function removeClaudeMcpConfig(filePath: string): Promise<boolean> {
  return removeJsonMcpConfig(filePath);
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
  await writeManagedBlock(filePath, codexMcpBlock(roots));
}

async function removeTextBlock(filePath: string, start: string, end: string): Promise<boolean> {
  if (!(await pathExists(filePath))) return false;
  const existing = await fs.readFile(filePath, "utf-8");
  if (!existing.includes(start)) return false;
  await fs.writeFile(filePath, removeManagedBlock(existing, start, end), "utf-8");
  return true;
}

async function fileContains(filePath: string, value: string): Promise<boolean> {
  if (!(await pathExists(filePath))) return false;
  return (await fs.readFile(filePath, "utf-8")).includes(value);
}

export async function installAgent(options: InstallOptions = {}): Promise<InstallResult> {
  const agent = options.agent ?? "claude";
  const homeDir = options.homeDir ?? process.env.HOME ?? process.env.USERPROFILE;
  if (!homeDir) throw new Error("Could not determine the user home directory.");

  const writtenFiles: string[] = [];
  const roots = normalizeRoots(options);
  const scope = options.scope ?? "user";

  if (scope === "project") {
    const projectConfig = projectMcpConfigPath(options.cwd);
    await installProjectMcpConfig(projectConfig, roots);
    return { agent, writtenFiles: [projectConfig] };
  }

  if (agent === "claude") {
    if (!options.mcpOnly) {
      const claudeMemory = path.join(homeDir, ".claude", "CLAUDE.md");
      await writeManagedBlock(claudeMemory, bootstrapBlock(agent));
      writtenFiles.push(claudeMemory);
    }

    const claudeConfig = path.join(homeDir, ".claude.json");
    await installClaudeMcpConfig(claudeConfig, roots);
    writtenFiles.push(claudeConfig);
    return { agent, writtenFiles };
  }

  if (agent === "hermes") {
    throw new Error("Hermes installation is not implemented yet.");
  }

  if (!options.mcpOnly) {
    const codexAgents = path.join(homeDir, ".codex", "AGENTS.md");
    await writeManagedBlock(codexAgents, bootstrapBlock(agent));
    writtenFiles.push(codexAgents);

    const skillSource = path.join(PACKAGE_ROOT, "skills", "project-progress", "SKILL.md");
    const skillTarget = path.join(homeDir, ".codex", "skills", "awesome-progress-tracker", "SKILL.md");
    await fs.mkdir(path.dirname(skillTarget), { recursive: true });
    await fs.copyFile(skillSource, skillTarget);
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
    if (await removeClaudeMcpConfig(claudeConfig)) changedFiles.push(claudeConfig);
    return { agent, changedFiles };
  }

  if (agent === "hermes") {
    throw new Error("Hermes uninstall is not implemented yet.");
  }

  const codexAgents = path.join(homeDir, ".codex", "AGENTS.md");
  if (await removeTextBlock(codexAgents, BOOTSTRAP_START, BOOTSTRAP_END)) changedFiles.push(codexAgents);

  const codexSkill = path.join(homeDir, ".codex", "skills", "awesome-progress-tracker", "SKILL.md");
  if (await pathExists(codexSkill)) {
    await fs.unlink(codexSkill);
    changedFiles.push(codexSkill);
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
          MCP_SERVER_NAME in mcpServers
      ),
      files: {
        bootstrap: claudeMemory,
        mcpConfig: claudeConfig,
        projectProgress
      }
    };
  }

  if (agent === "hermes") {
    throw new Error("Hermes status is not implemented yet.");
  }

  const codexAgents = path.join(homeDir, ".codex", "AGENTS.md");
  const codexSkill = path.join(homeDir, ".codex", "skills", "awesome-progress-tracker", "SKILL.md");
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

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  const parsed = parseArgs(argv);

  if (parsed.command === "help" || parsed.command === "--help" || parsed.command === "-h") {
    console.log(helpText());
    return 0;
  }

  if (parsed.command === "install") {
    const result = await installAgent({ agent: parsed.agent, roots: parsed.roots, scope: parsed.scope });
    console.log(`Installed Awesome Progress Tracker bootstrap for ${result.agent}.`);
    for (const file of result.writtenFiles) {
      console.log(`- ${file}`);
    }
    console.log("Restart Claude Code/Codex so it reloads bootstrap instructions and MCP config.");
    console.log("Run `awesome-progress-tracker status` or `awesome-progress-tracker doctor` to verify setup.");
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
    console.log(`Installed Awesome Progress Tracker MCP config for ${result.agent}.`);
    for (const file of result.writtenFiles) {
      console.log(`- ${file}`);
    }
    console.log("Restart Claude Code/Codex so it reloads MCP config.");
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
    console.log(`Removed Awesome Progress Tracker bootstrap for ${result.agent}.`);
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

  if (parsed.command === "mcp") {
    await runMcpServer();
    return 0;
  }

  throw new Error(`Unknown command: ${parsed.command}\n\n${helpText()}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
