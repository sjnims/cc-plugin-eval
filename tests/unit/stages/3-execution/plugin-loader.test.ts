/**
 * Unit tests for plugin-loader.ts
 */

import { describe, expect, it } from "vitest";

import {
  getRecoveryHint,
  isPluginLoaded,
  areMcpServersHealthy,
  getFailedMcpServers,
  formatPluginLoadResult,
} from "../../../../src/stages/3-execution/plugin-loader.js";
import type { PluginLoadResult } from "../../../../src/types/index.js";

describe("getRecoveryHint", () => {
  it("should return hint for known error types", () => {
    expect(getRecoveryHint("manifest_not_found")).toContain("plugin.json");
    expect(getRecoveryHint("timeout")).toContain(
      "tuning.timeouts.plugin_load_ms",
    );
    expect(getRecoveryHint("mcp_connection_failed")).toContain("MCP server");
  });

  it("should return default hint for unknown error types", () => {
    const hint = getRecoveryHint("some_unknown_error");

    expect(hint).toContain("logs");
  });
});

describe("isPluginLoaded", () => {
  it("should return true for loaded plugin", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: "test-plugin",
      plugin_path: "/path/to/plugin",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [],
      session_id: "session-123",
    };

    expect(isPluginLoaded(result)).toBe(true);
  });

  it("should return false for failed plugin", () => {
    const result: PluginLoadResult = {
      loaded: false,
      plugin_name: null,
      plugin_path: "/path/to/plugin",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [],
      session_id: "",
      error: "Plugin not found",
    };

    expect(isPluginLoaded(result)).toBe(false);
  });

  it("should return false when loaded but no plugin name", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: null,
      plugin_path: "/path/to/plugin",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [],
      session_id: "",
    };

    expect(isPluginLoaded(result)).toBe(false);
  });
});

describe("areMcpServersHealthy", () => {
  it("should return true when no MCP servers", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: "test",
      plugin_path: "/path",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [],
      session_id: "",
    };

    expect(areMcpServersHealthy(result)).toBe(true);
  });

  it("should return true when all servers connected", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: "test",
      plugin_path: "/path",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [
        { name: "github", status: "connected", tools: [] },
        { name: "postgres", status: "connected", tools: [] },
      ],
      session_id: "",
    };

    expect(areMcpServersHealthy(result)).toBe(true);
  });

  it("should return false when any server failed", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: "test",
      plugin_path: "/path",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [
        { name: "github", status: "connected", tools: [] },
        {
          name: "postgres",
          status: "failed",
          tools: [],
          error: "Connection refused",
        },
      ],
      session_id: "",
    };

    expect(areMcpServersHealthy(result)).toBe(false);
  });

  it("should return false when server needs auth", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: "test",
      plugin_path: "/path",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [{ name: "github", status: "needs-auth", tools: [] }],
      session_id: "",
    };

    expect(areMcpServersHealthy(result)).toBe(false);
  });
});

describe("getFailedMcpServers", () => {
  it("should return empty array when all healthy", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: "test",
      plugin_path: "/path",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [{ name: "github", status: "connected", tools: [] }],
      session_id: "",
    };

    expect(getFailedMcpServers(result)).toEqual([]);
  });

  it("should return failed servers", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: "test",
      plugin_path: "/path",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [
        { name: "github", status: "connected", tools: [] },
        {
          name: "postgres",
          status: "failed",
          tools: [],
          error: "Connection refused",
        },
        { name: "slack", status: "needs-auth", tools: [] },
      ],
      session_id: "",
    };

    const failed = getFailedMcpServers(result);

    expect(failed).toHaveLength(2);
    expect(failed.map((s) => s.name)).toEqual(["postgres", "slack"]);
  });
});

describe("formatPluginLoadResult", () => {
  it("should format successful load result", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: "my-plugin",
      plugin_path: "/path/to/plugin",
      registered_tools: ["Skill", "Read", "Write"],
      registered_commands: ["/commit", "/review"],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [],
      session_id: "session-abc",
      diagnostics: {
        manifest_found: true,
        manifest_valid: true,
        components_discovered: {
          skills: 2,
          agents: 1,
          commands: 2,
          hooks: false,
          mcp_servers: 0,
        },
        load_duration_ms: 150,
      },
    };

    const formatted = formatPluginLoadResult(result);

    expect(formatted).toContain("my-plugin");
    expect(formatted).toContain("/path/to/plugin");
    expect(formatted).toContain("session-abc");
    expect(formatted).toContain("3"); // tools
    expect(formatted).toContain("2"); // commands
    expect(formatted).toContain("150ms");
  });

  it("should format failed load result", () => {
    const result: PluginLoadResult = {
      loaded: false,
      plugin_name: null,
      plugin_path: "/path/to/plugin",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [],
      session_id: "",
      error: "Plugin manifest not found",
      error_type: "manifest_not_found",
      recovery_hint: "Check plugin.json exists",
    };

    const formatted = formatPluginLoadResult(result);

    expect(formatted).toContain("failed to load");
    expect(formatted).toContain("Plugin manifest not found");
    expect(formatted).toContain("manifest_not_found");
    expect(formatted).toContain("Check plugin.json exists");
  });

  it("should format result with MCP servers", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: "mcp-plugin",
      plugin_path: "/path",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [
        {
          name: "github",
          status: "connected",
          tools: ["create_issue", "list_repos"],
        },
        {
          name: "postgres",
          status: "failed",
          tools: [],
          error: "Connection refused",
        },
      ],
      session_id: "",
    };

    const formatted = formatPluginLoadResult(result);

    expect(formatted).toContain("MCP Servers: 2");
    expect(formatted).toContain("github");
    expect(formatted).toContain("connected");
    expect(formatted).toContain("2 tools");
    expect(formatted).toContain("postgres");
    expect(formatted).toContain("failed");
  });
});
