/**
 * Unit tests for agent-executor.ts
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

import { DEFAULT_TUNING } from "../../../../src/config/defaults.js";
import type {
  ExecutionConfig,
  ExecutionResult,
} from "../../../../src/types/index.js";

// Track calls to getModelPricing
const getModelPricingCalls: string[] = [];

// Mock the pricing module to track calls
vi.mock("../../../../src/config/pricing.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../../../src/config/pricing.js")>();
  return {
    ...original,
    getModelPricing: (modelId: string) => {
      getModelPricingCalls.push(modelId);
      return original.getModelPricing(modelId);
    },
  };
});

// Mock the logger to avoid console output in tests
vi.mock("../../../../src/utils/logging.js", () => ({
  logger: {
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Import after mocks are set up
import {
  estimateExecutionCost,
  wouldExceedBudget,
  formatExecutionStats,
} from "../../../../src/stages/3-execution/agent-executor.js";
import { getModelPricing } from "../../../../src/config/pricing.js";

describe("estimateExecutionCost", () => {
  const baseConfig: ExecutionConfig = {
    model: "claude-sonnet-4-20250514",
    max_turns: 3,
    timeout_ms: 60000,
    max_budget_usd: 10.0,
  };

  beforeEach(() => {
    getModelPricingCalls.length = 0;
  });

  it("should call getModelPricing from pricing.ts", () => {
    estimateExecutionCost(10, baseConfig);

    expect(getModelPricingCalls).toContain(baseConfig.model);
  });

  it("should use pricing from pricing.ts instead of hardcoded values", () => {
    const pricingData = getModelPricing(baseConfig.model);

    // Calculate expected cost using the same formula as estimateExecutionCost
    const inputTokensPerScenario =
      DEFAULT_TUNING.token_estimates.input_per_turn * baseConfig.max_turns;
    const outputTokensPerScenario =
      DEFAULT_TUNING.token_estimates.output_per_turn * baseConfig.max_turns;

    const scenarioCount = 10;
    const totalInputTokens = inputTokensPerScenario * scenarioCount;
    const totalOutputTokens = outputTokensPerScenario * scenarioCount;

    const expectedCost =
      (totalInputTokens / 1_000_000) * pricingData.input +
      (totalOutputTokens / 1_000_000) * pricingData.output;

    const actualCost = estimateExecutionCost(scenarioCount, baseConfig);

    expect(actualCost).toBe(expectedCost);
  });

  it("should calculate cost proportionally to scenario count", () => {
    const cost5 = estimateExecutionCost(5, baseConfig);
    const cost10 = estimateExecutionCost(10, baseConfig);

    expect(cost10).toBe(cost5 * 2);
  });

  it("should calculate cost proportionally to max_turns", () => {
    const configWith3Turns = { ...baseConfig, max_turns: 3 };
    const configWith6Turns = { ...baseConfig, max_turns: 6 };

    const cost3Turns = estimateExecutionCost(10, configWith3Turns);
    const cost6Turns = estimateExecutionCost(10, configWith6Turns);

    expect(cost6Turns).toBe(cost3Turns * 2);
  });

  it("should return 0 for 0 scenarios", () => {
    const cost = estimateExecutionCost(0, baseConfig);
    expect(cost).toBe(0);
  });
});

describe("wouldExceedBudget", () => {
  it("should return true when estimated cost exceeds budget", () => {
    const config: ExecutionConfig = {
      model: "claude-sonnet-4-20250514",
      max_turns: 10,
      timeout_ms: 60000,
      max_budget_usd: 0.001, // Very low budget
    };

    const result = wouldExceedBudget(100, config);
    expect(result).toBe(true);
  });

  it("should return false when estimated cost is within budget", () => {
    const config: ExecutionConfig = {
      model: "claude-sonnet-4-20250514",
      max_turns: 1,
      timeout_ms: 60000,
      max_budget_usd: 100.0, // High budget
    };

    const result = wouldExceedBudget(1, config);
    expect(result).toBe(false);
  });
});

describe("formatExecutionStats", () => {
  it("should format empty results array", () => {
    const stats = formatExecutionStats([]);

    expect(stats).toContain("Scenarios: 0");
    expect(stats).toContain("Total cost: $0.0000");
  });

  it("should aggregate statistics from multiple results", () => {
    const results: ExecutionResult[] = [
      {
        scenario_id: "test-1",
        transcript: {
          scenario_id: "test-1",
          plugin_name: "test",
          model: "sonnet",
          user_prompt: "test",
          events: [],
          detected_tools: [],
          timestamp_start: Date.now(),
          timestamp_end: Date.now(),
          duration_ms: 100,
        },
        detected_tools: [
          { name: "Skill", input: {}, toolUseId: "1", timestamp: Date.now() },
        ],
        cost_usd: 0.005,
        api_duration_ms: 1000,
        num_turns: 2,
        permission_denials: [],
        errors: [],
      },
      {
        scenario_id: "test-2",
        transcript: {
          scenario_id: "test-2",
          plugin_name: "test",
          model: "sonnet",
          user_prompt: "test",
          events: [],
          detected_tools: [],
          timestamp_start: Date.now(),
          timestamp_end: Date.now(),
          duration_ms: 200,
        },
        detected_tools: [
          { name: "Task", input: {}, toolUseId: "2", timestamp: Date.now() },
          { name: "Read", input: {}, toolUseId: "3", timestamp: Date.now() },
        ],
        cost_usd: 0.003,
        api_duration_ms: 2000,
        num_turns: 3,
        permission_denials: [],
        errors: [],
      },
    ];

    const stats = formatExecutionStats(results);

    expect(stats).toContain("Scenarios: 2");
    expect(stats).toContain("Total cost: $0.0080");
    expect(stats).toContain("Total turns: 5");
    expect(stats).toContain("Total tools captured: 3");
    expect(stats).toContain("Errors: 0");
  });

  it("should list failed scenarios when errors exist", () => {
    const results: ExecutionResult[] = [
      {
        scenario_id: "failed-scenario",
        transcript: {
          scenario_id: "failed-scenario",
          plugin_name: "test",
          model: "sonnet",
          user_prompt: "test",
          events: [],
          detected_tools: [],
          timestamp_start: Date.now(),
          timestamp_end: Date.now(),
          duration_ms: 100,
        },
        detected_tools: [],
        cost_usd: 0,
        api_duration_ms: 500,
        num_turns: 1,
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
});
