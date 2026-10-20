import { repairEncoding } from "./encoding.js";
import { scanLines, splitFrontmatter } from "./mcp/markdown.js";
import type { ScannedLine } from "./mcp/markdown.js";
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

const DATE_RE = /\d{4}-\d{2}-\d{2}/;
const TIME_RE = /\b\d{2}:\d{2}\b/;

// "YYYY-MM-DD HH:MM"; an entry without a time sorts as 00:00 on its day.
function sortKey(title: string): string | undefined {
  const date = title.match(DATE_RE);
  if (!date) return undefined;
  const time = title.slice((date.index ?? 0) + date[0].length).match(TIME_RE);
  return `${date[0]} ${time ? time[0] : "00:00"}`;
}

export function compactSessionLog(text: string): CompactResult {
  const { frontmatter, body } = splitFrontmatter(repairEncoding(text));
  const head: Block[] = [];
  const moved: string[] = [];
  const entries: Array<{ block: Block; key?: string; index: number }> = [];
  let titleSeen = false;

  for (const block of splitBlocks(body)) {
    if (block.level === 2) {
      entries.push({ block, key: sortKey(block.title), index: entries.length });
    } else if (block.level === 0 || !titleSeen) {
      if (block.level === 1) titleSeen = true;
      head.push(block);
    } else {
      moved.push(block.text);
    }
  }

  const dated = entries
    .filter((item) => item.key !== undefined)
    .sort((a, b) => (a.key! < b.key! ? -1 : a.key! > b.key! ? 1 : 0) || a.index - b.index);
  const keep = new Set(dated.slice(-SESSION_LOG_KEEP));
  moved.push(...entries.filter((item) => item.key !== undefined && !keep.has(item)).map((item) => item.block.text));

  const undated = entries.filter((item) => item.key === undefined);
  const notes = undated.length > 0 ? [`Session Log.md: ${undated.length} undated entries kept`] : [];
  const kept = [...head, ...undated.map((item) => item.block), ...dated.filter((item) => keep.has(item)).map((item) => item.block)];
  return { kept: joinBlocks(frontmatter, kept), moved: dedupe(moved), folded: [], notes };
}

const OPEN_TASK_RE = /^[\s>]*(?:[-*+]|\d+[.)]) \[ \](\s|$)/;
const CHECKED_TASK_RE = /^[-*] \[[xX]\](\s|$)/;

function hasOpenTask(lines: ScannedLine[]): boolean {
  return lines.some((line) => !line.inFence && OPEN_TASK_RE.test(line.text));
}

function moveCheckedTasks(blocks: Block[]): { kept: Block[]; groups: string[] } {
  const scanned = new Map(blocks.map((block) => [block, scanLines(block.text)] as const));
  const tasks: Array<{ block: Block; start: number; end: number; heading: string }> = [];

  for (const block of blocks) {
    const lines = scanned.get(block)!;
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].inFence || !CHECKED_TASK_RE.test(lines[index].text)) continue;
      // The task runs through its last indented line, across blank lines.
      let end = index + 1;
      for (let next = index + 1; next < lines.length; next += 1) {
        if (/^\s+\S/.test(lines[next].text)) end = next + 1;
        else if (lines[next].text.trim() !== "") break;
      }
      const task = lines.slice(index, end);
      const after = lines[end]?.text;
      // A flush-left plain line right after the task is a lazy continuation; moving the task would attach that note to the previous task.
      const lazy = after !== undefined && after.trim() !== "" && !/^\s/.test(after) && !/^(?:[-*+]|\d+[.)])\s/.test(after) && !/^#{1,6}\s/.test(after);
      // Moving part of a fence would leave an unclosed fence in both files.
      if (!lazy && !task.some((line) => line.inFence) && !hasOpenTask(task)) {
        tasks.push({ block, start: index, end, heading: block.level === 0 ? "Tasks" : block.title });
      }
      index = end - 1;
    }
  }

  const moving = tasks.slice(0, Math.max(0, tasks.length - TASKS_KEEP_CHECKED));
  if (moving.length === 0) return { kept: blocks, groups: [] };

  const groups = new Map<string, string[]>();
  const dropped = new Map<Block, Set<number>>();
  for (const task of moving) {
    const lines = scanned.get(task.block)!.slice(task.start, task.end).map((line) => line.text);
    groups.set(task.heading, [...(groups.get(task.heading) ?? []), ...lines]);
    const drop = dropped.get(task.block) ?? new Set<number>();
    for (let index = task.start; index < task.end; index += 1) drop.add(index);
    dropped.set(task.block, drop);
  }

  const kept = blocks.map((block) => {
    const drop = dropped.get(block);
    if (!drop) return block;
    const text = scanned.get(block)!.filter((_, index) => !drop.has(index)).map((line) => `${line.text}\n`).join("");
    return { ...block, text };
  });
  return { kept, groups: [...groups].map(([title, lines]) => `## ${title}\n\n${lines.join("\n")}\n`) };
}

export function compactTasks(text: string): CompactResult {
  const { frontmatter, body } = splitFrontmatter(repairEncoding(text));
  const blocks = splitBlocks(body);
  const finished = blocks.filter((block) => block.level === 2 && !hasOpenTask(scanLines(block.text)));
  const movedBlocks = new Set(finished.slice(0, Math.max(0, finished.length - TASKS_KEEP_FINISHED_BLOCKS)));
  const { kept, groups } = moveCheckedTasks(blocks.filter((block) => !movedBlocks.has(block)));
  const moved = [...blocks.filter((block) => movedBlocks.has(block)).map((block) => block.text), ...groups];
  return { kept: joinBlocks(frontmatter, kept), moved: dedupe(moved), folded: [], notes: [] };
}
