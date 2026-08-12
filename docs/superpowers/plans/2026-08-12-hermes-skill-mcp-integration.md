# Hermes Skill + MCP Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support Hermes Agent through CLI-managed `project-progress` skill and `awesome-progress-tracker` MCP installation, status, doctor, and removal workflows.

**Architecture:** Extend the existing `src/cli.ts` agent-target branching with a narrow injectable Hermes command runner. The integration calls Hermes management commands only, parses their stable current human-readable list output in isolated helpers, and pipes confirmation only for removal of components this invocation has identified by name. It never edits Hermes profile files.

**Tech Stack:** TypeScript ESM, Node child-process APIs, Vitest, Hermes CLI, stdio MCP.

## Global Constraints

- `project-progress/Progress.md` remains the canonical state; the MCP index is derived.
- Hermes integration is supported Skill + MCP compatibility; native hooks remain explicitly deferred.
- Do not directly read, write, or infer Hermes `config.yaml` paths.
- Never overwrite a pre-existing `project-progress` skill or `awesome-progress-tracker` MCP server.
- Preserve Claude and Codex default behavior and Windows path/semicolon root handling.
- Use argument arrays, never shell commands; no automatic dependency installation.
- All profile mutations in automated tests use a fake runner; real verification uses a disposable Hermes profile.

---

## File Map

| Path | Responsibility |
| --- | --- |
| `src/cli.ts` | Hermes target parsing, subprocess seam, managed component orchestration, status, doctor, and user-facing output. |
| `tests/mcp/cli.test.ts` | Test-first coverage for exact Hermes command arguments, collisions, rollback, status, doctor, and removal. |
| `README.md` | Hermes installation, limits, verification, and removal documentation. |
| `TESTING.md` | Disposable-profile end-to-end Hermes validation procedure. |
| `RELEASE_CHECKLIST.md` | Hermes packaging and smoke-test release gates. |

### Task 1: Add the Hermes target and command-runner boundary

**Files:**
- Modify: `src/cli.ts:56-110, 116-155, 574-650`
- Test: `tests/mcp/cli.test.ts:49-74`

**Interfaces:**
- Produces `AgentTarget = "claude" | "codex" | "hermes"`.
- Produces `CommandRunner(command, args, options)` returning `{ stdout, stderr }` and accepting optional `stdin` for an explicit confirmation response.

- [ ] **Step 1: Write failing parser and help-text tests.**

```ts
expect(parseArgs(["install", "-g", "hermes"]).agent).toBe("hermes");
expect(parseArgs(["install", "--agent=hermes"]).agent).toBe("hermes");
expect(helpText()).toContain("claude|codex|hermes");
expect(() => parseArgs(["install", "-g", "both"])).toThrow(/claude, codex, or hermes/);
```

- [ ] **Step 2: Run the focused test and observe the parser rejection.**

Run: `npm test -- tests/mcp/cli.test.ts`

Expected: FAIL because `hermes` is rejected.

- [ ] **Step 3: Implement the target and runner.**

```ts
export type CommandRunner = (
  command: string,
  args: string[],
  options?: { stdin?: string; timeout?: number }
) => Promise<{ stdout: string; stderr: string }>;
```

Use a production `spawn`-based runner so `stdin: "y\n"` can be supplied only
to confirmed `hermes skills uninstall` and `hermes mcp remove` operations.
Expose it through options for tests; do not change existing Claude/Codex paths.

- [ ] **Step 4: Re-run the focused test.**

Run: `npm test -- tests/mcp/cli.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/cli.ts tests/mcp/cli.test.ts
git commit -m "feat: accept Hermes install target"
```

### Task 2: Install the managed Hermes skill and MCP server safely

**Files:**
- Modify: `src/cli.ts:360-405`
- Test: `tests/mcp/cli.test.ts`

