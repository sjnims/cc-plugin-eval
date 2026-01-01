/**
 * Unit tests for batch-calculator.ts
 */

import { describe, expect, it } from "vitest";

import {
  calculateOptimalBatchSize,
  createBatchConfig,
  calculateBatches,
  estimateBatchTokens,
  wouldExceedTokenLimit,
  TOKENS_PER_SCENARIO,
  THINKING_BUDGET,
} from "../../../../src/stages/2-generation/batch-calculator.js";

describe("TOKENS_PER_SCENARIO", () => {
  it("should have higher token counts for complex components", () => {
    expect(TOKENS_PER_SCENARIO.agent).toBeGreaterThan(
      TOKENS_PER_SCENARIO.skill,
    );
    expect(TOKENS_PER_SCENARIO.skill).toBeGreaterThan(
      TOKENS_PER_SCENARIO.command,
    );
  });

  it("should have reasonable values", () => {
    expect(TOKENS_PER_SCENARIO.skill).toBeGreaterThanOrEqual(500);
    expect(TOKENS_PER_SCENARIO.agent).toBeGreaterThanOrEqual(700);
    expect(TOKENS_PER_SCENARIO.command).toBeGreaterThanOrEqual(200);
  });
});

describe("THINKING_BUDGET", () => {
  it("should have higher thinking budget for high effort", () => {
    expect(THINKING_BUDGET.high).toBeGreaterThan(THINKING_BUDGET.medium);
    expect(THINKING_BUDGET.medium).toBeGreaterThan(THINKING_BUDGET.low);
    expect(THINKING_BUDGET.low).toBeGreaterThan(THINKING_BUDGET.none);
  });

  it("should have zero for none", () => {
    expect(THINKING_BUDGET.none).toBe(0);
  });

  it("should have reasonable values", () => {
    expect(THINKING_BUDGET.low).toBeGreaterThanOrEqual(1000);
    expect(THINKING_BUDGET.high).toBeGreaterThanOrEqual(4000);
  });
});

describe("calculateOptimalBatchSize", () => {
  it("should calculate batch size based on available tokens", () => {
    const config = createBatchConfig("haiku", 8000, "none", 0.75);
    const result = calculateOptimalBatchSize(config, "skill");

    expect(result.batchSize).toBeGreaterThan(0);
    expect(result.tokensPerScenario).toBe(TOKENS_PER_SCENARIO.skill);
    expect(result.availableTokens).toBe(8000 * 0.75);
  });

  it("should return smaller batch for agents (higher token count)", () => {
    const config = createBatchConfig("haiku", 8000, "none", 0.75);
    const agentResult = calculateOptimalBatchSize(config, "agent");
    const commandResult = calculateOptimalBatchSize(config, "command");

    // Agents use more tokens per scenario, so fewer fit in a batch
    expect(commandResult.batchSize).toBeGreaterThan(agentResult.batchSize);
  });

  it("should return at least 1", () => {
    // Very small available tokens
    const config = createBatchConfig("haiku", 100, "high", 0.5);
    const result = calculateOptimalBatchSize(config, "agent");

    expect(result.batchSize).toBeGreaterThanOrEqual(1);
  });

  it("should account for thinking budget", () => {
    const configNoThinking = createBatchConfig("haiku", 8000, "none", 0.75);
    const configWithThinking = createBatchConfig("haiku", 8000, "high", 0.75);

    const resultNoThinking = calculateOptimalBatchSize(
      configNoThinking,
      "skill",
    );
    const resultWithThinking = calculateOptimalBatchSize(
      configWithThinking,
      "skill",
    );

    // Less available tokens with thinking budget = smaller batch
    expect(resultNoThinking.batchSize).toBeGreaterThan(
      resultWithThinking.batchSize,
    );
  });
});

describe("createBatchConfig", () => {
  it("should create valid batch config", () => {
    const config = createBatchConfig("haiku", 8000, "medium", 0.8);

    expect(config.model).toBe("haiku");
    expect(config.maxOutputTokens).toBe(8000);
    expect(config.thinkingBudget).toBe(THINKING_BUDGET.medium);
    expect(config.safetyMargin).toBe(0.8);
  });

  it("should use default safety margin when not specified", () => {
    const config = createBatchConfig("sonnet", 16000, "none");

    expect(config.safetyMargin).toBe(0.75);
  });

  it("should use model default when maxTokens is 0", () => {
    const config = createBatchConfig("claude-haiku-3-5-20250929", 0, "none");

    expect(config.maxOutputTokens).toBe(8000); // Default for haiku
  });
});

describe("calculateBatches", () => {
  it("should split components into batches", () => {
    const batches = calculateBatches(10, 3);

    expect(batches).toEqual([3, 3, 3, 1]);
  });

  it("should handle exact divisibility", () => {
    const batches = calculateBatches(9, 3);

    expect(batches).toEqual([3, 3, 3]);
  });

  it("should handle single batch", () => {
    const batches = calculateBatches(2, 5);

    expect(batches).toEqual([2]);
  });

  it("should handle empty components", () => {
    const batches = calculateBatches(0, 5);

    expect(batches).toEqual([]);
  });
});

describe("estimateBatchTokens", () => {
  it("should multiply scenario count by tokens per scenario", () => {
    const tokens = estimateBatchTokens(10, "skill");

    expect(tokens).toBe(10 * TOKENS_PER_SCENARIO.skill);
  });

  it("should work for different component types", () => {
    expect(estimateBatchTokens(5, "agent")).toBe(5 * TOKENS_PER_SCENARIO.agent);
    expect(estimateBatchTokens(5, "command")).toBe(
      5 * TOKENS_PER_SCENARIO.command,
    );
  });
});

describe("wouldExceedTokenLimit", () => {
  it("should return true when over limit", () => {
    const result = wouldExceedTokenLimit(100, "skill", 1000);

    // 100 * 600 = 60000 > 1000
    expect(result).toBe(true);
  });

  it("should return false when under limit", () => {
    const result = wouldExceedTokenLimit(1, "command", 1000);

    // 1 * 300 = 300 < 1000
    expect(result).toBe(false);
  });

  it("should return false when exactly at limit", () => {
    const available = TOKENS_PER_SCENARIO.skill * 2;
    const result = wouldExceedTokenLimit(2, "skill", available);

    expect(result).toBe(false);
  });
});
