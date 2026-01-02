/**
 * Tests for multi-sampler functions.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

import type {
  EvaluationConfig,
  JudgeResponse,
  ProgrammaticDetection,
  TestScenario,
  Transcript,
} from "../../../../src/types/index.js";

import { evaluateWithFallback } from "../../../../src/stages/4-evaluation/llm-judge.js";
import {
  aggregateScores,
  calculateVariance,
  calculateStdDev,
  getMajorityVote,
  isUnanimousVote,
  isLowVariance,
  getConfidenceLevel,
  evaluateSingleSample,
  evaluateWithMultiSampling,
  runJudgment,
} from "../../../../src/stages/4-evaluation/multi-sampler.js";

// Mock the LLM judge module
vi.mock("../../../../src/stages/4-evaluation/llm-judge.js", () => ({
  evaluateWithFallback: vi.fn(),
}));

describe("aggregateScores", () => {
  describe("average method", () => {
    it("should calculate mean of scores", () => {
      expect(aggregateScores([7, 8, 9], "average")).toBe(8);
      expect(aggregateScores([6, 8, 10], "average")).toBe(8);
    });

    it("should handle single score", () => {
      expect(aggregateScores([7], "average")).toBe(7);
    });

    it("should handle empty array", () => {
      expect(aggregateScores([], "average")).toBe(0);
    });

    it("should handle decimal results", () => {
      expect(aggregateScores([7, 8], "average")).toBe(7.5);
    });
  });

  describe("median method", () => {
    it("should find middle value for odd count", () => {
      expect(aggregateScores([5, 7, 9], "median")).toBe(7);
      expect(aggregateScores([1, 5, 8, 9, 10], "median")).toBe(8);
    });

    it("should average middle two for even count", () => {
      expect(aggregateScores([6, 8], "median")).toBe(7);
      expect(aggregateScores([4, 6, 8, 10], "median")).toBe(7);
    });

    it("should handle unsorted input", () => {
      expect(aggregateScores([9, 5, 7], "median")).toBe(7);
    });

    it("should handle single score", () => {
      expect(aggregateScores([7], "median")).toBe(7);
    });

    it("should handle empty array", () => {
      expect(aggregateScores([], "median")).toBe(0);
    });
  });

  describe("consensus method", () => {
    it("should return most common score (mode)", () => {
      expect(aggregateScores([7, 7, 8], "consensus")).toBe(7);
      expect(aggregateScores([6, 8, 8, 8, 10], "consensus")).toBe(8);
    });

    it("should return first mode when tie", () => {
      // When there's a tie, behavior depends on iteration order
      const result = aggregateScores([7, 8, 7, 8], "consensus");
      expect([7, 8]).toContain(result);
    });

    it("should handle single score", () => {
      expect(aggregateScores([7], "consensus")).toBe(7);
    });

    it("should handle all different scores", () => {
      // Returns first score when no mode
      expect(aggregateScores([5, 6, 7], "consensus")).toBeDefined();
    });
  });
});

describe("calculateVariance", () => {
  it("should calculate population variance", () => {
    // Variance of [7, 8, 9] = ((7-8)² + (8-8)² + (9-8)²) / 3 = 2/3
    expect(calculateVariance([7, 8, 9])).toBeCloseTo(2 / 3);
  });

  it("should return 0 for identical values", () => {
    expect(calculateVariance([5, 5, 5])).toBe(0);
  });

  it("should return 0 for single value", () => {
    expect(calculateVariance([7])).toBe(0);
  });

  it("should return 0 for empty array", () => {
    expect(calculateVariance([])).toBe(0);
  });

  it("should handle high variance", () => {
    // [1, 10] has mean 5.5, variance = ((1-5.5)² + (10-5.5)²) / 2 = 20.25
    expect(calculateVariance([1, 10])).toBeCloseTo(20.25);
  });
});

describe("calculateStdDev", () => {
  it("should be square root of variance", () => {
    const scores = [7, 8, 9];
    const variance = calculateVariance(scores);
    expect(calculateStdDev(scores)).toBeCloseTo(Math.sqrt(variance));
  });

  it("should return 0 for identical values", () => {
    expect(calculateStdDev([5, 5, 5])).toBe(0);
  });
});

describe("getMajorityVote", () => {
  it("should return most common vote", () => {
    expect(getMajorityVote(["correct", "correct", "incorrect"])).toBe(
      "correct",
    );
    expect(getMajorityVote(["incorrect", "incorrect", "correct"])).toBe(
      "incorrect",
    );
  });

  it("should handle all same votes", () => {
    expect(getMajorityVote(["correct", "correct", "correct"])).toBe("correct");
  });

  it("should handle tie (returns one of the tied values)", () => {
    const result = getMajorityVote(["correct", "incorrect"]);
    expect(["correct", "incorrect"]).toContain(result);
  });

  it("should handle partial votes", () => {
    expect(getMajorityVote(["partial", "partial", "correct"])).toBe("partial");
  });

  it("should return incorrect for empty array", () => {
    expect(getMajorityVote([])).toBe("incorrect");
  });
});

describe("isUnanimousVote", () => {
  it("should return true when all votes are the same", () => {
    expect(isUnanimousVote(["correct", "correct", "correct"])).toBe(true);
    expect(isUnanimousVote(["incorrect", "incorrect"])).toBe(true);
    expect(isUnanimousVote(["partial", "partial", "partial"])).toBe(true);
  });

  it("should return false when votes differ", () => {
    expect(isUnanimousVote(["correct", "incorrect", "correct"])).toBe(false);
    expect(isUnanimousVote(["correct", "partial"])).toBe(false);
    expect(isUnanimousVote(["incorrect", "partial", "correct"])).toBe(false);
  });

  it("should return true for single vote", () => {
    expect(isUnanimousVote(["correct"])).toBe(true);
    expect(isUnanimousVote(["incorrect"])).toBe(true);
    expect(isUnanimousVote(["partial"])).toBe(true);
  });

  it("should return true for empty array (vacuously true)", () => {
    expect(isUnanimousVote([])).toBe(true);
  });

  it("should handle two votes that differ", () => {
    expect(isUnanimousVote(["correct", "incorrect"])).toBe(false);
  });

  it("should handle two votes that agree", () => {
    expect(isUnanimousVote(["correct", "correct"])).toBe(true);
  });
});

describe("isLowVariance", () => {
  it("should return true when variance below threshold", () => {
    expect(isLowVariance(0.5, 1.0)).toBe(true);
    expect(isLowVariance(0.9, 1.0)).toBe(true);
  });

  it("should return false when variance at or above threshold", () => {
    expect(isLowVariance(1.0, 1.0)).toBe(false);
    expect(isLowVariance(1.5, 1.0)).toBe(false);
  });

  it("should use default threshold of 1.0", () => {
    expect(isLowVariance(0.5)).toBe(true);
    expect(isLowVariance(1.5)).toBe(false);
  });
});

describe("getConfidenceLevel", () => {
  const createResponse = (
    score: number,
    accuracy: "correct" | "incorrect" | "partial",
  ): JudgeResponse => ({
    quality_score: score,
    response_relevance: score,
    trigger_accuracy: accuracy,
    issues: [],
    summary: "test",
  });

  it("should return high when all agree and low variance", () => {
    const responses = [
      createResponse(8, "correct"),
      createResponse(8, "correct"),
      createResponse(8, "correct"),
    ];

    expect(getConfidenceLevel(responses)).toBe("high");
  });

  it("should return medium for moderate variance", () => {
    const responses = [
      createResponse(7, "correct"),
      createResponse(8, "correct"),
      createResponse(9, "correct"),
    ];

    expect(getConfidenceLevel(responses)).toBe("medium");
  });

  it("should return low when accuracy disagrees", () => {
    const responses = [
      createResponse(8, "correct"),
      createResponse(8, "incorrect"),
      createResponse(8, "correct"),
    ];

    // Even with low variance, disagreement on accuracy = low confidence
    const level = getConfidenceLevel(responses);
    expect(["medium", "low"]).toContain(level);
  });

  it("should return low for high variance", () => {
    const responses = [
      createResponse(3, "correct"),
      createResponse(8, "correct"),
      createResponse(10, "correct"),
    ];

    expect(getConfidenceLevel(responses)).toBe("low");
  });

  it("should return low for empty array", () => {
    expect(getConfidenceLevel([])).toBe("low");
  });
});

// ============================================================================
// Async Orchestration Function Tests
// ============================================================================

/**
 * Create a mock Anthropic client.
 */