**Interfaces:**
- Consumes `InstallOptions { agent: "hermes", roots?, mcpOnly?, commandRunner? }`.
- Produces `InstallResult { agent: "hermes", writtenFiles: ["Hermes skill: project-progress", "Hermes MCP server: awesome-progress-tracker"] }`.

- [ ] **Step 1: Write failing command-contract tests.**

Use a fake runner that returns a no-collision `skills list` and `mcp list` output.
Assert the full installation calls in order:

```ts
[
  ["hermes", ["skills", "list", "--source", "hub"]],
  ["hermes", ["mcp", "list"]],
  ["hermes", ["skills", "install", skillUrl, "--name", "project-progress", "--yes"]],
  ["hermes", ["mcp", "add", "awesome-progress-tracker", "--command", "npx", "--env", "PROJECT_PROGRESS_ROOTS=C:/one;C:/two", "--args", "-y", PACKAGE_SPEC, "mcp"]]
]
```

Also assert `mcpOnly` skips the skill calls; a named collision stops before any
mutation; and an MCP add failure calls only `hermes skills uninstall
project-progress` with `stdin: "y\n"`, then includes both errors if rollback
fails.

- [ ] **Step 2: Run the focused test and observe the missing Hermes branch.**

Run: `npm test -- tests/mcp/cli.test.ts`

Expected: FAIL because Hermes installation is not implemented.

- [ ] **Step 3: Implement isolated Hermes helpers.**

Add `HERMES_SKILL_NAME`, `HERMES_MCP_NAME`, and `hermesSkillUrl()` based on the
package version's matching `v<version>` GitHub raw `SKILL.md` URL. Add pure
`parseHermesSkillList` and `parseHermesMcpList` helpers that match an exact
first-column name after ANSI escape removal. Install only after both lists show
no collision. Use the existing `normalizeRoots()` value in the MCP `--env`
argument; keep `--args` last because Hermes consumes the remainder.

- [ ] **Step 4: Re-run the focused test.**

Run: `npm test -- tests/mcp/cli.test.ts`

Expected: PASS, including existing install behavior.

- [ ] **Step 5: Commit.**

```bash
git add src/cli.ts tests/mcp/cli.test.ts
git commit -m "feat: install project progress for Hermes"
```

### Task 3: Implement Hermes status, doctor, and uninstall behavior

**Files:**
- Modify: `src/cli.ts:407-557, 707-770`
- Test: `tests/mcp/cli.test.ts`

**Interfaces:**
- `readStatus({ agent: "hermes" })` reports `skillInstalled` and `mcpConfigured` using Hermes list commands.
- `runDoctor({ agent: "hermes" })` reports `hermes`, `skill`, `mcp`, `mcp-connection`, `index`, and `project` checks.
- `uninstallAgent({ agent: "hermes" })` removes only present managed components and is idempotent.

- [ ] **Step 1: Write failing lifecycle-management tests.**

```ts
expect(await readStatus({ agent: "hermes", commandRunner: fake })).toMatchObject({
  agent: "hermes", skillInstalled: true, mcpConfigured: true, bootstrapInstalled: false
});
expect(await uninstallAgent({ agent: "hermes", commandRunner: fake })).toMatchObject({
  changedFiles: ["Hermes MCP server: awesome-progress-tracker", "Hermes skill: project-progress"]
});
expect(calls).toContainEqual(["hermes", ["mcp", "test", "awesome-progress-tracker"]]);
```

Cover missing components without removal calls, unavailable Hermes executable,
failed `mcp test`, and error output that identifies the failed Hermes
subcommand.

- [ ] **Step 2: Run the focused test and observe the absent behavior.**

Run: `npm test -- tests/mcp/cli.test.ts`

Expected: FAIL because the Codex fall-through currently treats Hermes as Codex.

- [ ] **Step 3: Implement the Hermes branches.**

