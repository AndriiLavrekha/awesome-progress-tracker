import { promises as fs } from "node:fs";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { DEFAULT_DISCOVERY_EXCLUDES, discoverProjects } from "./discovery.js";
import { readProjectIndex, refreshProjectIndex, upsertIndexedProject } from "./index.js";
import { parseProjectSummary } from "./markdown.js";
import {
  ALLOWED_PROGRESS_SECTIONS,
  MAX_LAST_MILESTONE_LENGTH,
  MAX_SECTION_CONTENT_LENGTH,
  replaceFrontmatterValue,
  replaceSection,
  replaceSectionWithOperation,
  writeFileAtomic,
  validateLastMilestone,
  validateSectionContent,
  validateSectionName
} from "./writer.js";
import type { ProjectSummary } from "./schema.js";
import { listProjectTrackingStates, resetProjectTrackingState } from "../project-state.js";
import type { ProjectStateOptions } from "../project-state.js";

const DEFAULT_EXCLUDES = DEFAULT_DISCOVERY_EXCLUDES;
const PROJECT_STATUSES = ["idea", "active", "blocked", "paused", "done", "deployed", "archived"] as const;
const DEFAULT_MAX_PROJECTS = 50;
const DEFAULT_MAX_STRING_LENGTH = 1000;
const DEFAULT_MAX_INDEX_AGE_MS = 24 * 60 * 60 * 1000;

export const projectSelectorSchema = z.string().trim().min(1).max(DEFAULT_MAX_STRING_LENGTH);
export const progressSectionSchema = z.enum(ALLOWED_PROGRESS_SECTIONS);
export const sectionContentSchema = z.string().max(MAX_SECTION_CONTENT_LENGTH);
export const lastMilestoneSchema = z.string().trim().min(1).max(MAX_LAST_MILESTONE_LENGTH);

export interface BoundProjectSummaryOptions {
  maxProjects?: number;
  maxStringLength?: number;
}

export interface ProjectListItem {
  project: string;
  status: string;
  updated: string;
  nextAction: string;
  path: string;
  truncatedFields: string[];
}

export interface ProjectListResult {
  items: ProjectListItem[];
  total: number;
  returned: number;
  truncated: boolean;
  indexUpdatedAt: string;
  indexAgeMs: number | null;
  refreshRecommended: boolean;
}

export const toolDefinitions = [
  { name: "list_projects" },
  { name: "refresh_projects" },
  { name: "read_project_progress" },
  { name: "update_project_progress" },
  { name: "mark_project_status" }
] as const;

