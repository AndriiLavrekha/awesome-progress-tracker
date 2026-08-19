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

export const GATE_KEYS = [
  "gate_implementation",
  "gate_tests",
  "gate_review",
  "gate_deploy"
] as const;

export const ALLOWED_GATE_VALUES = [
  "not-started",
  "in-progress",
  "done",
  "failing",
  "blocked"
] as const;

export const ALLOWED_HANDOFF = ["clean", "interrupted"] as const;

// Keys that may appear in Progress.md frontmatter but are never required.
// Absent always means "unknown", never "invalid", so existing files stay valid
// without migration. The session-handoff work extends this same list.
export const OPTIONAL_FRONTMATTER = [
  "base_commit",
  "base_branch",
  "worktree_dirty",
  "checkpoint_at",
  "session_id",
  "handoff",
  ...GATE_KEYS
] as const;

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

  for (const key of GATE_KEYS) {
    if (key in frontmatter && !ALLOWED_GATE_VALUES.includes(frontmatter[key] as never)) {
      errors.push(allowedMessage(key, ALLOWED_GATE_VALUES));
    }
  }

  if ("worktree_dirty" in frontmatter && typeof frontmatter.worktree_dirty !== "boolean") {
    errors.push("worktree_dirty must be a boolean");
  }

  // Stored full-length so it is unambiguous; every human-facing rendering
  // shortens it. A hypothetical all-digit SHA parses as a number upstream and
  // fails this check, which is the safe direction.
  if ("base_commit" in frontmatter && !/^[0-9a-f]{40}$/.test(String(frontmatter.base_commit))) {
    errors.push("base_commit must be a full 40-character hex SHA");
  }

  if ("checkpoint_at" in frontmatter) {
    const value = String(frontmatter.checkpoint_at);
    const shaped = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value);
    if (!shaped || Number.isNaN(Date.parse(value))) {
      errors.push("checkpoint_at must be an ISO 8601 timestamp");
    }
  }

  if ("handoff" in frontmatter && !ALLOWED_HANDOFF.includes(frontmatter.handoff as never)) {
    errors.push(allowedMessage("handoff", ALLOWED_HANDOFF));
  }

  return errors;
}
