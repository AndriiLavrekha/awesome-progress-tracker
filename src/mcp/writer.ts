const SECTION_RE = /^##(?!#)\s+(?<title>.+?)\s*$/;
const FENCE_RE = /^\s*(?<fence>`{3,}|~{3,})(?<rest>.*)$/;
export const MAX_LAST_MILESTONE_LENGTH = 240;
export const MAX_SECTION_CONTENT_LENGTH = 4000;
export const FOLD_THRESHOLD = 2800;
const ARCHIVE_HEADING = "## Archived Done Items";

// Thrown when the file changed between the caller's read and its write.
// Typed rather than a bare Error so callers can distinguish a lost race from a
// genuine I/O failure and respond with a mergeable payload.
export class ProgressConflictError extends Error {
  readonly filePath: string;

  constructor(filePath: string) {
    super("Progress file changed on disk; reread it before writing.");
    this.name = "ProgressConflictError";
    this.filePath = filePath;
  }
}

export const ALLOWED_PROGRESS_SECTIONS = [
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

const ALLOWED_SECTION_SET = new Set<string>(ALLOWED_PROGRESS_SECTIONS);

export function validateSectionName(title: string): string | undefined {
  if (/[\r\n]/.test(title)) return "section cannot contain newline characters";
  if (!ALLOWED_SECTION_SET.has(title)) {
    return `section must be one of the allowed Progress.md sections: ${ALLOWED_PROGRESS_SECTIONS.join(", ")}`;
  }
  return undefined;
}

export function validateLastMilestone(value: string): string | undefined {
  const trimmed = value.trim();
  if (value.length > MAX_LAST_MILESTONE_LENGTH) {
    return `last_milestone cannot exceed ${MAX_LAST_MILESTONE_LENGTH} characters`;
  }
  if (/[\r\n]/.test(value)) return "last_milestone cannot contain newline characters";
  if (trimmed.startsWith("---")) return "last_milestone cannot contain frontmatter syntax";
  if (/^#{1,6}\s/.test(trimmed)) return "last_milestone cannot contain heading syntax";
  return undefined;
}

export function validateSectionContent(content: string): string | undefined {
  if (content.length > MAX_SECTION_CONTENT_LENGTH) {
    return `section content cannot exceed ${MAX_SECTION_CONTENT_LENGTH} characters`;
  }
  if (/^---\s*$/m.test(content)) return "section content cannot contain frontmatter delimiters";
  if (/^#{1,6}\s/m.test(content)) return "section content cannot contain Markdown headings";
  return undefined;
}

function splitLinesWithEndings(markdown: string): string[] {
  const lines = markdown.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? [];
  return lines.filter((line, index) => line.length > 0 || index < lines.length - 1);
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

export function replaceSection(markdown: string, title: string, content: string): string {
  const contentError = validateSectionContent(content);
  if (contentError) {
    throw new Error(contentError);
  }

  const matches = sectionMatches(markdown);
  const index = matches.findIndex((match) => match.title === title);
  const normalizedContent = content.trim();

  if (index === -1) {
    return `${markdown.trimEnd()}\n\n## ${title}\n\n${normalizedContent}\n`;
  }

  const section = matches[index];
  const end = index + 1 < matches.length ? matches[index + 1].start : markdown.length;
  return `${markdown.slice(0, section.bodyStart)}\n${normalizedContent}\n\n${markdown.slice(end).replace(/^\s+/, "")}`;
}

export function replaceSectionWithOperation(
  markdown: string,
  title: string,
  content: string
): { markdown: string; operation: "created" | "replaced" } {
  const operation = sectionMatches(markdown).some((match) => match.title === title) ? "replaced" : "created";
  return { markdown: replaceSection(markdown, title, content), operation };
}

