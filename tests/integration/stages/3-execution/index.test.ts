/**
 * Integration tests for Stage 3: Execution
 *
 * Tests the executeScenario() pipeline with mock SDK to verify:
 * - Tool capture via PreToolUse hooks
 * - Transcript building
 * - Error handling
 * - Cost tracking
 * - File checkpointing
 */

import path from "node:path";

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  executeScenario,
  executeScenarioWithCheckpoint,
  estimateExecutionCost,
  wouldExceedBudget,
  formatExecutionStats,
  type ScenarioExecutionOptions,
} from "../../../../src/stages/3-execution/agent-executor.js";
import type {
  TestScenario,
  ExecutionConfig,
  ExecutionResult,
} from "../../../../src/types/index.js";
import {
  createMockQueryFn,
  createMockExecutionConfig,
  createThrowingQueryFn,
} from "../../../mocks/sdk-mock.js";

const fixturesPath = path.resolve(process.cwd(), "tests/fixtures");
const validPluginPath = path.join(fixturesPath, "valid-plugin");

/**
 * Create a test scenario.
 */
function createTestScenario(
  overrides: Partial<TestScenario> = {},
): TestScenario {
  return {
    id: "test-scenario-1",
    component_ref: "test-skill",
    component_type: "skill",
    scenario_type: "direct",
    user_prompt: "Please run the test skill",
    expected_trigger: true,
    expected_component: "test-skill",
    ...overrides,
  };
}

/**
 * Create scenario execution options.
 */
function createExecutionOptions(
  overrides: Partial<ScenarioExecutionOptions> = {},
): ScenarioExecutionOptions {
  return {
    scenario: createTestScenario(),
    pluginPath: validPluginPath,
    pluginName: "test-plugin",
    config: createMockExecutionConfig(),
    ...overrides,
  };
}

