/**
 * Integration tests for plugin-loader.ts
 *
 * Tests the verifyPluginLoad() function with mock SDK queries.
 */

import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  verifyPluginLoad,
  inspectQueryCapabilities,
  type PluginLoaderOptions,
} from "../../../../src/stages/3-execution/plugin-loader.js";
import type {
  SDKMessage,
  SDKSystemMessage,
  SDKErrorMessage,
  QueryObject,
  QueryInput,
} from "../../../../src/stages/3-execution/sdk-client.js";
import { createMockExecutionConfig } from "../../../mocks/sdk-mock.js";

const fixturesPath = path.resolve(process.cwd(), "tests/fixtures");
const validPluginPath = path.join(fixturesPath, "valid-plugin");

/**
 * Create a mock query function for plugin loading tests.
 */
function createPluginLoadQueryFn(
  config: {
    pluginName?: string;
    pluginPath?: string;
    tools?: string[];
    slashCommands?: string[];
    mcpServers?: Array<{ name: string; status: string; error?: string }>;
    sessionId?: string;
    errorMessage?: string;
    noInitMessage?: boolean;
  } = {},
): (input: QueryInput) => QueryObject {
  return (input: QueryInput): QueryObject => {
    const messages: SDKMessage[] = [];

    if (config.errorMessage) {
      const errorMsg: SDKErrorMessage = {
        type: "error",
        error: config.errorMessage,
      };
      messages.push(errorMsg);
    } else if (!config.noInitMessage) {
      const initMsg: SDKSystemMessage = {
        type: "system",
        subtype: "init",
        session_id: config.sessionId ?? "test-session-123",
        tools: config.tools ?? ["Skill", "Task", "SlashCommand", "Read"],
        slash_commands: config.slashCommands ?? ["/commit", "/review-pr"],
        plugins: [
          {
            name: config.pluginName ?? "test-plugin",
            path: config.pluginPath ?? input.options?.plugins?.[0]?.path ?? "",
          },
        ],
        ...(config.mcpServers ? { mcp_servers: config.mcpServers } : {}),
      };
      messages.push(initMsg);
    }

    return {
      [Symbol.asyncIterator]: async function* () {
        for (const msg of messages) {
          yield msg;
        }
      },
      rewindFiles: async () => {},
      supportedCommands: async () => config.slashCommands ?? [],
      mcpServerStatus: async () => {
        const status: Record<string, { status: string; tools: string[] }> = {};
        if (config.mcpServers) {
          for (const server of config.mcpServers) {
            status[server.name] = { status: server.status, tools: [] };
          }
        }
        return status;
      },
      accountInfo: async () => ({ tier: "free" }),
    } as QueryObject;
  };
}