export function foldDoneSection(content: string): { kept: string; archived: string[] } {
  if (content.length <= FOLD_THRESHOLD) return { kept: content, archived: [] };

  const lines = content.split("\n");
  const keptLines: string[] = [];
  let length = 0;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const addedLength = keptLines.length === 0 ? line.length : line.length + 1;
    if (length + addedLength > FOLD_THRESHOLD && keptLines.length > 0) break;
    keptLines.unshift(line);
    length += addedLength;
  }

  const archived = lines.slice(0, lines.length - keptLines.length);
  return { kept: keptLines.join("\n"), archived };
}

export function appendToArchive(archiveMarkdown: string, items: string[]): string {
  if (items.length === 0) return archiveMarkdown;

  const dateHeading = `### ${new Date().toISOString().slice(0, 10)}`;
  const entry = `${dateHeading}\n\n${items.join("\n")}\n`;

  if (archiveMarkdown.includes(ARCHIVE_HEADING)) {
    return `${archiveMarkdown.trimEnd()}\n\n${entry}`;
  }
  return `${archiveMarkdown.trimEnd()}\n\n${ARCHIVE_HEADING}\n\n${entry}`;
}

// Serializes writes to one path within this process. The hash compare and the
// rename are separated by awaits, so two concurrent callers holding the same
// expected hash would both pass the compare and the second would silently
// clobber the first — the exact overwrite the guard exists to prevent. Queuing
// makes read-compare-rename atomic per path, so the loser re-reads the winner's
// content and raises ProgressConflictError.
//
// This is a queue, not a lease: it has no TTL, no renewal, and no steal path,
// and it cannot outlive the process that holds it. Writers in other processes
// are still ordered only by the compare, which narrows their race to the
// rename itself rather than closing it.
const writeQueues = new Map<string, Promise<void>>();

function enqueueWrite(key: string, task: () => Promise<void>): Promise<void> {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const run = previous.then(task, task);
  // Keep the chain alive on rejection so a failed write does not poison the
  // queue, and drop the entry once this write is the last one on it.
  const settled = run.catch(() => undefined);
  writeQueues.set(key, settled);
  void settled.then(() => {
    if (writeQueues.get(key) === settled) writeQueues.delete(key);
  });
  return run;
}

export async function writeFileAtomic(
  filePath: string,
  content: string,
  expectedHash: string
): Promise<void> {
  return enqueueWrite(path.resolve(filePath), async () => {
    // Content hashing has no resolution window. mtime is whole-second on some
    // network and FAT mounts, so two writes inside one tick compared equal and
    // the second silently won.
    const current = await fs.readFile(filePath, "utf-8");
    if (sha256(current) !== expectedHash) throw new ProgressConflictError(filePath);

    const tempPath = path.join(
      path.dirname(filePath),
      `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
    );
    try {
      await fs.writeFile(tempPath, content, "utf-8");
      await fs.rename(tempPath, filePath);
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
    }
  });
}

export function replaceFrontmatterValue(markdown: string, key: string, value: string): string {
  const lines = splitLinesWithEndings(markdown);
  const hasFrontmatter = lines[0]?.trim() === "---";
  const replacement = `${key}: ${value}`;

  if (!hasFrontmatter) {
    return `---\n${replacement}\n---\n\n${markdown}`;
  }

  let frontmatterEnd = -1;
  let offset = lines[0].length;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "---") {
      frontmatterEnd = offset;
      break;
    }
    offset += lines[index].length;
  }

  if (frontmatterEnd === -1) {
    return `---\n${replacement}\n---\n\n${markdown}`;
  }

  const frontmatter = markdown.slice(0, frontmatterEnd);
  const body = markdown.slice(frontmatterEnd);
  const keyPattern = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:.*$`, "m");

  if (keyPattern.test(frontmatter)) {
    return `${frontmatter.replace(keyPattern, replacement)}${body}`;
  }

  return `${lines[0]}${replacement}\n${markdown.slice(lines[0].length)}`;
}
import { promises as fs } from "node:fs";
import path from "node:path";
import { sha256 } from "../hash.js";
