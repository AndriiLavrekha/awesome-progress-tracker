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

// A condition is an overlay: the files it copies into the restored tree are
// the only thing that distinguishes it. `baseline` ships no overlay and is
// therefore the bare repository; `tracker` ships project-progress/; a
// competitor's memory system is added by dropping its files under
// conditions/<name>/ with no change to this harness.
//
// Removing files after the fact was the original design and it did not work.
// The bundle still carried project-progress in its history, so a baseline
// agent recovered the resume note with git log and the condition measured
// nothing. What a condition does not add is not present at all.
export async function applyCondition(
  targetDir: string,
  condition: string,
  scenarioDir: string
): Promise<void> {
  const overlay = path.join(scenarioDir, "conditions", condition);
  try {
    await fs.access(overlay);
  } catch {
    return;
  }

  await fs.cp(overlay, targetDir, { recursive: true });

  // Commit it, so every condition hands the agent a clean working tree. An
  // agent that opens on a dirty tree behaves differently, and that difference
  // would be read as a difference in resumption.
  execFileSync("git", ["add", "-A"], { cwd: targetDir, stdio: "ignore" });
  execFileSync(
    "git",
    ["-c", "user.email=bench@example.com", "-c", "user.name=Bench", "commit", "-q", "-m", `apply ${condition} condition`],
    { cwd: targetDir, stdio: "ignore" }
  );
}
