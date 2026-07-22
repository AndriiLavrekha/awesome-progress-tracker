type FrontmatterValue = string | boolean | number;

export const REQUIRED_FRONTMATTER = [
  "project",
  "progress_schema_version",
  "status",
  "path",
  "agent_last_used",
  "updated",
  "last_milestone",
  "deployed",
  "deployment_url",
  "sensitivity",
  "commit_progress"
] as const;

export const ALLOWED_STATUSES = [
  "idea",
  "active",
  "blocked",
  "paused",
  "done",
  "deployed",
  "archived"
] as const;

export const ALLOWED_SENSITIVITY = ["normal", "private", "sensitive"] as const;

function allowedMessage(name: string, allowed: readonly string[]): string {
  return `${name} must be one of: ${[...allowed].sort().join(", ")}`;
}

export function validateFrontmatter(frontmatter: Record<string, FrontmatterValue>): string[] {
  const errors: string[] = [];

  for (const key of [...REQUIRED_FRONTMATTER].sort()) {
    if (!(key in frontmatter)) {
      errors.push(`Missing required frontmatter: ${key}`);
    }
  }

  if ("progress_schema_version" in frontmatter && frontmatter.progress_schema_version !== 1) {
    errors.push("progress_schema_version must be 1");
  }

  if ("status" in frontmatter && !ALLOWED_STATUSES.includes(frontmatter.status as never)) {
    errors.push(allowedMessage("status", ALLOWED_STATUSES));
  }

  if ("sensitivity" in frontmatter && !ALLOWED_SENSITIVITY.includes(frontmatter.sensitivity as never)) {
    errors.push(allowedMessage("sensitivity", ALLOWED_SENSITIVITY));
  }

  if ("commit_progress" in frontmatter && typeof frontmatter.commit_progress !== "boolean") {
    errors.push("commit_progress must be a boolean");
  }

  if ("deployed" in frontmatter && typeof frontmatter.deployed !== "boolean") {
    errors.push("deployed must be a boolean");
  }

  return errors;
}