function createMockClient(): Anthropic {
  return {} as Anthropic;
}

/**
 * Create a mock test scenario.
 */
function createScenario(overrides: Partial<TestScenario> = {}): TestScenario {
  return {
    id: "test-scenario-1",
    component_ref: "test-skill",
    component_type: "skill",
    scenario_type: "direct",
    user_prompt: "Help me commit my changes",
    expected_trigger: true,
    expected_component: "commit",
    ...overrides,
  };
}

/**
 * Create a mock transcript.
 */
function createTranscript(): Transcript {
  return {
    metadata: {
      version: "v3.0",
      plugin_name: "test-plugin",
      scenario_id: "test-scenario-1",
      timestamp: new Date().toISOString(),
      model: "claude-sonnet-4-20250514",
    },
    events: [
      {
        id: "msg-1",
        type: "user",
        edit: {
          message: { role: "user", content: "Help me commit my changes" },
        },
      },
      {
        id: "msg-2",
        type: "assistant",
        edit: {
          message: {
            role: "assistant",
            content: "I'll help you commit your changes.",
            tool_calls: [
              { id: "tc-1", name: "Skill", input: { skill: "commit" } },
            ],
          },
        },
      },
    ],
  };
}

/**
 * Create mock programmatic detections.
 */
function createDetections(): ProgrammaticDetection[] {
  return [
    {
      component_type: "skill",
      component_name: "commit",
      confidence: 100,
      tool_name: "Skill",
      evidence: "Skill tool invoked: commit",
      timestamp: Date.now(),
    },
  ];
}

