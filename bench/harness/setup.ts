import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

// Built-in conditions. Any other name is accepted and leaves the tree as the
// bundle restored it, so a competitor's memory system can be set up by hand
// under its own condition name without changing the harness.
export const CONDITIONS = ["tracker", "baseline"] as const;

export async function materialize(bundlePath: string, targetDir: string): Promise<void> {
  await fs.mkdir(path.dirname(targetDir), { recursive: true });
  // Line-ending translation is pinned off for the checkout. A fixture is only
  // useful if it restores byte-exactly, and a machine with core.autocrlf=true
  // (the Windows default) would otherwise hand the agent CRLF content and make
  // a score depend on the platform that produced it.
  execFileSync(
    "git",
    ["-c", "core.autocrlf=false", "-c", "core.eol=lf", "clone", "-q", bundlePath, targetDir],
    { stdio: "ignore" }
  );
}

export async function applyCondition(targetDir: string, condition: string): Promise<void> {
  if (condition === "baseline") {
    await fs.rm(path.join(targetDir, "project-progress"), { recursive: true, force: true });
  }
}
