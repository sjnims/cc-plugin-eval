/**
 * Unit tests for cost-estimator.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";

import {
  resolveModelId,
  estimateExecutionCost,
  estimateEvaluationCost,
  estimatePipelineCost,
  estimateScenarioCount,
  calculateComponentCounts,
  formatPipelineCostEstimate,
  countPromptTokens,
  estimateGenerationCost,
  createAnthropicClient,
} from "../../../../src/stages/2-generation/cost-estimator.js";
import type {
  AnalysisOutput,
  EvalConfig,
} from "../../../../src/types/index.js";

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({
    messages: {
      countTokens: vi.fn(),
      create: vi.fn(),
    },
  })),
}));

describe("resolveModelId", () => {
  it("should resolve haiku shorthand", () => {
    const result = resolveModelId("haiku");
    expect(result).toContain("haiku");
    expect(result).toContain("claude");
  });

  it("should resolve sonnet shorthand", () => {
    const result = resolveModelId("sonnet");
    expect(result).toContain("sonnet");
    expect(result).toContain("claude");
  });

  it("should resolve opus shorthand", () => {
    const result = resolveModelId("opus");
    expect(result).toContain("opus");
    expect(result).toContain("claude");
  });

  it("should pass through full model IDs unchanged", () => {
    const fullId = "claude-3-5-sonnet-20241022";
    const result = resolveModelId(fullId);
    expect(result).toBe(fullId);
  });

  it("should pass through unknown shorthands unchanged", () => {
    const unknown = "unknown-model";
    const result = resolveModelId(unknown);
    expect(result).toBe(unknown);
  });

  it("should resolve versioned shorthands", () => {
    expect(resolveModelId("sonnet-4.5")).toContain("sonnet");
    expect(resolveModelId("haiku-3.5")).toContain("haiku");
  });
});

describe("estimateExecutionCost", () => {
  it("should calculate positive cost", () => {
    const result = estimateExecutionCost(50, "haiku");

    expect(result.stage).toBe("execution");
    expect(result.input_tokens).toBeGreaterThan(0);
    expect(result.estimated_output_tokens).toBeGreaterThan(0);
    expect(result.estimated_cost_usd).toBeGreaterThan(0);
  });

  it("should scale with scenario count", () => {
    const small = estimateExecutionCost(10, "haiku");
    const large = estimateExecutionCost(100, "haiku");

    expect(large.estimated_cost_usd).toBeGreaterThan(small.estimated_cost_usd);
  });

  it("should be zero for zero scenarios", () => {
    const result = estimateExecutionCost(0, "haiku");

    expect(result.estimated_cost_usd).toBe(0);
  });

  it("should scale with repetitions", () => {
    const oneRep = estimateExecutionCost(10, "haiku", 1);
    const threeReps = estimateExecutionCost(10, "haiku", 3);

    expect(threeReps.estimated_cost_usd).toBeGreaterThan(
      oneRep.estimated_cost_usd,
    );
  });
});

describe("estimateEvaluationCost", () => {
  it("should calculate positive cost", () => {
    const result = estimateEvaluationCost(50, "haiku");

    expect(result.stage).toBe("evaluation");
    expect(result.input_tokens).toBeGreaterThan(0);
    expect(result.estimated_output_tokens).toBeGreaterThan(0);
    expect(result.estimated_cost_usd).toBeGreaterThan(0);
  });

  it("should scale with scenario count", () => {
    const small = estimateEvaluationCost(10, "haiku");
    const large = estimateEvaluationCost(100, "haiku");

    expect(large.estimated_cost_usd).toBeGreaterThan(small.estimated_cost_usd);
  });

  it("should scale with samples", () => {
    const oneSample = estimateEvaluationCost(10, "haiku", 1);
    const threeSamples = estimateEvaluationCost(10, "haiku", 3);

    expect(threeSamples.estimated_cost_usd).toBeGreaterThan(
      oneSample.estimated_cost_usd,
    );
  });
});

describe("calculateComponentCounts", () => {
  const mockAnalysis: AnalysisOutput = {
    plugin_name: "test-plugin",
    plugin_path: "/path/to/plugin",
    components: {
      skills: [
        {
          name: "skill1",
          path: "/path/skill1.md",
          description: "Test skill",
          trigger_phrases: ["test skill"],
          semantic_intents: [],
        },
        {
          name: "skill2",
          path: "/path/skill2.md",
          description: "Another skill",
          trigger_phrases: ["another"],
          semantic_intents: [],
        },
      ],
      agents: [
        {
          name: "agent1",
          path: "/path/agent1.md",
          description: "Test agent",
          model: "haiku",
          example_triggers: [],
        },
      ],
      commands: [
        {
          name: "cmd1",
          path: "/path/cmd1.md",
          plugin_prefix: "test-plugin",
          namespace: "",
          fullName: "cmd1",
          description: "Test command",
          disable_model_invocation: false,
        },
      ],
    },
    extraction_metadata: {
      total_components: 4,
      components_by_type: { skill: 2, agent: 1, command: 1 },
      extraction_timestamp: new Date().toISOString(),
    },
  };

  const mockConfig: EvalConfig = {
    plugin_path: "/path/to/plugin",
    scope: {
      skills: true,
      agents: true,
      commands: true,
    },
    generation: {
      model: "haiku",
      scenarios_per_component: 10,
      diversity: 0.5,
      semantic_variations: true,
    },
    execution: {
      model: "haiku",
      max_turns: 3,
      timeout_ms: 30000,
      concurrency: 5,
      num_reps: 1,
      max_budget_usd: 10.0,
    },
    evaluation: {
      model: "haiku",
      detection_mode: "programmatic_first",
      confidence_threshold: 0.8,
      num_samples: 1,
    },
    output: {
      directory: "./eval-output",
      save_transcripts: true,
      save_scenarios: true,
      report_format: "json",
    },
    dry_run: false,
    verbose: false,
  };

  it("should count all components when all scopes enabled", () => {
    const counts = calculateComponentCounts(mockAnalysis, mockConfig);

    expect(counts.skills).toBe(2);
    expect(counts.agents).toBe(1);
    expect(counts.commands).toBe(1);
    expect(counts.total).toBe(4);
  });

  it("should respect scope settings", () => {
    const configNoSkills = {
      ...mockConfig,
      scope: { skills: false, agents: true, commands: true },
    };

    const counts = calculateComponentCounts(mockAnalysis, configNoSkills);

    expect(counts.skills).toBe(0);
    expect(counts.agents).toBe(1);
    expect(counts.total).toBe(2);
  });
});

describe("estimateScenarioCount", () => {
  const mockAnalysis: AnalysisOutput = {
    plugin_name: "test-plugin",
    plugin_path: "/path/to/plugin",
    components: {
      skills: [
        {
          name: "skill1",
          path: "/path/skill1.md",
          description: "Test",
          trigger_phrases: [],
          semantic_intents: [],
        },
      ],
      agents: [
        {
          name: "agent1",
          path: "/path/agent1.md",
          description: "Test",
          model: "haiku",
          example_triggers: [],
        },
      ],
      commands: [
        {
          name: "cmd1",
          path: "/path/cmd1.md",
          plugin_prefix: "test",
          namespace: "",
          fullName: "cmd1",
          description: "Test",
          disable_model_invocation: false,
        },
        {
          name: "cmd2",
          path: "/path/cmd2.md",
          plugin_prefix: "test",
          namespace: "",
          fullName: "cmd2",
          description: "Test",
          disable_model_invocation: false,
        },
      ],
    },
    extraction_metadata: {
      total_components: 4,
      components_by_type: { skill: 1, agent: 1, command: 2 },
      extraction_timestamp: new Date().toISOString(),
    },
  };

  const mockConfig: EvalConfig = {
    plugin_path: "/path",
    scope: { skills: true, agents: true, commands: true },
    generation: {
      model: "haiku",
      scenarios_per_component: 10,
      diversity: 0.5,
      semantic_variations: true,
    },
    execution: {
      model: "haiku",
      max_turns: 3,
      timeout_ms: 30000,
      concurrency: 5,
      num_reps: 1,
      max_budget_usd: 10.0,
    },
    evaluation: {
      model: "haiku",
      detection_mode: "programmatic_first",
      confidence_threshold: 0.8,
      num_samples: 1,
    },
    output: {
      directory: "./output",
      save_transcripts: true,
      save_scenarios: true,
      report_format: "json",
    },
    dry_run: false,
    verbose: false,
  };

  it("should calculate scenario count", () => {
    const count = estimateScenarioCount(mockAnalysis, mockConfig);

    // 1 skill × 10 + 1 agent × 10 + 2 commands × 5 = 30
    expect(count).toBe(30);
  });
});

describe("estimatePipelineCost", () => {
  const mockAnalysis: AnalysisOutput = {
    plugin_name: "test-plugin",
    plugin_path: "/path/to/plugin",
    components: {
      skills: [
        {
          name: "skill1",
          path: "/path/skill1.md",
          description: "Test skill",
          trigger_phrases: ["test skill"],
          semantic_intents: [],
        },
      ],
      agents: [
        {
          name: "agent1",
          path: "/path/agent1.md",
          description: "Test agent",
          model: "haiku",
          example_triggers: [],
        },
      ],
      commands: [
        {
          name: "cmd1",
          path: "/path/cmd1.md",
          plugin_prefix: "test-plugin",
          namespace: "",
          fullName: "cmd1",
          description: "Test command",
          disable_model_invocation: false,
        },
      ],
    },
    extraction_metadata: {
      total_components: 3,
      components_by_type: { skill: 1, agent: 1, command: 1 },
      extraction_timestamp: new Date().toISOString(),
    },
  };

  const mockConfig: EvalConfig = {
    plugin_path: "/path/to/plugin",
    scope: {
      skills: true,
      agents: true,
      commands: true,
    },
    generation: {
      model: "haiku",
      scenarios_per_component: 10,
      diversity: 0.5,
      semantic_variations: true,
    },
    execution: {
      model: "haiku",
      max_turns: 3,
      timeout_ms: 30000,
      concurrency: 5,
      num_reps: 1,
      max_budget_usd: 10.0,
    },
    evaluation: {
      model: "haiku",
      detection_mode: "programmatic_first",
      confidence_threshold: 0.8,
      num_samples: 1,
    },
    output: {
      directory: "./eval-output",
      save_transcripts: true,
      save_scenarios: true,
      report_format: "json",
    },
    dry_run: false,
    verbose: false,
  };

  it("should calculate total pipeline cost", () => {
    const result = estimatePipelineCost(mockAnalysis, mockConfig);

    expect(result.stages).toHaveLength(3);
    expect(result.stages.map((s) => s.stage)).toEqual([
      "generation",
      "execution",
      "evaluation",
    ]);
    expect(result.total_estimated_cost_usd).toBeGreaterThan(0);
  });

  it("should indicate within_budget correctly", () => {
    const lowBudgetConfig = {
      ...mockConfig,
      execution: { ...mockConfig.execution, max_budget_usd: 0.0001 },
    };

    const result = estimatePipelineCost(mockAnalysis, lowBudgetConfig);

    expect(result.within_budget).toBe(false);
    expect(result.budget_remaining_usd).toBeLessThan(0);
  });

  it("should have within_budget true for high budget", () => {
    const highBudgetConfig = {
      ...mockConfig,
      execution: { ...mockConfig.execution, max_budget_usd: 1000.0 },
    };

    const result = estimatePipelineCost(mockAnalysis, highBudgetConfig);

    expect(result.within_budget).toBe(true);
    expect(result.budget_remaining_usd).toBeGreaterThan(0);
  });
});

describe("formatPipelineCostEstimate", () => {
  it("should format estimate as readable string", () => {
    const estimate = {
      stages: [
        {
          stage: "generation" as const,
          input_tokens: 1000,
          estimated_output_tokens: 500,
          estimated_cost_usd: 0.01,
        },
        {
          stage: "execution" as const,
          input_tokens: 5000,
          estimated_output_tokens: 2500,
          estimated_cost_usd: 0.05,
        },
        {
          stage: "evaluation" as const,
          input_tokens: 2000,
          estimated_output_tokens: 1000,
          estimated_cost_usd: 0.02,
        },
      ],
      total_estimated_cost_usd: 0.08,
      within_budget: true,
      budget_remaining_usd: 9.92,
    };

    const result = formatPipelineCostEstimate(estimate);

    expect(result).toContain("generation");
    expect(result).toContain("execution");
    expect(result).toContain("evaluation");
    expect(result).toContain("Total");
    expect(result).toContain("$");
  });

  it("should show exceeds when over budget", () => {
    const estimate = {
      stages: [
        {
          stage: "generation" as const,
          input_tokens: 1000,
          estimated_output_tokens: 500,
          estimated_cost_usd: 5.0,
        },
        {
          stage: "execution" as const,
          input_tokens: 5000,
          estimated_output_tokens: 2500,
          estimated_cost_usd: 10.0,
        },
        {
          stage: "evaluation" as const,
          input_tokens: 2000,
          estimated_output_tokens: 1000,
          estimated_cost_usd: 5.0,
        },
      ],
      total_estimated_cost_usd: 20.0,
      within_budget: false,
      budget_remaining_usd: -10.0,
    };

    const result = formatPipelineCostEstimate(estimate);

    expect(result).toContain("Exceeds");
    expect(result).toContain("Over budget");
  });
});

describe("createAnthropicClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create an Anthropic client instance", () => {
    const client = createAnthropicClient();

    expect(Anthropic).toHaveBeenCalledTimes(1);
    expect(client).toBeDefined();
  });
});

describe("countPromptTokens", () => {
  let mockClient: { messages: { countTokens: Mock } };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      messages: {
        countTokens: vi.fn(),
      },
    };
  });

  it("should count tokens for a prompt", async () => {
    mockClient.messages.countTokens.mockResolvedValue({ input_tokens: 150 });

    const count = await countPromptTokens(
      mockClient as unknown as Anthropic,
      "haiku",
      "Test prompt content",
    );

    expect(mockClient.messages.countTokens).toHaveBeenCalledTimes(1);
    expect(mockClient.messages.countTokens).toHaveBeenCalledWith({
      model: expect.stringContaining("haiku"),
      messages: [{ role: "user", content: "Test prompt content" }],
    });
    expect(count).toBe(150);
  });

  it("should resolve model shorthand before counting", async () => {
    mockClient.messages.countTokens.mockResolvedValue({ input_tokens: 100 });

    await countPromptTokens(
      mockClient as unknown as Anthropic,
      "sonnet",
      "Test",
    );

    expect(mockClient.messages.countTokens).toHaveBeenCalledWith({
      model: expect.stringContaining("sonnet"),
      messages: expect.any(Array),
    });
  });

  it("should handle long prompts", async () => {
    const longPrompt = "word ".repeat(1000);
    mockClient.messages.countTokens.mockResolvedValue({ input_tokens: 5000 });

    const count = await countPromptTokens(
      mockClient as unknown as Anthropic,
      "haiku",
      longPrompt,
    );

    expect(count).toBe(5000);
  });
});

describe("estimateGenerationCost (async)", () => {
  let mockClient: { messages: { countTokens: Mock } };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      messages: {
        countTokens: vi.fn(),
      },
    };
  });

  it("should estimate cost for multiple prompts", async () => {
    mockClient.messages.countTokens
      .mockResolvedValueOnce({ input_tokens: 100 })
      .mockResolvedValueOnce({ input_tokens: 150 })
      .mockResolvedValueOnce({ input_tokens: 200 });

    const estimate = await estimateGenerationCost(
      mockClient as unknown as Anthropic,
      ["prompt1", "prompt2", "prompt3"],
      "haiku",
    );

    expect(mockClient.messages.countTokens).toHaveBeenCalledTimes(3);
    expect(estimate.stage).toBe("generation");
    expect(estimate.input_tokens).toBe(450); // 100 + 150 + 200
    expect(estimate.estimated_output_tokens).toBe(2400); // 3 prompts * 800
    expect(estimate.estimated_cost_usd).toBeGreaterThan(0);
  });

  it("should return zero cost for empty prompts", async () => {
    const estimate = await estimateGenerationCost(
      mockClient as unknown as Anthropic,
      [],
      "haiku",
    );

    expect(mockClient.messages.countTokens).not.toHaveBeenCalled();
    expect(estimate.input_tokens).toBe(0);
    expect(estimate.estimated_output_tokens).toBe(0);
    expect(estimate.estimated_cost_usd).toBe(0);
  });

  it("should use correct model for cost calculation", async () => {
    mockClient.messages.countTokens.mockResolvedValue({ input_tokens: 1000 });

    const haikuEstimate = await estimateGenerationCost(
      mockClient as unknown as Anthropic,
      ["test"],
      "haiku",
    );

    mockClient.messages.countTokens.mockClear();
    mockClient.messages.countTokens.mockResolvedValue({ input_tokens: 1000 });

    const opusEstimate = await estimateGenerationCost(
      mockClient as unknown as Anthropic,
      ["test"],
      "opus",
    );

    // Opus should be more expensive than Haiku
    expect(opusEstimate.estimated_cost_usd).toBeGreaterThan(
      haikuEstimate.estimated_cost_usd,
    );
  });

  it("should call countTokens for each prompt", async () => {
    mockClient.messages.countTokens.mockResolvedValue({ input_tokens: 50 });

    await estimateGenerationCost(
      mockClient as unknown as Anthropic,
      ["prompt A", "prompt B"],
      "haiku",
    );

    expect(mockClient.messages.countTokens).toHaveBeenCalledWith({
      model: expect.stringContaining("haiku"),
      messages: [{ role: "user", content: "prompt A" }],
    });
    expect(mockClient.messages.countTokens).toHaveBeenCalledWith({
      model: expect.stringContaining("haiku"),
      messages: [{ role: "user", content: "prompt B" }],
    });
  });
});
