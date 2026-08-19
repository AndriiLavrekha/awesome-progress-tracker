import type { ProjectStatus, ProjectSummary, Sensitivity } from "./schema.js";

type FrontmatterScalar = string | boolean | number;

const SECTION_RE = /^##(?!#)\s+(?<title>.+?)\s*$/;
const FENCE_RE = /^\s*(?<fence>`{3,}|~{3,})(?<rest>.*)$/;

function parseScalar(value: string): FrontmatterScalar {
  const trimmed = value.trim();
  if (trimmed === "") return "";

  const lowered = trimmed.toLowerCase();
  if (lowered === "true") return true;
  if (lowered === "false") return false;
  if (/^[+-]?\d+$/.test(trimmed)) return Number(trimmed);

  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function parseFrontmatter(markdown: string): Record<string, FrontmatterScalar> {
  const text = markdown.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return {};

  const frontmatter: Record<string, FrontmatterScalar> = {};
  for (const line of lines.slice(1)) {
    if (line.trim() === "---") return frontmatter;

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    if (key === "") continue;
    frontmatter[key] = parseScalar(line.slice(separator + 1));
  }

  return frontmatter;
}

function sectionMatches(markdown: string): Array<{ title: string; start: number; bodyStart: number }> {
  const matches: Array<{ title: string; start: number; bodyStart: number }> = [];
  let offset = 0;
  let fenceMarker: string | undefined;
  let fenceLength = 0;

  for (const line of splitLinesWithEndings(markdown)) {
    const contentLine = line.replace(/\r?\n$|\r$/, "");
    const fenceMatch = contentLine.match(FENCE_RE);
    if (fenceMatch?.groups) {
      const fence = fenceMatch.groups.fence;
      const marker = fence[0];
      if (fenceMarker === undefined) {
        fenceMarker = marker;
        fenceLength = fence.length;
      } else if (
        fenceMarker === marker &&
        fence.length >= fenceLength &&
        fenceMatch.groups.rest.trim() === ""
      ) {
        fenceMarker = undefined;
        fenceLength = 0;
      }

      offset += line.length;
      continue;
    }

    if (fenceMarker === undefined) {
      const sectionMatch = contentLine.match(SECTION_RE);
      if (sectionMatch?.groups) {
        matches.push({
          title: sectionMatch.groups.title.trim(),
          start: offset,
          bodyStart: offset + line.length
        });
      }
    }

    offset += line.length;
  }

  return matches;
}

function splitLinesWithEndings(markdown: string): string[] {
  const lines = markdown.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? [];
  return lines.filter((line, index) => line.length > 0 || index < lines.length - 1);
}

function compactSection(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim().replace(/\n{3,}/g, "\n\n");
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function listSections(markdown: string): string[] {
  return sectionMatches(markdown).map((match) => match.title);
}

export function extractSection(markdown: string, title: string): string {
  const escapedTitle = escapeRegExp(title);
  const matches = sectionMatches(markdown).filter((match) =>
    new RegExp(`^${escapedTitle}$`).test(match.title)
  );
  if (matches.length === 0) return "";

  const allMatches = sectionMatches(markdown);
  const index = allMatches.findIndex((match) => match.start === matches[0].start);
  const end = index + 1 < allMatches.length ? allMatches[index + 1].start : markdown.length;
  return compactSection(markdown.slice(allMatches[index].bodyStart, end));
}

function stringValue(value: FrontmatterScalar | undefined): string {
  return value === undefined ? "" : String(value);
}

function booleanValue(value: FrontmatterScalar | undefined): boolean {
  return value === true;
}

// A project's directory is where its Progress.md actually lives. The
// frontmatter `path` key is written once at init and never reconciled, so it
// goes stale the moment the project is moved or cloned elsewhere, and a stale
// value makes the MCP selector match the wrong project or none at all.
// Discovery always finds Progress.md at <projectDir>/project-progress/, so the
// directory is the path minus its last two segments.
function projectDirectoryFrom(progressPath: string): string {
  const segments = progressPath.replace(/\\/g, "/").replace(/\/+$/, "").split("/");
  return segments.length < 3 ? "" : segments.slice(0, -2).join("/");
}

export function parseProjectSummary(markdown: string, progressPath = ""): ProjectSummary {
  const frontmatter = parseFrontmatter(markdown);

  return {
    progressPath,
    project: stringValue(frontmatter.project),
    status: stringValue(frontmatter.status || "active") as ProjectStatus,
    // Frontmatter is only a fallback, for a summary parsed without a known
    // location on disk.
    path: projectDirectoryFrom(progressPath) || stringValue(frontmatter.path),
    updated: stringValue(frontmatter.updated),
    lastMilestone: stringValue(frontmatter.last_milestone),
    deployed: booleanValue(frontmatter.deployed),
    deploymentUrl: stringValue(frontmatter.deployment_url),
    sensitivity: stringValue(frontmatter.sensitivity || "normal") as Sensitivity,
    commitProgress: booleanValue(frontmatter.commit_progress),
    resumeSnapshot: extractSection(markdown, "Resume Snapshot"),
    nextAction: extractSection(markdown, "Next Action"),
    blockers: extractSection(markdown, "Blockers")
  };
}