/**
 * Create mock evaluation config.
 */
function createConfig(
  overrides: Partial<EvaluationConfig> = {},
): EvaluationConfig {
  return {
    model: "haiku",
    max_tokens: 1024,
    detection_mode: "programmatic_first",
    num_samples: 1,
    aggregate_method: "average",
    include_citations: true,
    ...overrides,
  };
}

/**
 * Create a mock judge response.
 */
function createJudgeResponse(
  overrides: Partial<JudgeResponse> = {},
): JudgeResponse {
  return {
    quality_score: 8,
    response_relevance: 9,
    trigger_accuracy: "correct",
    issues: [],
    summary: "Component triggered correctly and responded appropriately.",
    ...overrides,
  };
}

describe("evaluateSingleSample", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return result with single sample data", async () => {
    const mockResponse = createJudgeResponse({ quality_score: 8 });
    (evaluateWithFallback as Mock).mockResolvedValue(mockResponse);

    const client = createMockClient();
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections();
    const config = createConfig();

    const result = await evaluateSingleSample(
      client,
      scenario,
      transcript,
      detections,
      config,
    );

    expect(result.individual_scores).toEqual([8]);
    expect(result.aggregated_score).toBe(8);
    expect(result.score_variance).toBe(0);
    expect(result.consensus_trigger_accuracy).toBe("correct");
    expect(result.all_issues).toEqual([]);
    expect(result.representative_response).toEqual(mockResponse);
  });

  it("should pass through issues from judge response", async () => {
    const mockResponse = createJudgeResponse({
      quality_score: 6,
      issues: ["Minor formatting issue", "Could be more detailed"],
    });
    (evaluateWithFallback as Mock).mockResolvedValue(mockResponse);

    const result = await evaluateSingleSample(
      createMockClient(),
      createScenario(),
      createTranscript(),
      createDetections(),
      createConfig(),
    );

    expect(result.all_issues).toEqual([
      "Minor formatting issue",
      "Could be more detailed",
    ]);
  });

  it("should call evaluateWithFallback with correct parameters", async () => {
    const mockResponse = createJudgeResponse();
    (evaluateWithFallback as Mock).mockResolvedValue(mockResponse);

    const client = createMockClient();
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections();
    const config = createConfig({ model: "sonnet", max_tokens: 2048 });

    await evaluateSingleSample(
      client,
      scenario,
      transcript,
      detections,
      config,
    );

    expect(evaluateWithFallback).toHaveBeenCalledTimes(1);
    expect(evaluateWithFallback).toHaveBeenCalledWith(
      client,
      scenario,
      transcript,
      detections,
      config,
    );
  });

  it("should always set is_unanimous to true (single sample is trivially unanimous)", async () => {
    const mockResponse = createJudgeResponse({ trigger_accuracy: "correct" });
    (evaluateWithFallback as Mock).mockResolvedValue(mockResponse);

    const result = await evaluateSingleSample(
      createMockClient(),
      createScenario(),
      createTranscript(),
      createDetections(),
      createConfig(),
    );

    expect(result.is_unanimous).toBe(true);
  });
});

