const SECTION_RE = /^##(?!#)\s+(?<title>.+?)\s*$/;
const FENCE_RE = /^\s*(?<fence>`{3,}|~{3,})(?<rest>.*)$/;
export const MAX_LAST_MILESTONE_LENGTH = 240;
export const MAX_SECTION_CONTENT_LENGTH = 4000;
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
];
const ALLOWED_SECTION_SET = new Set(ALLOWED_PROGRESS_SECTIONS);
export function validateSectionName(title) {
    if (/[\r\n]/.test(title))
        return "section cannot contain newline characters";
    if (!ALLOWED_SECTION_SET.has(title)) {
        return `section must be one of the allowed Progress.md sections: ${ALLOWED_PROGRESS_SECTIONS.join(", ")}`;
    }
    return undefined;
}
export function validateLastMilestone(value) {
    const trimmed = value.trim();
    if (value.length > MAX_LAST_MILESTONE_LENGTH) {
        return `last_milestone cannot exceed ${MAX_LAST_MILESTONE_LENGTH} characters`;
    }
    if (/[\r\n]/.test(value))
        return "last_milestone cannot contain newline characters";
    if (trimmed.startsWith("---"))
        return "last_milestone cannot contain frontmatter syntax";
    if (/^#{1,6}\s/.test(trimmed))
        return "last_milestone cannot contain heading syntax";
    return undefined;
}
export function validateSectionContent(content) {
    if (content.length > MAX_SECTION_CONTENT_LENGTH) {
        return `section content cannot exceed ${MAX_SECTION_CONTENT_LENGTH} characters`;
    }
    if (/^---\s*$/m.test(content))
        return "section content cannot contain frontmatter delimiters";
    if (/^#{1,6}\s/m.test(content))
        return "section content cannot contain Markdown headings";
    return undefined;
}
function splitLinesWithEndings(markdown) {
    const lines = markdown.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? [];
    return lines.filter((line, index) => line.length > 0 || index < lines.length - 1);
}
function sectionMatches(markdown) {
    const matches = [];
    let offset = 0;
    let fenceMarker;
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
            }
            else if (fenceMarker === marker &&
                fence.length >= fenceLength &&
                fenceMatch.groups.rest.trim() === "") {
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
export function replaceSection(markdown, title, content) {
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
export function replaceSectionWithOperation(markdown, title, content) {
    const operation = sectionMatches(markdown).some((match) => match.title === title) ? "replaced" : "created";
    return { markdown: replaceSection(markdown, title, content), operation };
}
export async function writeFileAtomic(filePath, content, expectedMtimeMs) {
    const current = await fs.stat(filePath);
    if (current.mtimeMs !== expectedMtimeMs)
        throw new Error("Progress file changed on disk; reread it before writing.");
    const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
    try {
        await fs.writeFile(tempPath, content, "utf-8");
        await fs.rename(tempPath, filePath);
    }
    finally {
        await fs.rm(tempPath, { force: true }).catch(() => undefined);
    }
}
export function replaceFrontmatterValue(markdown, key, value) {
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
