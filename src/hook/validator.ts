import { promises as fs } from "node:fs";
import path from "node:path";
import { KEPT_PROGRESS_SECTIONS, planCompaction, readProgressFiles } from "../compact.js";
import { extractSection, listSections, parseFrontmatter } from "../mcp/markdown.js";
import { MAX_SECTION_CONTENT_LENGTH } from "../mcp/writer.js";
import { validateFrontmatter } from "./schema.js";

export const REQUIRED_PROGRESS_SECTIONS = [
  "Resume Snapshot",
  "Current State",
  "Last Session",
  "Next Action",
  "Remaining Work",
  "Done",
  "Blockers",
  "Deployment",
  "Completion Criteria",
  "Resume Instructions"
] as const;

const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ["OpenAI-style API key", /\bsk-[A-Za-z0-9_-]{16,}\b/],
  ["GitHub token", /\bgh(?:p|o|u|s|r)_[A-Za-z0-9_]{20,}\b/],
  ["generic password assignment", /\b(?:password|passwd|pwd)\b\s*[:=]\s*['"]?[^'"\s]+/i]
];

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function validateProgressFile(progressPath: string): Promise<string[]> {
  if (!(await pathExists(progressPath))) {
    return [`Progress file not found: ${progressPath}`];
  }

  const markdown = await fs.readFile(progressPath, "utf-8");
  const errors = validateFrontmatter(parseFrontmatter(markdown));

  const sections = new Set(listSections(markdown));
  for (const section of [...REQUIRED_PROGRESS_SECTIONS].filter((s) => !sections.has(s)).sort()) {
    errors.push(`Missing required section: ${section}`);
  }

  for (const [label, pattern] of SECRET_PATTERNS) {
    if (pattern.test(markdown)) {
      errors.push(`Found secret-like value: ${label}`);
    }
  }

  return errors;
}

export function summarizeProblems(problems: string[], command: string | undefined, limit = 3): string {
  const more = problems.length - limit;
  const listed = `${problems.slice(0, limit).join("; ")}${more > 0 ? ` (+${more} more)` : ""}`;
  const hint = command ? ` Preview the cleanup with \`${command}\`, then add --write.` : "";
  return `Progress file problems: ${listed}.${hint}`;
}

export const PROGRESS_BYTES_BUDGET = 16 * 1024;
export const SESSION_LOG_ENTRIES_BUDGET = 40;

export interface HealthFinding {
  message: string;
  remedy: "compact" | "edit";
}

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

// Runs the compaction rules in memory, so "compact" is suggested only when it
// would actually change something; the rest needs a human or agent edit.
export async function checkProgressHealth(progressDir: string): Promise<HealthFinding[]> {
  const sources = await readProgressFiles(path.resolve(progressDir));
  const texts = new Map([...sources].map(([name, source]) => [name, source.text]));
  const plan = planCompaction(texts, "health");
  const findings: HealthFinding[] = [];

  const moves = [...plan.moved].map(([name, headings]) => `${name} ${headings.length} blocks`);
  if (plan.folded.length > 0) moves.push(`${plan.folded.length} Done lines`);
  if (moves.length > 0) findings.push({ message: `compact would move ${moves.join(", ")}`, remedy: "compact" });
  for (const name of plan.repaired) findings.push({ message: `garbled characters in ${name}`, remedy: "compact" });

  const progress = plan.outputs.get("Progress.md") ?? texts.get("Progress.md");
  if (progress !== undefined) {
    const bytes = Buffer.byteLength(progress, "utf-8");
    if (bytes > PROGRESS_BYTES_BUDGET) {
      findings.push({ message: `Progress.md is ${kb(bytes)} after compact (budget ${kb(PROGRESS_BYTES_BUDGET)}); shorten long sections`, remedy: "edit" });
    }
    for (const title of KEPT_PROGRESS_SECTIONS) {
      const length = extractSection(progress, title).length;
      if (length > MAX_SECTION_CONTENT_LENGTH) {
        findings.push({ message: `Progress.md ${title} is ${length} characters (budget ${MAX_SECTION_CONTENT_LENGTH})`, remedy: "edit" });
      }
    }
  }

  const log = plan.outputs.get("Session Log.md") ?? texts.get("Session Log.md");
  if (log !== undefined) {
    const entries = listSections(log).length;
    if (entries > SESSION_LOG_ENTRIES_BUDGET) {
      findings.push({ message: `Session Log.md has ${entries} entries after compact (budget ${SESSION_LOG_ENTRIES_BUDGET}); date or remove undated entries`, remedy: "edit" });
    }
  }
  return findings;
}