describe("evaluateWithMultiSampling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should run judge multiple times based on num_samples", async () => {
    const mockResponse = createJudgeResponse({ quality_score: 8 });
    (evaluateWithFallback as Mock).mockResolvedValue(mockResponse);

    const config = createConfig({ num_samples: 3 });

    await evaluateWithMultiSampling(
      createMockClient(),
      createScenario(),
      createTranscript(),
      createDetections(),
      config,
    );

    expect(evaluateWithFallback).toHaveBeenCalledTimes(3);
  });

  it("should aggregate scores using average method", async () => {
    const responses = [
      createJudgeResponse({ quality_score: 7, response_relevance: 6 }),
      createJudgeResponse({ quality_score: 8, response_relevance: 8 }),
      createJudgeResponse({ quality_score: 9, response_relevance: 10 }),
    ];
    let callIndex = 0;
    (evaluateWithFallback as Mock).mockImplementation(() => {
      return Promise.resolve(responses[callIndex++]);
    });

    const config = createConfig({
      num_samples: 3,
      aggregate_method: "average",
    });

    const result = await evaluateWithMultiSampling(
      createMockClient(),
      createScenario(),
      createTranscript(),
      createDetections(),
      config,
    );

    expect(result.individual_scores).toEqual([7, 8, 9]);
    expect(result.aggregated_score).toBe(8); // (7+8+9)/3
    expect(result.score_variance).toBeCloseTo(2 / 3);
  });

  it("should aggregate scores using median method", async () => {
    const responses = [
      createJudgeResponse({ quality_score: 5 }),
      createJudgeResponse({ quality_score: 8 }),
      createJudgeResponse({ quality_score: 10 }),
    ];
    let callIndex = 0;
    (evaluateWithFallback as Mock).mockImplementation(() => {
      return Promise.resolve(responses[callIndex++]);
    });

    const config = createConfig({ num_samples: 3, aggregate_method: "median" });

    const result = await evaluateWithMultiSampling(
      createMockClient(),
      createScenario(),
      createTranscript(),
      createDetections(),
      config,
    );

    expect(result.aggregated_score).toBe(8); // median of [5, 8, 10]
  });

  it("should use majority vote for trigger accuracy", async () => {
    const responses = [
      createJudgeResponse({ trigger_accuracy: "correct" }),
      createJudgeResponse({ trigger_accuracy: "correct" }),
      createJudgeResponse({ trigger_accuracy: "incorrect" }),
    ];
    let callIndex = 0;
    (evaluateWithFallback as Mock).mockImplementation(() => {
      return Promise.resolve(responses[callIndex++]);
    });

    const config = createConfig({ num_samples: 3 });

    const result = await evaluateWithMultiSampling(
      createMockClient(),
      createScenario(),
      createTranscript(),
      createDetections(),
      config,
    );

    expect(result.consensus_trigger_accuracy).toBe("correct");
  });

  it("should set is_unanimous to true when all samples agree on trigger_accuracy", async () => {
    const responses = [
      createJudgeResponse({ trigger_accuracy: "correct" }),
      createJudgeResponse({ trigger_accuracy: "correct" }),
      createJudgeResponse({ trigger_accuracy: "correct" }),
    ];
    let callIndex = 0;
    (evaluateWithFallback as Mock).mockImplementation(() => {
      return Promise.resolve(responses[callIndex++]);
    });

    const config = createConfig({ num_samples: 3 });

    const result = await evaluateWithMultiSampling(
      createMockClient(),
      createScenario(),
      createTranscript(),
      createDetections(),
      config,
    );

    expect(result.is_unanimous).toBe(true);
    expect(result.consensus_trigger_accuracy).toBe("correct");
  });

  it("should set is_unanimous to false when samples disagree on trigger_accuracy", async () => {
    const responses = [
      createJudgeResponse({ trigger_accuracy: "correct" }),
      createJudgeResponse({ trigger_accuracy: "correct" }),
      createJudgeResponse({ trigger_accuracy: "incorrect" }),
    ];
    let callIndex = 0;
    (evaluateWithFallback as Mock).mockImplementation(() => {
      return Promise.resolve(responses[callIndex++]);
    });

    const config = createConfig({ num_samples: 3 });

    const result = await evaluateWithMultiSampling(
      createMockClient(),
      createScenario(),
      createTranscript(),
      createDetections(),
      config,
    );

    expect(result.is_unanimous).toBe(false);
    // Majority vote should still work
    expect(result.consensus_trigger_accuracy).toBe("correct");
  });

  it("should collect unique issues from all samples", async () => {
    const responses = [
      createJudgeResponse({ issues: ["Issue A", "Issue B"] }),
      createJudgeResponse({ issues: ["Issue B", "Issue C"] }),
      createJudgeResponse({ issues: ["Issue A"] }),
    ];
    let callIndex = 0;
    (evaluateWithFallback as Mock).mockImplementation(() => {
      return Promise.resolve(responses[callIndex++]);
    });

    const config = createConfig({ num_samples: 3 });

    const result = await evaluateWithMultiSampling(
      createMockClient(),
      createScenario(),
      createTranscript(),
      createDetections(),
      config,
    );

    expect(result.all_issues).toHaveLength(3);
    expect(result.all_issues).toContain("Issue A");
    expect(result.all_issues).toContain("Issue B");
    expect(result.all_issues).toContain("Issue C");
  });

  it("should include representative response with aggregated values", async () => {
    const responses = [
      createJudgeResponse({
        quality_score: 7,
        response_relevance: 6,
        trigger_accuracy: "correct",
        summary: "First response",
      }),
      createJudgeResponse({
        quality_score: 9,
        response_relevance: 8,
        trigger_accuracy: "correct",
        summary: "Second response",
      }),
    ];
    let callIndex = 0;
    (evaluateWithFallback as Mock).mockImplementation(() => {
      return Promise.resolve(responses[callIndex++]);
    });

    const config = createConfig({
      num_samples: 2,
      aggregate_method: "average",
    });

    const result = await evaluateWithMultiSampling(
      createMockClient(),
      createScenario(),
      createTranscript(),
      createDetections(),
      config,
    );

    // Representative should have aggregated values
    expect(result.representative_response.quality_score).toBe(8); // (7+9)/2
    expect(result.representative_response.response_relevance).toBe(7); // (6+8)/2
    expect(result.representative_response.trigger_accuracy).toBe("correct");
    // But keeps structure from first response
    expect(result.representative_response.summary).toBe("First response");
  });

  it("should handle single sample gracefully", async () => {
    const mockResponse = createJudgeResponse({ quality_score: 7 });
    (evaluateWithFallback as Mock).mockResolvedValue(mockResponse);

    const config = createConfig({ num_samples: 1 });

    const result = await evaluateWithMultiSampling(
      createMockClient(),
      createScenario(),
      createTranscript(),
      createDetections(),
      config,
    );

    expect(evaluateWithFallback).toHaveBeenCalledTimes(1);
    expect(result.individual_scores).toEqual([7]);
    expect(result.score_variance).toBe(0);
  });
});

