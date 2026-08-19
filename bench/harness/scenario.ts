import { promises as fs } from "node:fs";
import path from "node:path";

export interface Expectations {
  // Regular expressions, tested case-insensitively against each transcript
  // event's action string. A correct action has many correct phrasings, so
  // these are matchers rather than one exact string.
  correctNextAction: string[];
  mustTouch: string[];
  mustNotTouch: string[];
  alreadyDone: string[];
}

export interface Scenario {
  id: string;
  dir: string;
  bundlePath: string;
  expectations: Expectations;
}

function stringList(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  for (const entry of value) {
    if (typeof entry !== "string") throw new Error(`${field} entries must be strings`);
  }
  return value as string[];
}

function assertValidPatterns(patterns: string[], field: string): void {
  for (const pattern of patterns) {
    try {
      new RegExp(pattern, "i");
    } catch {
      throw new Error(`${field} entry ${JSON.stringify(pattern)} is not a valid regular expression`);
    }
  }
}

export function parseExpectations(raw: string): Expectations {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("expected.json could not be parsed as JSON");
  }

  const record = parsed as Record<string, unknown>;
  const correctNextAction = stringList(record.correctNextAction, "correctNextAction");
  if (correctNextAction.length === 0) {
    throw new Error("correctNextAction must be a non-empty array");
  }

  const alreadyDone = stringList(record.alreadyDone, "alreadyDone");
  assertValidPatterns(correctNextAction, "correctNextAction");
  assertValidPatterns(alreadyDone, "alreadyDone");

  return {
    correctNextAction,
    mustTouch: stringList(record.mustTouch, "mustTouch"),
    mustNotTouch: stringList(record.mustNotTouch, "mustNotTouch"),
    alreadyDone
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadScenario(scenariosRoot: string, id: string): Promise<Scenario> {
  const dir = path.join(scenariosRoot, id);
  if (!(await exists(dir))) throw new Error(`scenario ${id} not found in ${scenariosRoot}`);

  const bundlePath = path.join(dir, "repo.bundle");
  if (!(await exists(bundlePath))) throw new Error(`scenario ${id} has no repo.bundle`);

  const expectedPath = path.join(dir, "expected.json");
  if (!(await exists(expectedPath))) throw new Error(`scenario ${id} has no expected.json`);

  return {
    id,
    dir,
    bundlePath,
    expectations: parseExpectations(await fs.readFile(expectedPath, "utf-8"))
  };
}
