import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSession } from "./normalize.js";
import { loadScenario } from "./scenario.js";
import { scoreTranscript } from "./score.js";
import { applyCondition, materialize } from "./setup.js";
import { parseTranscript } from "./transcript.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// cli.js runs from bench/dist/harness, so scenarios are two levels up.
const SCENARIOS_ROOT = path.resolve(HERE, "..", "..", "scenarios");

function usage(): string {
  return [
    "Usage:",
    "  npm run bench -- setup <scenario-id> [--condition tracker|baseline|<name>]",
    "  npm run bench -- normalize <session.jsonl> <transcript.jsonl>",
    "  npm run bench -- score <scenario-id> <transcript.jsonl>",
    ""
  ].join("\n");
}

function flag(argv: string[], name: string, fallback: string): string {
  const index = argv.indexOf(`--${name}`);
  return index === -1 || index + 1 >= argv.length ? fallback : argv[index + 1];
}

async function runSetup(argv: string[]): Promise<number> {
  const id = argv[1];
  if (!id) {
    process.stderr.write(usage());
    return 1;
  }

  const condition = flag(argv, "condition", "tracker");
  const scenario = await loadScenario(SCENARIOS_ROOT, id);
  const target = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "bench-")), `${id}-${condition}`);

  await materialize(scenario.bundlePath, target);
  await applyCondition(target, condition);

  const readme = await fs
    .readFile(path.join(scenario.dir, "README.md"), "utf-8")
    .catch(() => "(no README.md for this scenario)");

  process.stdout.write(
    [
      `scenario:  ${id}`,
      `condition: ${condition}`,
      `directory: ${target}`,
      "",
      "Run your agent in that directory with the prompt below, save a normalized",
      "JSONL transcript, then score it with:",
      `  npm run bench -- score ${id} <transcript.jsonl>`,
      "",
      "--- prompt ---",
      readme,
      ""
    ].join("\n")
  );

  return 0;
}

// Converts a Claude Code session transcript into the graded event stream.
// Kept separate from score so the normalized file is an artifact in its own
// right: it is what a disputed number is recomputed from, and it can be read
// by someone who does not have the original session.
async function runNormalize(argv: string[]): Promise<number> {
  const sessionPath = argv[1];
  const outPath = argv[2];
  if (!sessionPath || !outPath) {
    process.stderr.write(usage());
    return 1;
  }

  const events = normalizeSession(await fs.readFile(sessionPath, "utf-8"));
  await fs.writeFile(outPath, events.map((event) => JSON.stringify(event)).join("\n") + "\n", "utf-8");

  process.stdout.write(`wrote ${events.length} events to ${outPath}\n`);
  return 0;
}

async function runScore(argv: string[]): Promise<number> {
  const id = argv[1];
  const transcriptPath = argv[2];
  if (!id || !transcriptPath) {
    process.stderr.write(usage());
    return 1;
  }

  const scenario = await loadScenario(SCENARIOS_ROOT, id);
  const events = parseTranscript(await fs.readFile(transcriptPath, "utf-8"));
  const score = scoreTranscript(events, scenario.expectations);

  const tokens =
    score.tokensToCorrectNextAction === null
      ? "never reached"
      : String(score.tokensToCorrectNextAction);

  process.stdout.write(
    [
      `scenario:              ${id}`,
      `tokens-to-correct:     ${tokens}`,
      `duplicate-work:        ${score.duplicateWorkCount}`,
      `wrong-file-touches:    ${score.wrongFileTouches}`,
      `total-tokens:          ${score.totalTokens}`,
      ""
    ].join("\n")
  );

  return 0;
}

export async function main(argv: string[]): Promise<number> {
  try {
    switch (argv[0]) {
      case "setup":
        return await runSetup(argv);
      case "normalize":
        return await runNormalize(argv);
      case "score":
        return await runScore(argv);
      default:
        process.stderr.write(usage());
        return 1;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