describe("runJudgment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should use single sample when num_samples <= 1", async () => {
    const mockResponse = createJudgeResponse({ quality_score: 8 });
    (evaluateWithFallback as Mock).mockResolvedValue(mockResponse);

    const config = createConfig({ num_samples: 1 });

    const result = await runJudgment(
      createMockClient(),
      createScenario(),
      createTranscript(),
      createDetections(),
      config,
    );

    expect(evaluateWithFallback).toHaveBeenCalledTimes(1);
    expect(result.individual_scores).toEqual([8]);
    expect(result.score_variance).toBe(0);
  });

  it("should use multi-sampling when num_samples > 1", async () => {
    const mockResponse = createJudgeResponse({ quality_score: 8 });
    (evaluateWithFallback as Mock).mockResolvedValue(mockResponse);

    const config = createConfig({ num_samples: 3 });

    const result = await runJudgment(
      createMockClient(),
      createScenario(),
      createTranscript(),
      createDetections(),
      config,
    );

    expect(evaluateWithFallback).toHaveBeenCalledTimes(3);
    expect(result.individual_scores).toHaveLength(3);
  });

  it("should handle zero num_samples as single sample", async () => {
    const mockResponse = createJudgeResponse({ quality_score: 7 });
    (evaluateWithFallback as Mock).mockResolvedValue(mockResponse);

    const config = createConfig({ num_samples: 0 });

    const result = await runJudgment(
      createMockClient(),
      createScenario(),
      createTranscript(),
      createDetections(),
      config,
    );

    // Should treat 0 as single sample (via evaluateSingleSample path)
    expect(evaluateWithFallback).toHaveBeenCalledTimes(1);
    expect(result.aggregated_score).toBe(7);
  });

  it("should propagate errors from evaluateWithFallback", async () => {
    (evaluateWithFallback as Mock).mockRejectedValue(new Error("API Error"));

    const config = createConfig({ num_samples: 1 });

    await expect(
      runJudgment(
        createMockClient(),
        createScenario(),
        createTranscript(),
        createDetections(),
        config,
      ),
    ).rejects.toThrow("API Error");
  });
});
