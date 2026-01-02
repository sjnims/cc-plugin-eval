/**
 * Tests for metrics functions.
 */

import { describe, it, expect } from "vitest";

import type {
  EvaluationResult,
  ExecutionResult,
  TestScenario,
} from "../../../../src/types/index.js";

import {
  calculateTriggerRate,
  calculateAccuracy,
  calculateAvgQuality,
  countFalsePositives,
  countFalseNegatives,
  calculateComponentMetrics,
  calculateMultiSampleStats,
  calculateEvalMetrics,
  formatMetrics,
  createEmptyMetrics,
} from "../../../../src/stages/4-evaluation/metrics.js";

/**
 * Create a mock EvaluationResult.
 */
function createEvalResult(
  overrides: Partial<EvaluationResult> = {},
): EvaluationResult {
  return {
    scenario_id: "test-1",
    triggered: true,
    confidence: 100,
    quality_score: 8,
    evidence: [],
    issues: [],
    summary: "test",
    detection_source: "programmatic",
    all_triggered_components: [],
    has_conflict: false,
    conflict_severity: "none",
    ...overrides,
  };
}

/**
 * Create a mock TestScenario.
 */
function createScenario(overrides: Partial<TestScenario> = {}): TestScenario {
  return {
    id: "test-1",
    component_ref: "test-skill",
    component_type: "skill",
    scenario_type: "direct",
    user_prompt: "test",
    expected_trigger: true,
    expected_component: "test-skill",
    ...overrides,
  };
}

/**
 * Create a mock ExecutionResult.
 */
function createExecResult(
  overrides: Partial<ExecutionResult> = {},
): ExecutionResult {
  return {
    scenario_id: "test-1",
    transcript: {
      metadata: {
        version: "v3.0",
        plugin_name: "test",
        scenario_id: "test-1",
        timestamp: new Date().toISOString(),
        model: "test",
      },
      events: [],
    },
    detected_tools: [],
    cost_usd: 0.01,
    api_duration_ms: 1000,
    num_turns: 1,
    permission_denials: [],
    errors: [],
    ...overrides,
  };
}

describe("calculateTriggerRate", () => {
  it("should calculate percentage of triggered results", () => {
    const results = [
      createEvalResult({ triggered: true }),
      createEvalResult({ triggered: true }),
      createEvalResult({ triggered: false }),
    ];

    expect(calculateTriggerRate(results)).toBeCloseTo(2 / 3);
  });

  it("should return 0 for empty array", () => {
    expect(calculateTriggerRate([])).toBe(0);
  });

  it("should return 1 when all triggered", () => {
    const results = [
      createEvalResult({ triggered: true }),
      createEvalResult({ triggered: true }),
    ];

    expect(calculateTriggerRate(results)).toBe(1);
  });

  it("should return 0 when none triggered", () => {
    const results = [
      createEvalResult({ triggered: false }),
      createEvalResult({ triggered: false }),
    ];

    expect(calculateTriggerRate(results)).toBe(0);
  });
});