describe("verifyPluginLoad", () => {
  it("returns successful result for valid plugin", async () => {
    const queryFn = createPluginLoadQueryFn({
      pluginName: "test-plugin",
      pluginPath: validPluginPath,
    });

    const options: PluginLoaderOptions = {
      pluginPath: validPluginPath,
      config: createMockExecutionConfig(),
      queryFn,
    };

    const result = await verifyPluginLoad(options);

    expect(result.loaded).toBe(true);
    expect(result.plugin_name).toBe("test-plugin");
    expect(result.plugin_path).toBe(validPluginPath);
    expect(result.session_id).toBe("test-session-123");
  });

  it("includes registered tools and commands", async () => {
    const queryFn = createPluginLoadQueryFn({
      pluginName: "test-plugin",
      pluginPath: validPluginPath,
      tools: ["Skill", "Task", "SlashCommand", "Read", "Write", "Edit"],
      slashCommands: ["/commit", "/review-pr", "/deploy"],
    });

    const options: PluginLoaderOptions = {
      pluginPath: validPluginPath,
      config: createMockExecutionConfig(),
      queryFn,
    };

    const result = await verifyPluginLoad(options);

    expect(result.loaded).toBe(true);
    expect(result.registered_tools).toContain("Skill");
    expect(result.registered_tools).toContain("Write");
    expect(result.registered_commands).toContain("/commit");
    expect(result.registered_commands).toContain("/deploy");
  });

  it("extracts MCP server status", async () => {
    const queryFn = createPluginLoadQueryFn({
      pluginName: "test-plugin",
      pluginPath: validPluginPath,
      mcpServers: [
        { name: "github", status: "connected" },
        { name: "postgres", status: "failed", error: "Connection refused" },
      ],
    });

    const options: PluginLoaderOptions = {
      pluginPath: validPluginPath,
      config: createMockExecutionConfig(),
      queryFn,
    };

    const result = await verifyPluginLoad(options);

    expect(result.loaded).toBe(true);
    expect(result.mcp_servers).toHaveLength(2);

    const github = result.mcp_servers.find((s) => s.name === "github");
    expect(github?.status).toBe("connected");

    const postgres = result.mcp_servers.find((s) => s.name === "postgres");
    expect(postgres?.status).toBe("failed");
    expect(postgres?.error).toBe("Connection refused");
  });

  it("includes load diagnostics", async () => {
    const queryFn = createPluginLoadQueryFn({
      pluginName: "test-plugin",
      pluginPath: validPluginPath,
      slashCommands: ["/cmd1", "/cmd2", "/cmd3"],
      mcpServers: [{ name: "server1", status: "connected" }],
    });

    const options: PluginLoaderOptions = {
      pluginPath: validPluginPath,
      config: createMockExecutionConfig(),
      queryFn,
    };

    const result = await verifyPluginLoad(options);

    expect(result.loaded).toBe(true);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics?.manifest_found).toBe(true);
    expect(result.diagnostics?.manifest_valid).toBe(true);
    expect(result.diagnostics?.components_discovered.commands).toBe(3);
    expect(result.diagnostics?.components_discovered.mcp_servers).toBe(1);
    expect(result.diagnostics?.load_duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("returns failure when plugin not in loaded list", async () => {
    const queryFn = createPluginLoadQueryFn({
      pluginName: "other-plugin",
      pluginPath: "/other/path",
    });

    const options: PluginLoaderOptions = {
      pluginPath: validPluginPath,
      config: createMockExecutionConfig(),
      queryFn,
    };

    const result = await verifyPluginLoad(options);

    expect(result.loaded).toBe(false);
    expect(result.plugin_name).toBeNull();
    expect(result.error).toContain("Plugin not found in loaded plugins");
    expect(result.error_type).toBe("manifest_not_found");
    expect(result.recovery_hint).toBeDefined();
  });

  it("handles SDK error messages", async () => {
    const queryFn = createPluginLoadQueryFn({
      errorMessage: "Plugin initialization failed: invalid manifest",
    });

    const options: PluginLoaderOptions = {
      pluginPath: validPluginPath,
      config: createMockExecutionConfig(),
      queryFn,
    };

    const result = await verifyPluginLoad(options);

    expect(result.loaded).toBe(false);
    expect(result.error).toContain("Plugin initialization error");
    expect(result.error).toContain("invalid manifest");
  });

  it("handles no init message", async () => {
    const queryFn = createPluginLoadQueryFn({
      noInitMessage: true,
    });

    const options: PluginLoaderOptions = {
      pluginPath: validPluginPath,
      config: createMockExecutionConfig(),
      queryFn,
    };

    const result = await verifyPluginLoad(options);

    expect(result.loaded).toBe(false);
    expect(result.error).toContain("No system init message received");
  });

  it("handles query function throwing error", async () => {
    const queryFn = (_input: QueryInput): QueryObject => {
      throw new Error("Network connection failed");
    };

    const options: PluginLoaderOptions = {
      pluginPath: validPluginPath,
      config: createMockExecutionConfig(),
      queryFn,
    };

    const result = await verifyPluginLoad(options);

    expect(result.loaded).toBe(false);
    expect(result.error).toContain("Plugin load failed");
    expect(result.error).toContain("Network connection failed");
  });

  it("handles async iteration throwing error", async () => {
    const queryFn = (_input: QueryInput): QueryObject => {
      return {
        [Symbol.asyncIterator]: async function* () {
          throw new Error("Stream interrupted");
        },
        rewindFiles: async () => {},
        supportedCommands: async () => [],
      } as QueryObject;
    };

    const options: PluginLoaderOptions = {
      pluginPath: validPluginPath,
      config: createMockExecutionConfig(),
      queryFn,
    };

    const result = await verifyPluginLoad(options);

    expect(result.loaded).toBe(false);
    expect(result.error).toContain("Plugin load failed");
  });

  it("handles timeout via abort signal", async () => {
    // Create a query function that never yields
    const queryFn = (input: QueryInput): QueryObject => {
      return {
        [Symbol.asyncIterator]: async function* () {
          // Wait for abort signal
          await new Promise((_, reject) => {
            if (input.options?.abortSignal?.aborted) {
              const error = new Error("Aborted");
              error.name = "AbortError";
              reject(error);
              return;
            }
            input.options?.abortSignal?.addEventListener("abort", () => {
              const error = new Error("Aborted");
              error.name = "AbortError";
              reject(error);
            });
          });
        },
        rewindFiles: async () => {},
        supportedCommands: async () => [],
      } as QueryObject;
    };

    const options: PluginLoaderOptions = {
      pluginPath: validPluginPath,
      config: createMockExecutionConfig(),
      queryFn,
      timeoutMs: 50, // Very short timeout
    };

    const result = await verifyPluginLoad(options);

    expect(result.loaded).toBe(false);
    expect(result.error_type).toBe("timeout");
    expect(result.error).toContain("timed out");
  });

  it("matches plugin by path suffix", async () => {
    // The plugin path in the mock ends with our target path
    const queryFn = (input: QueryInput): QueryObject => {
      const pluginPath = input.options?.plugins?.[0]?.path ?? "";

      const initMsg: SDKSystemMessage = {
        type: "system",
        subtype: "init",
        session_id: "test-session",
        tools: [],
        slash_commands: [],
        plugins: [
          {
            name: "test-plugin",
            path: `/some/prefix${pluginPath}`, // Path with prefix
          },
        ],
      };

      return {
        [Symbol.asyncIterator]: async function* () {
          yield initMsg;
        },
        rewindFiles: async () => {},
        supportedCommands: async () => [],
      } as QueryObject;
    };

    const options: PluginLoaderOptions = {
      pluginPath: validPluginPath,
      config: createMockExecutionConfig(),
      queryFn,
    };

    const result = await verifyPluginLoad(options);

    expect(result.loaded).toBe(true);
    expect(result.plugin_name).toBe("test-plugin");
  });

  it("extracts MCP tools from registered tools", async () => {
    const queryFn = createPluginLoadQueryFn({
      pluginName: "test-plugin",
      pluginPath: validPluginPath,
      tools: [
        "Skill",
        "Read",
        "mcp__plugin_test-plugin_github__create_issue",
        "mcp__plugin_test-plugin_github__list_repos",
        "mcp__plugin_test-plugin_postgres__query",
      ],
      mcpServers: [
        { name: "github", status: "connected" },
        { name: "postgres", status: "connected" },
      ],
    });

    const options: PluginLoaderOptions = {
      pluginPath: validPluginPath,
      config: createMockExecutionConfig(),
      queryFn,
    };

    const result = await verifyPluginLoad(options);

    expect(result.loaded).toBe(true);

    const github = result.mcp_servers.find((s) => s.name === "github");
    expect(github?.tools).toContain(
      "mcp__plugin_test-plugin_github__create_issue",
    );
    expect(github?.tools).toContain(
      "mcp__plugin_test-plugin_github__list_repos",
    );

    const postgres = result.mcp_servers.find((s) => s.name === "postgres");
    expect(postgres?.tools).toContain(
      "mcp__plugin_test-plugin_postgres__query",
    );
  });
});

describe("inspectQueryCapabilities", () => {
  it("returns commands and MCP status", async () => {
    const queryObject = {
      supportedCommands: async () => ["/commit", "/review-pr", "/deploy"],
      mcpServerStatus: async () => ({
        github: { status: "connected", tools: ["create_issue"] },
        postgres: { status: "failed", tools: [] },
      }),
      accountInfo: async () => ({ tier: "pro" }),
    };

    const result = await inspectQueryCapabilities(queryObject, "test-plugin");

    expect(result.commands).toEqual(["/commit", "/review-pr", "/deploy"]);
    expect(result.mcpStatus).toEqual({
      github: { status: "connected", tools: ["create_issue"] },
      postgres: { status: "failed", tools: [] },
    });
    expect(result.accountInfo).toEqual({ tier: "pro" });
  });

  it("handles missing optional methods", async () => {
    const queryObject = {};

    const result = await inspectQueryCapabilities(queryObject, "test-plugin");

    expect(result.commands).toEqual([]);
    expect(result.mcpStatus).toEqual({});
    expect(result.accountInfo).toBeUndefined();
  });

  it("handles accountInfo throwing error", async () => {
    const queryObject = {
      supportedCommands: async () => ["/commit"],
      mcpServerStatus: async () => ({}),
      accountInfo: async () => {
        throw new Error("Not authenticated");
      },
    };

    const result = await inspectQueryCapabilities(queryObject, "test-plugin");

    expect(result.commands).toEqual(["/commit"]);
    expect(result.accountInfo).toBeUndefined();
  });

  it("handles partial query object", async () => {
    const queryObject = {
      supportedCommands: async () => ["/commit"],
      // No mcpServerStatus or accountInfo
    };

    const result = await inspectQueryCapabilities(queryObject, "test-plugin");

    expect(result.commands).toEqual(["/commit"]);
    expect(result.mcpStatus).toEqual({});
    expect(result.accountInfo).toBeUndefined();
  });
});
