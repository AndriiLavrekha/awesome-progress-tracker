import { promises as fs } from "node:fs";
import { listSections, parseFrontmatter } from "../mcp/markdown.js";
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
];
const SECRET_PATTERNS = [
    ["OpenAI-style API key", /\bsk-[A-Za-z0-9_-]{16,}\b/],
    ["GitHub token", /\bgh(?:p|o|u|s|r)_[A-Za-z0-9_]{20,}\b/],
    ["generic password assignment", /\b(?:password|passwd|pwd)\b\s*[:=]\s*['"]?[^'"\s]+/i]
];
async function pathExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
export async function validateProgressFile(progressPath) {
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
