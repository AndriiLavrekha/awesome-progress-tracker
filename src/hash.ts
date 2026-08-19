import { createHash } from "node:crypto";

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf-8").digest("hex");
}

// Returns the Markdown body with any leading YAML frontmatter block removed.
// On the stripping path the body is rejoined with LF, so a CRLF checkout and
// an LF checkout of the same frontmatter-bearing document hash identically.
// Documents with no frontmatter, or with unterminated frontmatter, are
// returned as-is and are NOT line-ending normalized — line endings are part
// of their content. That asymmetry is deliberate: those documents have no
// frontmatter boundary to normalize around.
export function bodyOf(markdown: string): string {
  const text = markdown.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return text;

  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "---") {
      return lines.slice(index + 1).join("\n");
    }
  }

  // Unterminated frontmatter is not frontmatter; treat the whole file as body.
  return text;
}

export function bodyHash(markdown: string): string {
  return sha256(bodyOf(markdown));
}
