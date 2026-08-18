import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();

async function readJson(rel: string): Promise<any> {
  return JSON.parse(await fs.readFile(path.join(root, rel), "utf-8"));
}

async function exists(rel: string): Promise<boolean> {
  try {
    await fs.access(path.join(root, rel));
    return true;
  } catch {
    return false;
  }
}

describe("plugin manifests", () => {
  it("declares a valid plugin.json", async () => {
    const plugin = await readJson(".claude-plugin/plugin.json");
    expect(plugin.name).toBe("project-progress");
    expect(typeof plugin.version).toBe("string");
    expect(plugin.description.length).toBeGreaterThan(20);
  });

  it("keeps plugin, marketplace, and npm package versions in sync", async () => {
    const pkg = await readJson("package.json");
    const plugin = await readJson(".claude-plugin/plugin.json");
    const market = await readJson(".claude-plugin/marketplace.json");
    const codexPlugin = await readJson(".codex-plugin/plugin.json");

    // `claude plugin update` / `codex plugin update` read their own
    // plugin.json's version to decide whether an update is available; if
    // this drifts from package.json, the CLI reports "already at the latest
    // version" even after a real release ships.
    expect(plugin.version).toBe(pkg.version);
    expect(market.metadata.version).toBe(pkg.version);
    expect(codexPlugin.version).toBe(pkg.version);
  });

  it("exposes the plugin through a self-sourced marketplace", async () => {
    const market = await readJson(".claude-plugin/marketplace.json");
    const plugin = await readJson(".claude-plugin/plugin.json");
    expect(market.name).toBe("awesome-progress-tracker");
    expect(Array.isArray(market.plugins)).toBe(true);
    const entry = market.plugins.find((p: any) => p.name === plugin.name);
    expect(entry).toBeDefined();
    expect(entry.source).toBe("./");
  });

  it("registers the MCP server at a path that exists in dist", async () => {
    const mcp = await readJson(".mcp.json");
    const server = mcp.mcpServers["project-progress"];
    expect(server.command).toBe("node");
    const arg = server.args[0];
    expect(arg).toContain("${CLAUDE_PLUGIN_ROOT}");
    const rel = arg.replace("${CLAUDE_PLUGIN_ROOT}/", "");
    expect(rel).toBe("dist/src/mcp/server.js");
    expect(await exists(rel)).toBe(true);
  });

  it("wires lifecycle hooks to the committed adapter", async () => {
    const hooks = await readJson("hooks/hooks.json");
    const events = hooks.hooks;
    expect(Object.keys(events)).toEqual(expect.arrayContaining(["SessionStart", "PreToolUse", "Stop"]));

    const commands: string[] = [];
    for (const groups of Object.values<any>(events)) {
      for (const group of groups) {
        for (const hook of group.hooks) commands.push(hook.command);
      }
    }
    // Every hook command must invoke the committed adapter with a known subcommand.
    const subs = new Set<string>();
    for (const command of commands) {
      expect(command).toContain("${CLAUDE_PLUGIN_ROOT}/dist/src/hook/cc-adapter.js");
      const match = command.match(/cc-adapter\.js"?\s+(\S+)/);
      if (match) subs.add(match[1]);
    }
    expect(subs).toEqual(new Set(["session-start", "pre-commit", "pre-edit", "stop"]));
    expect(await exists("dist/src/hook/cc-adapter.js")).toBe(true);
  });

  it("ships the skill and init command the plugin advertises", async () => {
    expect(await exists("skills/project-progress/SKILL.md")).toBe(true);
    const skill = await fs.readFile(path.join(root, "skills/project-progress/SKILL.md"), "utf-8");
    expect(skill).toContain("name: project-progress");

    expect(await exists("commands/init.md")).toBe(true);
    const command = await fs.readFile(path.join(root, "commands/init.md"), "utf-8");
    expect(command).toContain("description:");
  });
});

describe("Codex plugin manifests", () => {
  it("declares a valid .codex-plugin/plugin.json referencing bundled components", async () => {
    const plugin = await readJson(".codex-plugin/plugin.json");
    const claude = await readJson(".claude-plugin/plugin.json");
    // Same plugin identity across both ecosystems.
    expect(plugin.name).toBe(claude.name);
    expect(plugin.version).toBe(claude.version);
    // Codex requires explicit component references.
    expect(plugin.skills).toBe("./skills/");
    expect(plugin.mcpServers).toBe("./.mcp.codex.json");
    expect(plugin.hooks).toBe("./hooks/hooks-codex.json");
    expect(plugin.interface.displayName.length).toBeGreaterThan(0);
    expect(await exists("hooks/hooks-codex.json")).toBe(true);
  });

  it("launches the bundled Codex MCP server from the plugin root", async () => {
    const mcp = await readJson(".mcp.codex.json");
    const server = mcp.mcpServers["project-progress"];

    expect(server.command).toBe("node");
    expect(server.args).toEqual(["dist/src/mcp/server.js"]);
    expect(server.cwd).toBe(".");
    expect(await exists(server.args[0])).toBe(true);
  });

  it("exposes the plugin through a Codex (.agents) marketplace", async () => {
    const market = await readJson(".agents/plugins/marketplace.json");
    expect(Array.isArray(market.plugins)).toBe(true);
    const entry = market.plugins.find((p: any) => p.name === "project-progress");
    expect(entry).toBeDefined();
    expect(entry.source).toEqual({ source: "local", path: "." });
  });

  it("wires Codex lifecycle hooks to the committed adapter via PLUGIN_ROOT", async () => {
    const hooks = await readJson("hooks/hooks-codex.json");
    expect(Object.keys(hooks.hooks)).toEqual(expect.arrayContaining(["SessionStart", "PreToolUse", "Stop"]));

    const subs = new Set<string>();
    for (const groups of Object.values<any>(hooks.hooks)) {
      for (const group of groups) {
        for (const hook of group.hooks) {
          // Codex hooks must not use the Claude-only `if` field.
          expect(hook.if).toBeUndefined();
          expect(hook.command).toContain("${PLUGIN_ROOT}/dist/src/hook/cc-adapter.js");
          const match = hook.command.match(/cc-adapter\.js"?\s+(\S+)/);
          if (match) subs.add(match[1]);
        }
      }
    }
    expect(subs).toEqual(new Set(["session-start", "pre-commit", "pre-edit", "stop-soft"]));
  });
});