describe("calculateAccuracy", () => {
  it("should count correct triggers as accurate", () => {
    const results = [
      {
        result: createEvalResult({ triggered: true }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult(),
      },
    ];

    expect(calculateAccuracy(results)).toBe(1);
  });

  it("should count correct non-triggers as accurate", () => {
    const results = [
      {
        result: createEvalResult({ triggered: false }),
        scenario: createScenario({ expected_trigger: false }),
        execution: createExecResult(),
      },
    ];

    expect(calculateAccuracy(results)).toBe(1);
  });

  it("should count mismatches as inaccurate", () => {
    const results = [
      {
        result: createEvalResult({ triggered: true }),
        scenario: createScenario({ expected_trigger: false }),
        execution: createExecResult(),
      },
      {
        result: createEvalResult({ triggered: false }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult(),
      },
    ];

    expect(calculateAccuracy(results)).toBe(0);
  });

  it("should calculate mixed accuracy", () => {
    const results = [
      {
        result: createEvalResult({ triggered: true }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult(),
      },
      {
        result: createEvalResult({ triggered: false }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult(),
      },
    ];

    expect(calculateAccuracy(results)).toBe(0.5);
  });

  it("should return 0 for empty array", () => {
    expect(calculateAccuracy([])).toBe(0);
  });
});

describe("calculateAvgQuality", () => {
  it("should average quality scores", () => {
    const results = [
      createEvalResult({ quality_score: 7 }),
      createEvalResult({ quality_score: 8 }),
      createEvalResult({ quality_score: 9 }),
    ];

    expect(calculateAvgQuality(results)).toBe(8);
  });

  it("should exclude null quality scores", () => {
    const results = [
      createEvalResult({ quality_score: 8 }),
      createEvalResult({ quality_score: null }),
      createEvalResult({ quality_score: 10 }),
    ];

    expect(calculateAvgQuality(results)).toBe(9);
  });

  it("should exclude zero quality scores", () => {
    const results = [
      createEvalResult({ quality_score: 8 }),
      createEvalResult({ quality_score: 0 }),
    ];

    expect(calculateAvgQuality(results)).toBe(8);
  });

  it("should return 0 when no valid scores", () => {
    const results = [
      createEvalResult({ quality_score: null }),
      createEvalResult({ quality_score: 0 }),
    ];

    expect(calculateAvgQuality(results)).toBe(0);
  });

  it("should return 0 for empty array", () => {
    expect(calculateAvgQuality([])).toBe(0);
  });
});

describe("countFalsePositives", () => {
  it("should count triggered when not expected", () => {
    const results = [
      {
        result: createEvalResult({ triggered: true }),
        scenario: createScenario({ expected_trigger: false }),
        execution: createExecResult(),
      },
      {
        result: createEvalResult({ triggered: true }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult(),
      },
    ];

    expect(countFalsePositives(results)).toBe(1);
  });

  it("should return 0 when no false positives", () => {
    const results = [
      {
        result: createEvalResult({ triggered: false }),
        scenario: createScenario({ expected_trigger: false }),
        execution: createExecResult(),
      },
    ];

    expect(countFalsePositives(results)).toBe(0);
  });
});

describe("countFalseNegatives", () => {
  it("should count not triggered when expected", () => {
    const results = [
      {
        result: createEvalResult({ triggered: false }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult(),
      },
      {
        result: createEvalResult({ triggered: true }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult(),
      },
    ];

    expect(countFalseNegatives(results)).toBe(1);
  });

  it("should return 0 when no false negatives", () => {
    const results = [
      {
        result: createEvalResult({ triggered: true }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult(),
      },
    ];

    expect(countFalseNegatives(results)).toBe(0);
  });
});

describe("calculateComponentMetrics", () => {
  it("should group metrics by component", () => {
    const results = [
      {
        result: createEvalResult({ triggered: true, quality_score: 8 }),
        scenario: createScenario({ expected_component: "skill-a" }),
        execution: createExecResult(),
      },
      {
        result: createEvalResult({ triggered: true, quality_score: 9 }),
        scenario: createScenario({ expected_component: "skill-a" }),
        execution: createExecResult(),
      },
      {
        result: createEvalResult({ triggered: false, quality_score: null }),
        scenario: createScenario({ expected_component: "skill-b" }),
        execution: createExecResult(),
      },
    ];

    const metrics = calculateComponentMetrics(results);

    expect(metrics["skill-a"]).toBeDefined();
    expect(metrics["skill-a"]?.scenarios_count).toBe(2);
    expect(metrics["skill-a"]?.trigger_rate).toBe(1);
    expect(metrics["skill-a"]?.avg_quality).toBe(8.5);

    expect(metrics["skill-b"]).toBeDefined();
    expect(metrics["skill-b"]?.scenarios_count).toBe(1);
    expect(metrics["skill-b"]?.trigger_rate).toBe(0);
  });
});

describe("calculateMultiSampleStats", () => {
  it("should return undefined for empty sampleData", () => {
    expect(calculateMultiSampleStats([])).toBeUndefined();
  });

  it("should return undefined when num_samples is 1", () => {
    const sampleData = [
      { scenarioId: "s1", variance: 0, numSamples: 1, hasConsensus: true },
    ];
    expect(calculateMultiSampleStats(sampleData)).toBeUndefined();
  });

  it("should calculate consensus_rate from hasConsensus field", () => {
    const sampleData = [
      { scenarioId: "s1", variance: 0.5, numSamples: 3, hasConsensus: true },
      { scenarioId: "s2", variance: 0.3, numSamples: 3, hasConsensus: true },
      { scenarioId: "s3", variance: 0.8, numSamples: 3, hasConsensus: false },
      { scenarioId: "s4", variance: 0.2, numSamples: 3, hasConsensus: true },
    ];

    const stats = calculateMultiSampleStats(sampleData);

    expect(stats).toBeDefined();
    // 3 out of 4 have consensus
    expect(stats?.consensus_rate).toBe(0.75);
  });

  it("should track high variance scenarios independently of consensus", () => {
    const sampleData = [
      // Low variance, has consensus
      { scenarioId: "s1", variance: 0.5, numSamples: 3, hasConsensus: true },
      // High variance (> 1.0), has consensus - this is the key test case
      // Low quality score variance but unanimous trigger_accuracy
      { scenarioId: "s2", variance: 1.5, numSamples: 3, hasConsensus: true },
      // Low variance, no consensus - another key test case
      // Similar quality scores but disagreement on trigger_accuracy
      { scenarioId: "s3", variance: 0.3, numSamples: 3, hasConsensus: false },
    ];

    const stats = calculateMultiSampleStats(sampleData);

    expect(stats).toBeDefined();
    // High variance only for s2
    expect(stats?.high_variance_scenarios).toEqual(["s2"]);
    // Consensus for s1 and s2 (2 out of 3)
    expect(stats?.consensus_rate).toBeCloseTo(2 / 3);
  });

  it("should calculate average variance correctly", () => {
    const sampleData = [
      { scenarioId: "s1", variance: 1.0, numSamples: 3, hasConsensus: true },
      { scenarioId: "s2", variance: 2.0, numSamples: 3, hasConsensus: true },
      { scenarioId: "s3", variance: 3.0, numSamples: 3, hasConsensus: false },
    ];

    const stats = calculateMultiSampleStats(sampleData);

    expect(stats?.avg_score_variance).toBe(2.0);
  });

  it("should return 100% consensus rate when all scenarios are unanimous", () => {
    const sampleData = [
      { scenarioId: "s1", variance: 0.5, numSamples: 3, hasConsensus: true },
      { scenarioId: "s2", variance: 0.3, numSamples: 3, hasConsensus: true },
    ];

    const stats = calculateMultiSampleStats(sampleData);

    expect(stats?.consensus_rate).toBe(1.0);
  });

  it("should return 0% consensus rate when no scenarios are unanimous", () => {
    const sampleData = [
      { scenarioId: "s1", variance: 0.5, numSamples: 3, hasConsensus: false },
      { scenarioId: "s2", variance: 0.3, numSamples: 3, hasConsensus: false },
    ];

    const stats = calculateMultiSampleStats(sampleData);

    expect(stats?.consensus_rate).toBe(0);
  });
});

describe("calculateEvalMetrics", () => {
  it("should calculate comprehensive metrics", () => {
    const results = [
      {
        result: createEvalResult({
          triggered: true,
          quality_score: 8,
          has_conflict: false,
        }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult({ cost_usd: 0.01, api_duration_ms: 1000 }),
      },
      {
        result: createEvalResult({
          triggered: false,
          quality_score: null,
          has_conflict: true,
          conflict_severity: "major",
        }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult({ cost_usd: 0.02, api_duration_ms: 2000 }),
      },
    ];

    const executions = results.map((r) => r.execution);

    const metrics = calculateEvalMetrics(results, executions);

    expect(metrics.total_scenarios).toBe(2);
    expect(metrics.triggered_count).toBe(1);
    expect(metrics.trigger_rate).toBe(0.5);
    expect(metrics.accuracy).toBe(0.5);
    expect(metrics.avg_quality).toBe(8);
    expect(metrics.conflict_count).toBe(1);
    expect(metrics.major_conflicts).toBe(1);
    expect(metrics.total_cost_usd).toBe(0.03);
    expect(metrics.total_api_duration_ms).toBe(3000);
  });
});

describe("formatMetrics", () => {
  it("should format metrics as readable string", () => {
    const metrics = createEmptyMetrics();
    metrics.total_scenarios = 10;
    metrics.triggered_count = 8;
    metrics.trigger_rate = 0.8;
    metrics.accuracy = 0.9;
    metrics.avg_quality = 7.5;
    metrics.total_cost_usd = 0.1234;

    const formatted = formatMetrics(metrics);

    expect(formatted).toContain("Evaluation Metrics:");
    expect(formatted).toContain("Total Scenarios:    10");
    expect(formatted).toContain("80.0%");
    expect(formatted).toContain("Accuracy:");
  });

  it("should include error details when present", () => {
    const metrics = createEmptyMetrics();
    metrics.error_count = 3;
    metrics.errors_by_type = {
      api_error: 2,
      timeout: 1,
      permission_denied: 0,
      budget_exceeded: 0,
    };

    const formatted = formatMetrics(metrics);

    expect(formatted).toContain("Errors:             3");
    expect(formatted).toContain("API errors:     2");
    expect(formatted).toContain("Timeouts:       1");
  });
});

describe("createEmptyMetrics", () => {
  it("should create metrics with zero values", () => {
    const metrics = createEmptyMetrics();

    expect(metrics.total_scenarios).toBe(0);
    expect(metrics.triggered_count).toBe(0);
    expect(metrics.trigger_rate).toBe(0);
    expect(metrics.accuracy).toBe(0);
    expect(metrics.avg_quality).toBe(0);
    expect(metrics.conflict_count).toBe(0);
    expect(metrics.total_cost_usd).toBe(0);
    expect(metrics.error_count).toBe(0);
  });

  it("should have empty by_component", () => {
    const metrics = createEmptyMetrics();

    expect(Object.keys(metrics.by_component)).toHaveLength(0);
  });
});