`readStatus` invokes the two list commands and returns conceptual component
labels rather than config file paths. `runDoctor` checks `hermes --version`,
the two component states, `hermes mcp test awesome-progress-tracker` only when
configured, index writability, and project initialization. Uninstall lists
first, then removes MCP before skill with `stdin: "y\n"`; absence is success.

- [ ] **Step 4: Re-run focused tests.**

Run: `npm test -- tests/mcp/cli.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/cli.ts tests/mcp/cli.test.ts
git commit -m "feat: manage Hermes tracker setup"
```

### Task 4: Document supported limits and package verification

**Files:**
- Modify: `README.md`
- Modify: `TESTING.md`
- Modify: `RELEASE_CHECKLIST.md`
- Test: `tests/hook/instruction-pack.test.ts`

**Interfaces:**
- Documents supported commands and an explicit no-hooks limitation.
- Provides a disposable-profile verification sequence that never changes the deployed Hermes profile.

- [ ] **Step 1: Write failing documentation assertions.**

```ts
expect(await fs.readFile("README.md", "utf-8")).toContain("Hermes Agent");
expect(await fs.readFile("README.md", "utf-8")).toContain("install -g hermes");
expect(await fs.readFile("README.md", "utf-8")).toContain("lifecycle hooks are deferred");
```

- [ ] **Step 2: Run the focused documentation test.**

Run: `npm test -- tests/hook/instruction-pack.test.ts`

Expected: FAIL on Hermes documentation.

- [ ] **Step 3: Document exact supported operations.**

Add Hermes to the README matrix and include `install`, `doctor`, and
`uninstall` commands. Explain the named collision behavior, restart guidance,
and that only skill/MCP are supported now. In `TESTING.md`, require a temporary
`HERMES_HOME`, package build, install, `hermes skills list`, `hermes mcp list`,
`hermes mcp test`, agent tool discovery/read/update, opt-out, and uninstall.
Add matching release checklist gates.

- [ ] **Step 4: Re-run focused documentation test.**

Run: `npm test -- tests/hook/instruction-pack.test.ts tests/mcp/cli.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add README.md TESTING.md RELEASE_CHECKLIST.md tests/hook/instruction-pack.test.ts tests/mcp/cli.test.ts
git commit -m "docs: document Hermes integration"
```

### Task 5: Run complete verification and isolated Hermes smoke test

**Files:**
- Modify only if observed output requires correction: `TESTING.md`, `RELEASE_CHECKLIST.md`

- [ ] **Step 1: Run repository verification.**

Run:

```bash
npm test
npm run typecheck
npm run build
npm pack --dry-run
```

Expected: all commands exit zero.

- [ ] **Step 2: Verify a packaged artifact in a disposable profile.**

Create a temporary `HERMES_HOME`, install from the package artifact, then run:

```bash
hermes skills list --source hub
hermes mcp list
hermes mcp test awesome-progress-tracker
```

Expected: the managed skill and MCP server are present, and the MCP test lists
the tracker tools. In a temporary initialized repo, verify one list/read/update
operation; in an uninitialized repo, decline initialization and verify opt-out.

- [ ] **Step 3: Verify clean removal.**

Run package `uninstall -g hermes`, repeat the two list commands, and confirm
the temporary project’s `project-progress/` content was not deleted.

- [ ] **Step 4: Record durable evidence and commit if documentation changes.**

```bash
git diff --check
git status --short
```

If a documented command changes, update the documentation, repeat the focused
tests, and commit only those documentation changes.

## Plan Self-Review

- Spec coverage: Tasks 1-3 cover CLI management, collision safety, rollback,
  status, doctor, removal, and no direct profile edits; Task 4 covers support
  limits and instructions; Task 5 covers packaged isolated-profile evidence.
- No-placeholder scan: no task relies on an undefined future interface; the
  command runner and parsing helpers are named before use.
- Type consistency: `AgentTarget`, `CommandRunner`, `InstallOptions`,
  `StatusOptions`, `InstallResult`, and `UninstallResult` are the interfaces
  used consistently throughout the plan.
