import { repairEncoding } from "./encoding.js";
import { scanLines, splitFrontmatter } from "./mcp/markdown.js";
import { ALLOWED_PROGRESS_SECTIONS, foldDoneSection } from "./mcp/writer.js";

// The template ships `## Verification`, which the MCP write tool does not
// accept but which is still a legitimate section.
export const KEPT_PROGRESS_SECTIONS: ReadonlySet<string> = new Set<string>([...ALLOWED_PROGRESS_SECTIONS, "Verification"]);
export const SESSION_LOG_KEEP = 20;
export const TASKS_KEEP_FINISHED_BLOCKS = 3;
export const TASKS_KEEP_CHECKED = 10;

export interface CompactResult {
  kept: string;
  moved: string[];
  folded: string[];
  notes: string[];
}

export interface Block {
  level: 0 | 1 | 2;
  title: string;
  text: string;
}

const HEADING_RE = /^(?<marks>#{1,2})\s+(?<title>.+?)\s*$/;

// Level 0 is the text before the first `#`/`##` heading outside fences.
export function splitBlocks(body: string): Block[] {
  const blocks: Block[] = [{ level: 0, title: "", text: "" }];
  for (const line of scanLines(body)) {
    const raw = body.slice(line.offset, line.offset + line.length);
    const heading = line.inFence ? null : line.text.match(HEADING_RE);
    if (heading?.groups) {
      blocks.push({ level: heading.groups.marks.length as 1 | 2, title: heading.groups.title, text: raw });
    } else {
      blocks[blocks.length - 1].text += raw;
    }
  }
  return blocks;
}

function joinBlocks(frontmatter: string, blocks: Block[]): string {
  const parts = blocks.filter((block) => block.text.trim() !== "").map((block) => `${block.text.trimEnd()}\n`);
  return `${frontmatter}${frontmatter && parts.length > 0 ? "\n" : ""}${parts.join("\n")}`;
}

function bodyOf(block: Block): string {
  const newline = block.text.indexOf("\n");
  return newline === -1 ? "" : block.text.slice(newline + 1).trim();
}

function dedupe(blocks: string[]): string[] {
  const seen = new Set<string>();
  return blocks.filter((block) => {
    const key = block.trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function compactProgress(text: string): CompactResult {
  const { frontmatter, body } = splitFrontmatter(repairEncoding(text));
  const kept: Block[] = [];
  const moved: string[] = [];
  const seen = new Set<string>();
  let titleSeen = false;

  for (const block of splitBlocks(body)) {
    if (block.level === 0 || (block.level === 1 && !titleSeen)) {
      if (block.level === 1) titleSeen = true;
      kept.push(block);
    } else if (block.level === 2 && KEPT_PROGRESS_SECTIONS.has(block.title) && !seen.has(block.title)) {
      seen.add(block.title);
      kept.push(block);
    } else {
      moved.push(block.text);
    }
  }

  let folded: string[] = [];
  const done = kept.find((block) => block.level === 2 && block.title === "Done");
  // The fold is line-based; splitting a fence would hide every later section.
  if (done && !scanLines(bodyOf(done)).some((line) => line.inFence)) {
    const fold = foldDoneSection(bodyOf(done));
    if (fold.archived.length > 0) {
      folded = fold.archived;
      done.text = `## Done\n\n${fold.kept}\n`;
    }
  }

  return { kept: joinBlocks(frontmatter, kept), moved: dedupe(moved), folded, notes: [] };
}

export function demoteHeadings(text: string, levels: number): string {
  return scanLines(text)
    .map((line) => {
      const heading = line.inFence ? null : line.text.match(/^(#{1,6})(\s.*)$/);
      return heading ? `${"#".repeat(Math.min(6, heading[1].length + levels))}${heading[2]}` : line.text;
    })
    .join("\n");
}

export interface ArchiveSource {
  file: string;
  blocks: string[];
}

export function renderArchiveRun(date: string, sources: ArchiveSource[]): string {
  const parts = sources
    .filter((source) => source.blocks.length > 0)
    .map((source) => `### From ${source.file}\n\n${source.blocks.map((block) => demoteHeadings(block.trimEnd(), 2)).join("\n\n")}\n`);
  return parts.length === 0 ? "" : `## Compacted ${date}\n\n${parts.join("\n")}`;
}