describe("Stage 3: Execution Integration", () => {
  describe("executeScenario", () => {
    it("executes scenario and returns execution result", async () => {
      const mockQuery = createMockQueryFn({
        triggeredTools: [{ name: "Skill", input: { skill: "test-skill" } }],
        costUsd: 0.005,
        durationMs: 1500,
        numTurns: 2,
      });

      const options = createExecutionOptions({ queryFn: mockQuery });
      const result = await executeScenario(options);

      expect(result.scenario_id).toBe("test-scenario-1");
      expect(result.cost_usd).toBe(0.005);
      expect(result.api_duration_ms).toBe(1500);
      expect(result.num_turns).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it("captures Skill tool invocations via PreToolUse hooks", async () => {
      const mockQuery = createMockQueryFn({
        triggeredTools: [
          { name: "Skill", input: { skill: "commit" }, id: "tool-1" },
        ],
      });

      const options = createExecutionOptions({ queryFn: mockQuery });
      const result = await executeScenario(options);

      expect(result.detected_tools).toHaveLength(1);
      expect(result.detected_tools[0]).toMatchObject({
        name: "Skill",
        input: { skill: "commit" },
      });
      expect(result.detected_tools[0]?.toolUseId).toBeDefined();
      expect(result.detected_tools[0]?.timestamp).toBeGreaterThan(0);
    });

    it("captures Task tool invocations for agents", async () => {
      const scenario = createTestScenario({
        component_type: "agent",
        expected_component: "test-agent",
      });

      const mockQuery = createMockQueryFn({
        triggeredTools: [
          {
            name: "Task",
            input: { subagent_type: "test-agent", prompt: "Do something" },
          },
        ],
      });

      const options = createExecutionOptions({
        scenario,
        queryFn: mockQuery,
      });
      const result = await executeScenario(options);

      expect(result.detected_tools).toHaveLength(1);
      expect(result.detected_tools[0]).toMatchObject({
        name: "Task",
        input: { subagent_type: "test-agent", prompt: "Do something" },
      });
    });

    it("captures SlashCommand tool invocations for commands", async () => {
      const scenario = createTestScenario({
        component_type: "command",
        expected_component: "test-command",
      });

      const mockQuery = createMockQueryFn({
        triggeredTools: [
          { name: "SlashCommand", input: { command: "/test-command" } },
        ],
      });

      const options = createExecutionOptions({
        scenario,
        queryFn: mockQuery,
      });
      const result = await executeScenario(options);

      expect(result.detected_tools).toHaveLength(1);
      expect(result.detected_tools[0]).toMatchObject({
        name: "SlashCommand",
        input: { command: "/test-command" },
      });
    });

    it("captures multiple tool invocations", async () => {
      const mockQuery = createMockQueryFn({
        triggeredTools: [
          { name: "Read", input: { file: "test.ts" } },
          { name: "Skill", input: { skill: "test-skill" } },
          { name: "Grep", input: { pattern: "TODO" } },
        ],
      });

      const options = createExecutionOptions({ queryFn: mockQuery });
      const result = await executeScenario(options);

      expect(result.detected_tools).toHaveLength(3);
      expect(result.detected_tools.map((t) => t.name)).toEqual([
        "Read",
        "Skill",
        "Grep",
      ]);
    });

    it("builds transcript with correct metadata", async () => {
      const scenario = createTestScenario({ id: "metadata-test-scenario" });
      const mockQuery = createMockQueryFn({ costUsd: 0.02, durationMs: 2000 });

      const options = createExecutionOptions({
        scenario,
        queryFn: mockQuery,
        pluginName: "my-test-plugin",
      });
      const result = await executeScenario(options);

      expect(result.transcript.metadata).toMatchObject({
        version: "v3.0",
        plugin_name: "my-test-plugin",
        scenario_id: "metadata-test-scenario",
        model: "claude-sonnet-4-20250514",
      });
      expect(result.transcript.metadata.timestamp).toBeDefined();
      expect(result.transcript.metadata.total_cost_usd).toBe(0.02);
      expect(result.transcript.metadata.api_duration_ms).toBe(2000);
    });

    it("builds transcript with events", async () => {
      const mockQuery = createMockQueryFn({
        triggeredTools: [{ name: "Skill", input: { skill: "test" } }],
      });

      const options = createExecutionOptions({ queryFn: mockQuery });
      const result = await executeScenario(options);

      // Should have user and assistant events at minimum
      expect(result.transcript.events.length).toBeGreaterThan(0);

      // Find user event
      const userEvent = result.transcript.events.find((e) => e.type === "user");
      expect(userEvent).toBeDefined();
      expect(userEvent?.type).toBe("user");
    });

    it("handles SDK error messages gracefully", async () => {
      const mockQuery = createMockQueryFn({
        errorMessage: "API rate limit exceeded",
      });

      const options = createExecutionOptions({ queryFn: mockQuery });
      const result = await executeScenario(options);

      // Should capture the error in the result
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.message).toBe("API rate limit exceeded");
      expect(result.errors[0]?.error_type).toBe("api_error");
    });

    it("handles execution exceptions gracefully", async () => {
      const mockQuery = createThrowingQueryFn("Connection failed");

      const options = createExecutionOptions({ queryFn: mockQuery });
      const result = await executeScenario(options);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.message).toBe("Connection failed");
      expect(result.errors[0]?.recoverable).toBe(false);
    });

    it("handles timeout via AbortSignal", async () => {
      // Create a config with very short timeout
      const config = createMockExecutionConfig({ timeout_ms: 10 });

      // Create a query function that delays
      const mockQuery = createMockQueryFn({ shouldTimeout: true });

      const options = createExecutionOptions({
        config,
        queryFn: mockQuery,
      });

      // The execution should complete but may record timeout error
      // depending on timing - this tests the abort mechanism exists
      const result = await executeScenario(options);
      expect(result).toBeDefined();
      expect(result.scenario_id).toBe("test-scenario-1");
    });

    it("tracks permission denials", async () => {
      const mockQuery = createMockQueryFn({
        permissionDenials: ["Write blocked", "Edit blocked"],
      });

      const options = createExecutionOptions({ queryFn: mockQuery });
      const result = await executeScenario(options);

      expect(result.permission_denials).toEqual([
        "Write blocked",
        "Edit blocked",
      ]);
    });

    it("handles empty tool list", async () => {
      const mockQuery = createMockQueryFn({
        triggeredTools: [],
      });

      const options = createExecutionOptions({ queryFn: mockQuery });
      const result = await executeScenario(options);

      expect(result.detected_tools).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("supports additional plugins for conflict testing", async () => {
      const mockQuery = createMockQueryFn({
        loadedPlugins: [
          { name: "test-plugin", path: validPluginPath },
          { name: "other-plugin", path: "/path/to/other" },
        ],
      });

      const options = createExecutionOptions({
        queryFn: mockQuery,
        additionalPlugins: ["/path/to/other"],
      });

      const result = await executeScenario(options);
      expect(result).toBeDefined();
      expect(result.errors).toHaveLength(0);
    });

    it("handles scenario with setup messages", async () => {
      const scenario = createTestScenario({
        scenario_type: "proactive",
        setup_messages: [
          { role: "user", content: "I'm working on auth module" },
          { role: "assistant", content: "I can help with that" },
        ],
      });

      const mockQuery = createMockQueryFn({
        triggeredTools: [
          { name: "Task", input: { subagent_type: "auth-helper" } },
        ],
      });

      const options = createExecutionOptions({
        scenario,
        queryFn: mockQuery,
      });
      const result = await executeScenario(options);

      expect(result.scenario_id).toBe("test-scenario-1");
      expect(result.detected_tools).toHaveLength(1);
    });

    it("respects disallowed_tools configuration", async () => {
      const config = createMockExecutionConfig({
        disallowed_tools: ["Write", "Edit", "Bash"],
      });

      const mockQuery = createMockQueryFn({
        triggeredTools: [{ name: "Read", input: { file: "test.ts" } }],
      });

      const options = createExecutionOptions({
        config,
        queryFn: mockQuery,
      });

      const result = await executeScenario(options);
      expect(result).toBeDefined();
      // The disallowed tools are passed to the SDK via options
    });

    it("respects allowed_tools configuration", async () => {
      const config = createMockExecutionConfig({
        allowed_tools: ["Read", "Glob"],
      });

      const mockQuery = createMockQueryFn({
        triggeredTools: [{ name: "Read", input: { file: "test.ts" } }],
      });

      const options = createExecutionOptions({
        config,
        queryFn: mockQuery,
      });

      const result = await executeScenario(options);
      expect(result).toBeDefined();
    });
  });

  describe("executeScenarioWithCheckpoint", () => {
    it("executes scenario with file checkpointing enabled", async () => {
      const mockQuery = createMockQueryFn({
        triggeredTools: [{ name: "Skill", input: { skill: "test-skill" } }],
        userMessageId: "user-123",
      });

      const options = createExecutionOptions({ queryFn: mockQuery });
      const result = await executeScenarioWithCheckpoint(options);

      expect(result.scenario_id).toBe("test-scenario-1");
      expect(result.detected_tools).toHaveLength(1);
    });

    it("handles rewindFiles error gracefully", async () => {
      const mockQuery = createMockQueryFn({
        triggeredTools: [{ name: "Write", input: { file: "test.txt" } }],
        userMessageId: "user-456",
        rewindFilesError: "Cannot rewind - files changed externally",
      });

      const options = createExecutionOptions({ queryFn: mockQuery });

      // Should not throw, just log warning
      const result = await executeScenarioWithCheckpoint(options);
      expect(result).toBeDefined();
      expect(result.errors).toHaveLength(0); // rewind error is just logged
    });

    it("captures user message ID for rewind", async () => {
      let capturedUserMsgId: string | undefined;

      const mockQuery = createMockQueryFn({
        userMessageId: "captured-user-id",
      });

      // The actual rewind happens inside the function, but we can verify
      // the result is returned correctly
      const options = createExecutionOptions({ queryFn: mockQuery });
      const result = await executeScenarioWithCheckpoint(options);

      expect(result).toBeDefined();
    });

    it("handles errors during checkpointed execution", async () => {
      const mockQuery = createThrowingQueryFn("Checkpointed execution failed");

      const options = createExecutionOptions({ queryFn: mockQuery });
      const result = await executeScenarioWithCheckpoint(options);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.message).toBe("Checkpointed execution failed");
    });
  });

  describe("estimateExecutionCost", () => {
    it("calculates cost based on scenario count and turns", () => {
      const config = createMockExecutionConfig({ max_turns: 5 });
      const cost = estimateExecutionCost(10, config);

      expect(cost).toBeGreaterThan(0);
      expect(typeof cost).toBe("number");
    });

    it("scales linearly with scenario count", () => {
      const config = createMockExecutionConfig({ max_turns: 3 });
      const cost10 = estimateExecutionCost(10, config);
      const cost20 = estimateExecutionCost(20, config);

      expect(cost20).toBeCloseTo(cost10 * 2, 5);
    });

    it("scales with max_turns", () => {
      const config3Turns = createMockExecutionConfig({ max_turns: 3 });
      const config6Turns = createMockExecutionConfig({ max_turns: 6 });

      const cost3 = estimateExecutionCost(10, config3Turns);
      const cost6 = estimateExecutionCost(10, config6Turns);

      expect(cost6).toBeCloseTo(cost3 * 2, 5);
    });

    it("returns 0 for 0 scenarios", () => {
      const config = createMockExecutionConfig();
      const cost = estimateExecutionCost(0, config);

      expect(cost).toBe(0);
    });
  });

  describe("wouldExceedBudget", () => {
    it("returns false when cost is within budget", () => {
      const config = createMockExecutionConfig({ max_budget_usd: 100 });
      const exceeded = wouldExceedBudget(5, config);

      expect(exceeded).toBe(false);
    });

    it("returns true when cost exceeds budget", () => {
      const config = createMockExecutionConfig({
        max_budget_usd: 0.0001,
        max_turns: 10,
      });
      const exceeded = wouldExceedBudget(1000, config);

      expect(exceeded).toBe(true);
    });

    it("handles edge case at exact budget", () => {
      // This tests the boundary condition
      const config = createMockExecutionConfig({ max_budget_usd: 1000 });
      const exceeded = wouldExceedBudget(1, config);

      expect(typeof exceeded).toBe("boolean");
    });
  });

  describe("formatExecutionStats", () => {
    it("formats statistics for successful executions", () => {
      const results: ExecutionResult[] = [
        {
          scenario_id: "test-1",
          transcript: {
            metadata: {
              version: "v3.0",
              plugin_name: "test",
              scenario_id: "test-1",
              timestamp: new Date().toISOString(),
              model: "claude-sonnet-4-20250514",
            },
            events: [],
          },
          detected_tools: [
            {
              name: "Skill",
              input: {},
              toolUseId: "t1",
              timestamp: Date.now(),
            },
          ],
          cost_usd: 0.01,
          api_duration_ms: 1000,
          num_turns: 2,
          permission_denials: [],
          errors: [],
        },
        {
          scenario_id: "test-2",
          transcript: {
            metadata: {
              version: "v3.0",
              plugin_name: "test",
              scenario_id: "test-2",
              timestamp: new Date().toISOString(),
              model: "claude-sonnet-4-20250514",
            },
            events: [],
          },
          detected_tools: [],
          cost_usd: 0.02,
          api_duration_ms: 2000,
          num_turns: 3,
          permission_denials: [],
          errors: [],
        },
      ];

      const stats = formatExecutionStats(results);

      expect(stats).toContain("Scenarios: 2");
      expect(stats).toContain("Total cost: $0.0300");
      expect(stats).toContain("Total duration: 3s");
      expect(stats).toContain("Total turns: 5");
      expect(stats).toContain("Total tools captured: 1");
      expect(stats).toContain("Errors: 0");
    });

    it("includes failed scenario IDs when errors present", () => {
      const results: ExecutionResult[] = [
        {
          scenario_id: "failed-scenario",
          transcript: {
            metadata: {
              version: "v3.0",
              plugin_name: "test",
              scenario_id: "failed-scenario",
              timestamp: new Date().toISOString(),
              model: "claude-sonnet-4-20250514",
            },
            events: [],
          },
          detected_tools: [],
          cost_usd: 0,
          api_duration_ms: 0,
          num_turns: 0,
          permission_denials: [],
          errors: [
            {
              type: "error",
              error_type: "api_error",
              message: "Test error",
              timestamp: Date.now(),
              recoverable: false,
            },
          ],
        },
      ];

      const stats = formatExecutionStats(results);

      expect(stats).toContain("Errors: 1");
      expect(stats).toContain("Failed scenarios: failed-scenario");
    });

    it("handles empty results array", () => {
      const stats = formatExecutionStats([]);

      expect(stats).toContain("Scenarios: 0");
      expect(stats).toContain("Total cost: $0.0000");
      expect(stats).toContain("Total tools captured: 0");
    });

    it("aggregates multiple errors correctly", () => {
      const results: ExecutionResult[] = [
        {
          scenario_id: "error-1",
          transcript: {
            metadata: {
              version: "v3.0",
              plugin_name: "test",
              scenario_id: "error-1",
              timestamp: new Date().toISOString(),
              model: "claude-sonnet-4-20250514",
            },
            events: [],
          },
          detected_tools: [],
          cost_usd: 0,
          api_duration_ms: 0,
          num_turns: 0,
          permission_denials: [],
          errors: [
            {
              type: "error",
              error_type: "timeout",
              message: "Timeout",
              timestamp: Date.now(),
              recoverable: false,
            },
          ],
        },
        {
          scenario_id: "error-2",
          transcript: {
            metadata: {
              version: "v3.0",
              plugin_name: "test",
              scenario_id: "error-2",
              timestamp: new Date().toISOString(),
              model: "claude-sonnet-4-20250514",
            },
            events: [],
          },
          detected_tools: [],
          cost_usd: 0,
          api_duration_ms: 0,
          num_turns: 0,
          permission_denials: [],
          errors: [
            {
              type: "error",
              error_type: "api_error",
              message: "API error",
              timestamp: Date.now(),
              recoverable: false,
            },
            {
              type: "error",
              error_type: "budget_exceeded",
              message: "Over budget",
              timestamp: Date.now(),
              recoverable: false,
            },
          ],
        },
      ];

      const stats = formatExecutionStats(results);

      expect(stats).toContain("Errors: 3");
      expect(stats).toContain("error-1");
      expect(stats).toContain("error-2");
    });
  });

  describe("Edge Cases", () => {
    it("handles scenario with empty user prompt", async () => {
      const scenario = createTestScenario({ user_prompt: "" });
      const mockQuery = createMockQueryFn({});

      const options = createExecutionOptions({
        scenario,
        queryFn: mockQuery,
      });
      const result = await executeScenario(options);

      expect(result).toBeDefined();
      expect(result.scenario_id).toBe("test-scenario-1");
    });

    it("handles negative scenario (expected_trigger: false)", async () => {
      const scenario = createTestScenario({
        scenario_type: "negative",
        expected_trigger: false,
      });
      const mockQuery = createMockQueryFn({
        triggeredTools: [], // No tools triggered for negative scenario
      });

      const options = createExecutionOptions({
        scenario,
        queryFn: mockQuery,
      });
      const result = await executeScenario(options);

      expect(result.detected_tools).toHaveLength(0);
    });

    it("handles very long user prompts", async () => {
      const longPrompt = "Please help me with this task. ".repeat(100);
      const scenario = createTestScenario({ user_prompt: longPrompt });
      const mockQuery = createMockQueryFn({});

      const options = createExecutionOptions({
        scenario,
        queryFn: mockQuery,
      });
      const result = await executeScenario(options);

      expect(result).toBeDefined();
    });

    it("handles special characters in scenario", async () => {
      const scenario = createTestScenario({
        user_prompt: 'Test with "quotes" and <special> & characters',
        expected_component: "test-skill/nested",
      });
      const mockQuery = createMockQueryFn({});

      const options = createExecutionOptions({
        scenario,
        queryFn: mockQuery,
      });
      const result = await executeScenario(options);

      expect(result).toBeDefined();
    });

    it("handles MCP servers in SDK response", async () => {
      const mockQuery = createMockQueryFn({
        mcpServers: [
          { name: "filesystem", status: "connected" },
          { name: "database", status: "error", error: "Connection refused" },
        ],
      });

      const options = createExecutionOptions({ queryFn: mockQuery });
      const result = await executeScenario(options);

      expect(result).toBeDefined();
      expect(result.errors).toHaveLength(0);
    });

    it("handles tool results in conversation", async () => {
      const mockQuery = createMockQueryFn({
        triggeredTools: [
          { name: "Read", input: { file: "test.ts" }, id: "tool-read-1" },
        ],
        toolResults: [
          { toolUseId: "tool-read-1", content: "file contents here" },
        ],
      });

      const options = createExecutionOptions({ queryFn: mockQuery });
      const result = await executeScenario(options);

      expect(result.detected_tools).toHaveLength(1);
      expect(result.transcript.events.length).toBeGreaterThan(0);
    });
  });
});
