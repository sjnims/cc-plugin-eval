import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  discoverAgentFiles,
  discoverCommandFiles,
  discoverSkillDirs,
  getFullName,
  resolveComponentPaths,
} from "../../../../src/stages/1-analysis/path-resolver.js";
import type { PluginManifest } from "../../../../src/types/index.js";

const fixturesPath = path.resolve(process.cwd(), "tests/fixtures");
const validPluginPath = path.join(fixturesPath, "valid-plugin");

describe("resolveComponentPaths", () => {
  it("returns default paths when no custom paths in manifest", () => {
    const manifest: PluginManifest = { name: "test-plugin" };
    const paths = resolveComponentPaths(validPluginPath, manifest);

    // Should include existing default directories
    expect(paths.skills.length).toBeGreaterThanOrEqual(1);
    expect(paths.agents.length).toBeGreaterThanOrEqual(1);
    expect(paths.commands.length).toBeGreaterThanOrEqual(1);

    // All paths should be under the plugin root
    for (const p of [...paths.skills, ...paths.agents, ...paths.commands]) {
      expect(p.startsWith(validPluginPath)).toBe(true);
    }
  });

  it("supplements defaults with custom command paths", () => {
    const manifest: PluginManifest = {
      name: "test-plugin",
      commands: "./custom-commands",
    };
    const paths = resolveComponentPaths(validPluginPath, manifest);

    // Default commands path should still be present (if it exists)
    const defaultPath = path.join(validPluginPath, "commands");
    expect(paths.commands).toContain(defaultPath);
  });

  it("handles array of custom paths", () => {
    const manifest: PluginManifest = {
      name: "test-plugin",
      agents: ["./agents", "./more-agents"],
    };
    const paths = resolveComponentPaths(validPluginPath, manifest);

    // Default agents path should be present
    const defaultPath = path.join(validPluginPath, "agents");
    expect(paths.agents).toContain(defaultPath);
  });

  it("filters out non-existent paths", () => {
    const manifest: PluginManifest = {
      name: "test-plugin",
      commands: "./non-existent-dir",
    };
    const paths = resolveComponentPaths(validPluginPath, manifest);

    // Non-existent custom path should not be in the result
    const nonExistent = path.join(validPluginPath, "non-existent-dir");
    expect(paths.commands).not.toContain(nonExistent);
  });

  it("resolves hooks path when provided", () => {
    const manifest: PluginManifest = {
      name: "test-plugin",
      hooks: "./hooks.json",
    };
    const paths = resolveComponentPaths(validPluginPath, manifest);

    expect(paths.hooks).toBe(path.join(validPluginPath, "hooks.json"));
  });

  it("resolves mcpServers path when provided", () => {
    const manifest: PluginManifest = {
      name: "test-plugin",
      mcpServers: "./.mcp.json",
    };
    const paths = resolveComponentPaths(validPluginPath, manifest);

    expect(paths.mcpServers).toBe(path.join(validPluginPath, ".mcp.json"));
  });

  it("returns null for hooks/mcpServers when not provided", () => {
    const manifest: PluginManifest = { name: "test-plugin" };
    const paths = resolveComponentPaths(validPluginPath, manifest);

    expect(paths.hooks).toBeNull();
    expect(paths.mcpServers).toBeNull();
  });
});

describe("discoverSkillDirs", () => {
  it("discovers skill directories containing SKILL.md", async () => {
    const skillPaths = [path.join(validPluginPath, "skills")];
    const skillDirs = await discoverSkillDirs(skillPaths);

    expect(skillDirs.length).toBeGreaterThanOrEqual(2);

    // Each discovered dir should contain SKILL.md
    for (const dir of skillDirs) {
      expect(dir).toMatch(/skills\/[^/]+$/);
    }
  });

  it("returns empty array for non-existent paths", async () => {
    const skillDirs = await discoverSkillDirs(["/non/existent/path"]);
    expect(skillDirs).toHaveLength(0);
  });

  it("returns empty array for empty input", async () => {
    const skillDirs = await discoverSkillDirs([]);
    expect(skillDirs).toHaveLength(0);
  });
});

describe("discoverAgentFiles", () => {
  it("discovers agent markdown files", async () => {
    const agentPaths = [path.join(validPluginPath, "agents")];
    const agentFiles = await discoverAgentFiles(agentPaths);

    expect(agentFiles.length).toBeGreaterThanOrEqual(2);

    // All files should be .md
    for (const file of agentFiles) {
      expect(file).toMatch(/\.md$/);
    }
  });

  it("discovers nested agent files", async () => {
    const agentPaths = [path.join(validPluginPath, "agents")];
    const agentFiles = await discoverAgentFiles(agentPaths);

    // Should find files in subdirectories too (** glob)
    expect(agentFiles.some((f) => f.includes("agents/"))).toBe(true);
  });

  it("returns empty array for non-existent paths", async () => {
    const agentFiles = await discoverAgentFiles(["/non/existent/path"]);
    expect(agentFiles).toHaveLength(0);
  });
});

describe("discoverCommandFiles", () => {
  it("discovers command files with namespace info", async () => {
    const commandPaths = [path.join(validPluginPath, "commands")];
    const commandFiles = await discoverCommandFiles(commandPaths);

    expect(commandFiles.length).toBeGreaterThanOrEqual(2);

    // Each should have path, namespace, and basePath
    for (const file of commandFiles) {
      expect(file.path).toMatch(/\.md$/);
      expect(typeof file.namespace).toBe("string");
      expect(file.basePath).toBe(commandPaths[0]);
    }
  });

  it("extracts correct namespace from nested directories", async () => {
    const commandPaths = [path.join(validPluginPath, "commands")];
    const commandFiles = await discoverCommandFiles(commandPaths);

    // Find the nested command
    const nestedCommand = commandFiles.find((f) =>
      f.path.includes("advanced/nested-command.md"),
    );

    expect(nestedCommand).toBeDefined();
    expect(nestedCommand?.namespace).toBe("advanced");
  });

  it("uses empty string for root-level commands", async () => {
    const commandPaths = [path.join(validPluginPath, "commands")];
    const commandFiles = await discoverCommandFiles(commandPaths);

    // Find a root-level command
    const rootCommand = commandFiles.find(
      (f) => f.path.includes("test-command.md") && !f.path.includes("advanced"),
    );

    expect(rootCommand).toBeDefined();
    expect(rootCommand?.namespace).toBe("");
  });

  it("returns empty array for non-existent paths", async () => {
    const commandFiles = await discoverCommandFiles(["/non/existent/path"]);
    expect(commandFiles).toHaveLength(0);
  });
});

describe("getFullName", () => {
  it("returns name only when namespace is empty", () => {
    expect(getFullName("my-command", "")).toBe("my-command");
  });

  it("combines namespace and name with slash", () => {
    expect(getFullName("my-command", "advanced")).toBe("advanced/my-command");
  });

  it("handles deeply nested namespaces", () => {
    expect(getFullName("cmd", "a/b/c")).toBe("a/b/c/cmd");
  });
});
