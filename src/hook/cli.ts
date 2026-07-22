import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { checkFreshness } from "./freshness.js";
import { validateProgressFile } from "./validator.js";

export interface HookArgs {
  projectRoot: string;
  sessionStartedAt?: string;
  meaningfulWork: boolean;
  completionBoundary: boolean;
}

export function parseArgs(argv: string[]): HookArgs {
  const args: HookArgs = {
    projectRoot: ".",
    meaningfulWork: false,
    completionBoundary: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case "--project-root":
        args.projectRoot = argv[++i] ?? ".";
        break;
      case "--session-started-at":
        args.sessionStartedAt = argv[++i];
        break;
      case "--meaningful-work":
        args.meaningfulWork = true;
        break;
      case "--completion-boundary":
        args.completionBoundary = true;
        break;
      default:
        // Ignore unknown tokens to stay permissive for hook callers.
        break;
    }
  }

  return args;
}

// Mirrors Python datetime.fromisoformat semantics: naive timestamps are treated as UTC.
export function parseSessionDatetime(value: string): Date {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    throw new Error(`Invalid isoformat string: '${value}'`);
  }

  const hasTimezone = /([zZ]|[+-]\d\d:?\d\d)$/.test(trimmed);
  let normalized = trimmed;
  if (!hasTimezone) {
    normalized = trimmed.includes("T") ? `${trimmed}Z` : `${trimmed}T00:00:00Z`;
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid isoformat string: '${value}'`);
  }
  return date;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);

  if (!args.sessionStartedAt) {
    process.stderr.write("Missing required argument: --session-started-at\n");
    return 2;
  }

  let sessionStartedAt: Date;
  try {
    sessionStartedAt = parseSessionDatetime(args.sessionStartedAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Invalid --session-started-at: ${message}\n`);
    return 1;
  }

  const progressPath = path.join(args.projectRoot, "project-progress", "Progress.md");

  if (!(await pathExists(progressPath))) {
    if (args.completionBoundary) {
      process.stdout.write(`Missing progress file: ${progressPath}\n`);
      return 1;
    }
    return 0;
  }

  const errors = await validateProgressFile(progressPath);
  if (errors.length > 0) {
    for (const error of errors) {
      process.stdout.write(`${error}\n`);
    }
    return 1;
  }

  const freshness = await checkFreshness(progressPath, {
    meaningfulWorkHappened: args.meaningfulWork,
    sessionStartedAt,
    completionBoundary: args.completionBoundary
  });
  if (freshness.shouldWarn) {
    process.stdout.write(`${freshness.message}\n`);
  }
  return freshness.shouldBlock ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
      process.exit(1);
    }
  );
}