export function rootsFromEnv(value = process.env.PROJECT_PROGRESS_ROOTS): string[] {
  return (value ?? "")
    .split(";")
    .map((root) => root.trim())
    .filter((root) => root.length > 0);
}

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 3)}...`;
}

function boundString(value: string | undefined, maxLength: number): string {
  return truncateString(value ?? "", maxLength);
}

export function boundProjectSummaries(
  projects: ProjectSummary[],
  options: BoundProjectSummaryOptions = {}
): ProjectSummary[] {
  const maxProjects = options.maxProjects ?? DEFAULT_MAX_PROJECTS;
  const maxStringLength = options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH;

  return projects.slice(0, maxProjects).map((project) => ({
    ...project,
    progressPath: boundString(project.progressPath, maxStringLength),
    project: boundString(project.project, maxStringLength),
    path: boundString(project.path, maxStringLength),
    updated: boundString(project.updated, maxStringLength),
    lastMilestone: boundString(project.lastMilestone, maxStringLength),
    deploymentUrl: boundString(project.deploymentUrl, maxStringLength),
    resumeSnapshot: boundString(project.resumeSnapshot, maxStringLength),
    nextAction: boundString(project.nextAction, maxStringLength),
    blockers: boundString(project.blockers, maxStringLength)
  }));
}

export function compactProjectListItem(project: ProjectSummary): ProjectListItem {
  const nextAction = truncateString(project.nextAction, DEFAULT_MAX_STRING_LENGTH);
  return {
    project: project.project,
    status: project.status,
    updated: project.updated,
    nextAction,
    path: project.path,
    truncatedFields: nextAction === project.nextAction ? [] : ["nextAction"]
  };
}

export async function projectsJson(filter?: (status: string) => boolean): Promise<string> {
  const index = await readProjectIndex();
  const projects = index.projects;
  const filtered = filter ? projects.filter((project) => filter(project.status)) : projects;
  const items = filtered.slice(0, DEFAULT_MAX_PROJECTS).map(compactProjectListItem);
  const indexedAt = Date.parse(index.updatedAt);
  const indexAgeMs = Number.isFinite(indexedAt) ? Math.max(0, Date.now() - indexedAt) : null;
  const result: ProjectListResult = {
    items,
    total: filtered.length,
    returned: items.length,
    truncated: items.length < filtered.length,
    indexUpdatedAt: index.updatedAt,
    indexAgeMs,
    refreshRecommended: indexAgeMs === null || indexAgeMs > DEFAULT_MAX_INDEX_AGE_MS
  };
  return JSON.stringify(result);
}

export interface ProjectResolution {
  project?: ProjectSummary;
  error?: string;
  suggestions?: Array<Pick<ProjectSummary, "project" | "path" | "progressPath">>;
}

function matchesSelector(project: ProjectSummary, selector: string): boolean {
  return (
    project.project === selector ||
    project.path === selector ||
    project.progressPath === selector
  );
}

function dedupeByProgressPath(projects: ProjectSummary[]): ProjectSummary[] {
  return [...new Map(projects.map((project) => [project.progressPath, project])).values()];
}

// Resolve a project by exact name, path, or progressPath. Names are not unique, so an
// ambiguous selector returns an error listing candidate paths instead of silently editing
// whichever entry happened to be found first.
export async function resolveProject(selector: string): Promise<ProjectResolution> {
  const index = await readProjectIndex();
  let candidates = dedupeByProgressPath(index.projects.filter((project) => matchesSelector(project, selector)));

  if (candidates.length === 0) {
    const discovered = await discoverProjects({
      projectRoots: rootsFromEnv(),
      exclude: DEFAULT_EXCLUDES
    });
    candidates = dedupeByProgressPath(discovered.filter((project) => matchesSelector(project, selector)));
  }

  if (candidates.length === 0) {
    const normalized = selector.toLowerCase();
    const suggestions = index.projects
      .filter((project) => project.project.toLowerCase().includes(normalized))
      .slice(0, 5)
      .map(({ project, path, progressPath }) => ({ project, path, progressPath }));
    return { error: "project not found", suggestions };
  }
  if (candidates.length > 1) {
    const paths = candidates.map((project) => project.path || project.progressPath).join(", ");
    return {
      error: `ambiguous project selector "${selector}" matches ${candidates.length} projects: ${paths}. Pass an exact path instead.`
    };
  }
  return { project: candidates[0] };
}

export async function refreshProjectsJson(): Promise<string> {
  const index = await refreshProjectIndex(rootsFromEnv(), DEFAULT_EXCLUDES);
  return JSON.stringify({
    refreshed: true,
    updatedAt: index.updatedAt,
    total: index.projects.length
  });
}

export async function projectTrackingStateJson(options: ProjectStateOptions = {}): Promise<string> {
  return JSON.stringify(await listProjectTrackingStates(options));
}

export async function resetProjectTrackingStateJson(
  project: string,
  options: ProjectStateOptions = {}
): Promise<string> {
  return JSON.stringify({
    reset: await resetProjectTrackingState(project, options),
    path: project.replace(/\\/g, "/")
  });
}

export function successResult(structuredContent: Record<string, unknown>, text: string) {
  return {
    content: [
      {
        type: "text" as const,
        text
      }
    ],
    structuredContent,
    isError: false
  };
}

export function errorResult(code: string, message: string, hint: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: `${message} ${hint}`
      }
    ],
    structuredContent: { error: { code, message, hint } },
    isError: true
  };
}

function textResult(text: string) {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed.error === "string") {
      return errorResult("invalid_request", parsed.error, "Correct the request and retry.");
    }
    return successResult(parsed, text);
  } catch {
    return successResult({ message: text }, text);
  }
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "project-progress", version: "0.1.1" });

  server.registerTool(
    "list_projects",
    {
      description: "List compact summaries from the cached project index. Filter by status when needed.",
      inputSchema: {
        status: z.enum(PROJECT_STATUSES).optional()
      }
    },
    async ({ status }) => textResult(await projectsJson(status ? (projectStatus) => projectStatus === status : undefined))
  );

  server.registerTool(
    "refresh_projects",
    {
      description: "Refresh the project index by scanning PROJECT_PROGRESS_ROOTS for project-progress/Progress.md files."
    },
    async () => textResult(await refreshProjectsJson())
  );

  server.registerTool(
    "read_project_progress",
    {
      description: "Read one compact project progress summary.",
      inputSchema: {
        project: projectSelectorSchema
      }
    },
    async ({ project }) => {
      const resolution = await resolveProject(project);
      if (resolution.error) return textResult(JSON.stringify({ error: resolution.error }));
      return textResult(JSON.stringify(boundProjectSummaries([resolution.project!])[0]));
    }
  );

  server.registerTool(
    "update_project_progress",
    {
      description: "Replace or append a named section in a project's Progress.md.",
      inputSchema: {
        project: projectSelectorSchema,
        section: progressSectionSchema,
        content: sectionContentSchema
      }
    },
    async ({ project, section, content }) => {
      const sectionError = validateSectionName(section);
      if (sectionError) return textResult(JSON.stringify({ error: sectionError }));
      const contentError = validateSectionContent(content);
      if (contentError) return textResult(JSON.stringify({ error: contentError }));

      const resolution = await resolveProject(project);
      if (resolution.error) return textResult(JSON.stringify({ error: resolution.error }));
      const match = resolution.project!;

      const fileState = await fs.stat(match.progressPath);
      const markdown = await fs.readFile(match.progressPath, "utf-8");
      const result = replaceSectionWithOperation(markdown, section, content);
      const updated = result.markdown;
      await writeFileAtomic(match.progressPath, updated, fileState.mtimeMs);
      await upsertIndexedProject(parseProjectSummary(updated, match.progressPath));

      return textResult(JSON.stringify({ updated: true, operation: result.operation, project, section, updatedAt: new Date().toISOString(), progressPath: match.progressPath }));
    }
  );

  server.registerTool(
    "mark_project_status",
    {
      description: "Update frontmatter status and last_milestone in a project's Progress.md.",
      inputSchema: {
        project: projectSelectorSchema,
        status: z.enum(PROJECT_STATUSES),
        last_milestone: lastMilestoneSchema
      }
    },
    async ({ project, status, last_milestone }) => {
      const milestoneError = validateLastMilestone(last_milestone);
      if (milestoneError) return textResult(JSON.stringify({ error: milestoneError }));

      const resolution = await resolveProject(project);
      if (resolution.error) return textResult(JSON.stringify({ error: resolution.error }));
      const match = resolution.project!;

      const fileState = await fs.stat(match.progressPath);
      const markdown = await fs.readFile(match.progressPath, "utf-8");
      const withStatus = replaceFrontmatterValue(markdown, "status", status);
      const updated = replaceFrontmatterValue(withStatus, "last_milestone", last_milestone);
      await writeFileAtomic(match.progressPath, updated, fileState.mtimeMs);
      await upsertIndexedProject(parseProjectSummary(updated, match.progressPath));

      return textResult(JSON.stringify({ updated: true, project, status, progressPath: match.progressPath }));
    }
  );

  return server;
}

export async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
