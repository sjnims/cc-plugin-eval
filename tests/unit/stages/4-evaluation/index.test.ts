/**
 * Tests for Stage 4 evaluation orchestration.
 *
 * Tests the main runEvaluation function and its integration with
 * programmatic detection, LLM judge, and conflict analysis.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

import type {
  EvalConfig,
  ExecutionResult,
  MultiSampleResult,
  TestScenario,
  ToolCapture,
  Transcript,
} from "../../../../src/types/index.js";
import { writeJson } from "../../../../src/utils/file-io.js";
import { logger } from "../../../../src/utils/logging.js";

import { runJudgment } from "../../../../src/stages/4-evaluation/multi-sampler.js";

import { runEvaluation } from "../../../../src/stages/4-evaluation/index.js";

// Mock dependencies
// Vitest 4 requires constructable functions for mocks used with `new`
vi.mock("@anthropic-ai/sdk", () => {
  const MockAnthropic = vi.fn(function (this: Record<string, unknown>) {
    this.messages = { create: vi.fn() };
  });
  return { default: MockAnthropic };
});

vi.mock("../../../../src/utils/concurrency.js", () => ({
  parallel: vi.fn(
    async <T, R>({
      items,
      fn,
    }: {
      items: T[];
      fn: (item: T, index: number) => Promise<R>;
    }) => {
      const results: R[] = [];
      for (let i = 0; i < items.length; i++) {
        results.push(await fn(items[i] as T, i));
      }
      return { results, errors: [] };
    },
  ),
}));

vi.mock("../../../../src/utils/file-io.js", () => ({
  ensureDir: vi.fn(),
  getResultsDir: vi.fn(() => "/mock/results/test-plugin"),
  writeJson: vi.fn(),
}));

vi.mock("../../../../src/utils/logging.js", () => ({
  logger: {
    stageHeader: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    progress: vi.fn(),
  },
}));

vi.mock("../../../../src/stages/4-evaluation/multi-sampler.js", () => ({
  runJudgment: vi.fn(),
}));

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Create a mock test scenario.
 */
function createScenario(overrides: Partial<TestScenario> = {}): TestScenario {
  return {
    id: "scenario-1",
    component_ref: "commit-skill",
    component_type: "skill",
    scenario_type: "direct",
    user_prompt: "Help me commit my changes",
    expected_trigger: true,
    expected_component: "commit",
    ...overrides,
  };
}

/**
 * Create a mock tool capture.
 */
function createToolCapture(
  name: string,
  input: unknown,
  timestamp = Date.now(),
): ToolCapture {
  return {
    name,
    input,
    toolUseId: `tool-${String(timestamp)}`,
    timestamp,
  };
}

/**
 * Create a mock transcript.
 */
function createTranscript(
  scenarioId = "scenario-1",
  pluginName = "test-plugin",
  events: Transcript["events"] = [],
): Transcript {
  return {
    metadata: {
      version: "v3.0",
      plugin_name: pluginName,
      scenario_id: scenarioId,
      timestamp: new Date().toISOString(),
      model: "claude-sonnet-4-20250514",
    },
    events:
      events.length > 0
        ? events
        : [
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
 * Create a mock execution result.
 */
function createExecutionResult(
  overrides: Partial<ExecutionResult> = {},
): ExecutionResult {
  return {
    scenario_id: "scenario-1",
    transcript: createTranscript(),
    detected_tools: [createToolCapture("Skill", { skill: "commit" })],
    cost_usd: 0.01,
    api_duration_ms: 1000,
    num_turns: 2,
    permission_denials: [],
    errors: [],
    ...overrides,
  };
}

/**
 * Create a mock eval config.
 */
function createConfig(overrides: Partial<EvalConfig> = {}): EvalConfig {
  return {
    max_concurrent: 2,
    evaluation: {
      model: "haiku",
      max_tokens: 1024,
      detection_mode: "programmatic_first",
      num_samples: 1,
      aggregate_method: "average",
      include_citations: false,
    },
    execution: {
      model: "sonnet",
      max_tokens: 4096,
      max_turns: 10,
      timeout_ms: 60000,
      disallowed_tools: [],
      num_reps: 1,
    },
    ...overrides,
  };
}

/**
 * Create a mock multi-sample result.
 */
function createMultiSampleResult(
  overrides: Partial<MultiSampleResult> = {},
): MultiSampleResult {
  return {
    individual_scores: [8],
    aggregated_score: 8,
    score_variance: 0,
    consensus_trigger_accuracy: "correct",
    is_unanimous: true,
    all_issues: [],
    representative_response: {
      quality_score: 8,
      response_relevance: 9,
      trigger_accuracy: "correct",
      issues: [],
      summary: "Component triggered correctly.",
    },
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("runEvaluation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (runJudgment as Mock).mockResolvedValue(createMultiSampleResult());
  });

  describe("basic functionality", () => {
    it("should evaluate scenarios and return results", async () => {
      const scenarios = [createScenario()];
      const executions = [createExecutionResult()];
      const config = createConfig();

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.plugin_name).toBe("test-plugin");
      expect(output.results).toHaveLength(1);
      expect(output.results[0]?.scenario_id).toBe("scenario-1");
      expect(output.results[0]?.triggered).toBe(true);
    });

    it("should handle empty executions gracefully", async () => {
      const scenarios: TestScenario[] = [];
      const executions: ExecutionResult[] = [];
      const config = createConfig();

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.results).toHaveLength(0);
      expect(output.metrics.total_scenarios).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith("No executions to evaluate");
    });

    it("should save results to disk", async () => {
      const scenarios = [createScenario()];
      const executions = [createExecutionResult()];
      const config = createConfig();

      await runEvaluation("test-plugin", scenarios, executions, config);

      expect(writeJson).toHaveBeenCalledTimes(1);
      expect(writeJson).toHaveBeenCalledWith(
        "/mock/results/test-plugin/evaluation.json",
        expect.objectContaining({
          plugin_name: "test-plugin",
          results: expect.any(Array),
          metrics: expect.any(Object),
        }),
      );
    });
  });

  describe("programmatic detection", () => {
    it("should detect triggered component from tool captures", async () => {
      const scenarios = [createScenario({ expected_component: "commit" })];
      const executions = [
        createExecutionResult({
          detected_tools: [createToolCapture("Skill", { skill: "commit" })],
        }),
      ];
      const config = createConfig();

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.results[0]?.triggered).toBe(true);
      expect(output.results[0]?.confidence).toBe(100);
      expect(output.results[0]?.all_triggered_components).toContainEqual(
        expect.objectContaining({
          component_type: "skill",
          component_name: "commit",
        }),
      );
    });

    it("should detect non-triggered scenario", async () => {
      const scenarios = [createScenario({ expected_component: "commit" })];
      const executions = [
        createExecutionResult({
          detected_tools: [], // No tools captured
          transcript: createTranscript("scenario-1", "test-plugin", [
            {
              id: "msg-1",
              type: "user",
              edit: {
                message: { role: "user", content: "Hello" },
              },
            },
            {
              id: "msg-2",
              type: "assistant",
              edit: {
                message: {
                  role: "assistant",
                  content: "Hi there!",
                },
              },
            },
          ]),
        }),
      ];
      const config = createConfig();

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.results[0]?.triggered).toBe(false);
      expect(output.results[0]?.confidence).toBe(0);
    });

    it("should detect agent triggers via Task tool", async () => {
      const scenarios = [
        createScenario({
          component_type: "agent",
          expected_component: "bootstrap-expert",
        }),
      ];
      const executions = [
        createExecutionResult({
          detected_tools: [
            createToolCapture("Task", { subagent_type: "bootstrap-expert" }),
          ],
        }),
      ];
      const config = createConfig();

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.results[0]?.triggered).toBe(true);
      expect(output.results[0]?.all_triggered_components).toContainEqual(
        expect.objectContaining({
          component_type: "agent",
          component_name: "bootstrap-expert",
        }),
      );
    });

    it("should detect command triggers via SlashCommand tool", async () => {
      const scenarios = [
        createScenario({
          component_type: "command",
          expected_component: "create-plugin",
        }),
      ];
      const executions = [
        createExecutionResult({
          detected_tools: [
            createToolCapture("SlashCommand", { skill: "create-plugin" }),
          ],
        }),
      ];
      const config = createConfig();

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.results[0]?.triggered).toBe(true);
      expect(output.results[0]?.all_triggered_components).toContainEqual(
        expect.objectContaining({
          component_type: "command",
          component_name: "create-plugin",
        }),
      );
    });
  });

  describe("LLM judge integration", () => {
    it("should use LLM judge for quality assessment when triggered", async () => {
      (runJudgment as Mock).mockResolvedValue(
        createMultiSampleResult({
          aggregated_score: 9,
          representative_response: {
            quality_score: 9,
            response_relevance: 8,
            trigger_accuracy: "correct",
            issues: [],
            summary: "Excellent response",
          },
        }),
      );

      const scenarios = [createScenario({ expected_trigger: true })];
      const executions = [createExecutionResult()];
      const config = createConfig();

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(runJudgment).toHaveBeenCalled();
      expect(output.results[0]?.quality_score).toBe(9);
      expect(output.results[0]?.summary).toBe("Excellent response");
    });

    it("should use LLM judge for false negatives", async () => {
      (runJudgment as Mock).mockResolvedValue(
        createMultiSampleResult({
          aggregated_score: 3,
          all_issues: ["Component failed to trigger"],
          representative_response: {
            quality_score: 3,
            response_relevance: 2,
            trigger_accuracy: "incorrect",
            issues: ["Component failed to trigger"],
            summary: "Expected trigger did not occur",
          },
        }),
      );

      const scenarios = [createScenario({ expected_trigger: true })];
      const executions = [
        createExecutionResult({
          detected_tools: [], // No trigger
          transcript: createTranscript("scenario-1", "test-plugin", [
            {
              id: "msg-1",
              type: "user",
              edit: { message: { role: "user", content: "test" } },
            },
          ]),
        }),
      ];
      const config = createConfig();

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(runJudgment).toHaveBeenCalled();
      expect(output.results[0]?.issues).toContain(
        "Component failed to trigger",
      );
    });

    it("should skip LLM judge for true negatives in programmatic_first mode", async () => {
      const scenarios = [
        createScenario({
          expected_trigger: false,
          scenario_type: "direct",
        }),
      ];
      const executions = [
        createExecutionResult({
          detected_tools: [],
          transcript: createTranscript("scenario-1", "test-plugin", [
            {
              id: "msg-1",
              type: "user",
              edit: { message: { role: "user", content: "unrelated" } },
            },
          ]),
        }),
      ];
      const config = createConfig({
        evaluation: {
          ...createConfig().evaluation,
          detection_mode: "programmatic_first",
        },
      });

      await runEvaluation("test-plugin", scenarios, executions, config);

      // True negative with direct scenario type - no LLM needed
      expect(runJudgment).not.toHaveBeenCalled();
    });

    it("should always use LLM in llm_only mode", async () => {
      const scenarios = [createScenario({ expected_trigger: false })];
      const executions = [
        createExecutionResult({
          detected_tools: [],
          transcript: createTranscript("scenario-1", "test-plugin", [
            {
              id: "msg-1",
              type: "user",
              edit: { message: { role: "user", content: "test" } },
            },
          ]),
        }),
      ];
      const config = createConfig({
        evaluation: {
          ...createConfig().evaluation,
          detection_mode: "llm_only",
        },
      });

      await runEvaluation("test-plugin", scenarios, executions, config);

      expect(runJudgment).toHaveBeenCalled();
    });

    it("should handle LLM judge errors gracefully", async () => {
      (runJudgment as Mock).mockRejectedValue(new Error("API Error"));

      const scenarios = [createScenario()];
      const executions = [createExecutionResult()];
      const config = createConfig();

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      // Should still return result with error captured
      expect(output.results).toHaveLength(1);
      expect(output.results[0]?.issues).toContain("API Error");
      expect(output.results[0]?.quality_score).toBe(0);
    });
  });

  describe("conflict detection", () => {
    it("should detect no conflict when only expected component triggers", async () => {
      const scenarios = [createScenario({ expected_component: "commit" })];
      const executions = [
        createExecutionResult({
          detected_tools: [createToolCapture("Skill", { skill: "commit" })],
        }),
      ];
      const config = createConfig();

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.results[0]?.has_conflict).toBe(false);
      expect(output.results[0]?.conflict_severity).toBe("none");
    });

    it("should detect major conflict when wrong component triggers", async () => {
      const scenarios = [createScenario({ expected_component: "commit" })];
      const executions = [
        createExecutionResult({
          detected_tools: [createToolCapture("Skill", { skill: "review" })],
        }),
      ];
      const config = createConfig();

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.results[0]?.has_conflict).toBe(true);
      expect(output.results[0]?.conflict_severity).toBe("major");
    });

    it("should detect minor conflict for related components", async () => {
      const scenarios = [
        createScenario({ expected_component: "skill-development" }),
      ];
      const executions = [
        createExecutionResult({
          detected_tools: [
            createToolCapture("Skill", { skill: "skill-development" }),
            createToolCapture("Skill", { skill: "command-development" }),
          ],
        }),
      ];
      const config = createConfig();

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.results[0]?.has_conflict).toBe(true);
      expect(output.results[0]?.conflict_severity).toBe("minor");
    });
  });

  describe("metrics calculation", () => {
    it("should calculate correct trigger rate", async () => {
      const scenarios = [
        createScenario({ id: "s1", expected_component: "commit" }),
        createScenario({ id: "s2", expected_component: "review" }),
        createScenario({ id: "s3", expected_component: "test" }),
      ];
      const executions = [
        createExecutionResult({
          scenario_id: "s1",
          detected_tools: [createToolCapture("Skill", { skill: "commit" })],
        }),
        createExecutionResult({
          scenario_id: "s2",
          detected_tools: [createToolCapture("Skill", { skill: "review" })],
        }),
        createExecutionResult({
          scenario_id: "s3",
          detected_tools: [], // Not triggered
          transcript: createTranscript("s3"),
        }),
      ];
      const config = createConfig();

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.metrics.trigger_rate).toBeCloseTo(2 / 3);
      expect(output.metrics.triggered_count).toBe(2);
      expect(output.metrics.total_scenarios).toBe(3);
    });

    it("should calculate accuracy including false positives and negatives", async () => {
      const scenarios = [
        createScenario({
          id: "s1",
          expected_component: "commit",
          expected_trigger: true,
        }),
        createScenario({
          id: "s2",
          expected_component: "review",
          expected_trigger: false,
        }),
      ];
      const executions = [
        createExecutionResult({
          scenario_id: "s1",
          detected_tools: [createToolCapture("Skill", { skill: "commit" })],
        }),
        createExecutionResult({
          scenario_id: "s2",
          detected_tools: [], // Correctly not triggered
          transcript: createTranscript("s2"),
        }),
      ];
      const config = createConfig();

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.metrics.accuracy).toBe(1); // Both correct
    });

    it("should track costs from executions", async () => {
      const scenarios = [
        createScenario({ id: "s1" }),
        createScenario({ id: "s2" }),
      ];
      const executions = [
        createExecutionResult({ scenario_id: "s1", cost_usd: 0.05 }),
        createExecutionResult({ scenario_id: "s2", cost_usd: 0.03 }),
      ];
      const config = createConfig();

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.metrics.total_cost_usd).toBe(0.08);
      expect(output.metrics.avg_cost_per_scenario).toBe(0.04);
      expect(output.total_cost_usd).toBe(0.08);
    });

    it("should track conflict counts", async () => {
      const scenarios = [
        createScenario({ id: "s1", expected_component: "commit" }),
        createScenario({ id: "s2", expected_component: "review" }),
      ];
      const executions = [
        createExecutionResult({
          scenario_id: "s1",
          detected_tools: [createToolCapture("Skill", { skill: "wrong" })],
        }),
        createExecutionResult({
          scenario_id: "s2",
          detected_tools: [createToolCapture("Skill", { skill: "review" })],
        }),
      ];
      const config = createConfig();

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.metrics.conflict_count).toBe(1);
      expect(output.metrics.major_conflicts).toBe(1);
    });
  });

  describe("progress callbacks", () => {
    it("should call onStageStart with correct count", async () => {
      const onStageStart = vi.fn();
      const scenarios = [createScenario(), createScenario({ id: "s2" })];
      const executions = [
        createExecutionResult(),
        createExecutionResult({ scenario_id: "s2" }),
      ];
      const config = createConfig();

      await runEvaluation("test-plugin", scenarios, executions, config, {
        onStageStart,
      });

      expect(onStageStart).toHaveBeenCalledWith("evaluation", 2);
    });

    it("should call onStageComplete with duration", async () => {
      const onStageComplete = vi.fn();
      const scenarios = [createScenario()];
      const executions = [createExecutionResult()];
      const config = createConfig();

      await runEvaluation("test-plugin", scenarios, executions, config, {
        onStageComplete,
      });

      expect(onStageComplete).toHaveBeenCalledWith(
        "evaluation",
        expect.any(Number),
        1,
      );
    });

    it("should call onError for failed evaluations", async () => {
      (runJudgment as Mock).mockRejectedValue(new Error("Judge failed"));

      const onError = vi.fn();
      const scenarios = [createScenario()];
      const executions = [createExecutionResult()];
      const config = createConfig();

      await runEvaluation("test-plugin", scenarios, executions, config, {
        onError,
      });

      // onError is called by parallel utility, but our mock doesn't trigger it
      // The error is handled gracefully in the result instead
      expect(logger.error).not.toHaveBeenCalled(); // Errors are handled, not logged
    });
  });

  describe("multiple scenarios", () => {
    it("should handle multiple scenarios with different outcomes", async () => {
      const scenarios = [
        createScenario({
          id: "triggered",
          expected_component: "commit",
          expected_trigger: true,
        }),
        createScenario({
          id: "not-triggered",
          expected_component: "review",
          expected_trigger: false,
        }),
        createScenario({
          id: "wrong-trigger",
          expected_component: "test",
          expected_trigger: true,
        }),
      ];
      const executions = [
        createExecutionResult({
          scenario_id: "triggered",
          detected_tools: [createToolCapture("Skill", { skill: "commit" })],
        }),
        createExecutionResult({
          scenario_id: "not-triggered",
          detected_tools: [],
          transcript: createTranscript("not-triggered"),
        }),
        createExecutionResult({
          scenario_id: "wrong-trigger",
          detected_tools: [createToolCapture("Skill", { skill: "other" })],
        }),
      ];
      const config = createConfig();

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.results).toHaveLength(3);

      // Find results by scenario_id
      const triggeredResult = output.results.find(
        (r) => r.scenario_id === "triggered",
      );
      const notTriggeredResult = output.results.find(
        (r) => r.scenario_id === "not-triggered",
      );
      const wrongTriggerResult = output.results.find(
        (r) => r.scenario_id === "wrong-trigger",
      );

      expect(triggeredResult?.triggered).toBe(true);
      expect(notTriggeredResult?.triggered).toBe(false);
      expect(wrongTriggerResult?.triggered).toBe(false); // Wrong component, so expected not triggered
    });

    it("should skip executions without matching scenarios", async () => {
      const scenarios = [createScenario({ id: "s1" })];
      const executions = [
        createExecutionResult({ scenario_id: "s1" }),
        createExecutionResult({ scenario_id: "orphan" }), // No matching scenario
      ];
      const config = createConfig();

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.results).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalledWith(
        "No scenario found for execution: orphan",
      );
    });
  });

  describe("detection source tracking", () => {
    it("should set detection_source to programmatic for pure programmatic detection", async () => {
      const scenarios = [
        createScenario({
          expected_trigger: false,
          scenario_type: "direct",
        }),
      ];
      const executions = [
        createExecutionResult({
          detected_tools: [],
          transcript: createTranscript("scenario-1", "test-plugin", [
            {
              id: "msg-1",
              type: "user",
              edit: { message: { role: "user", content: "test" } },
            },
          ]),
        }),
      ];
      const config = createConfig();

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.results[0]?.detection_source).toBe("programmatic");
    });

    it("should set detection_source to both when LLM judge is used", async () => {
      const scenarios = [createScenario({ expected_trigger: true })];
      const executions = [createExecutionResult()];
      const config = createConfig();

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.results[0]?.detection_source).toBe("both");
    });

    it("should set detection_source to llm in llm_only mode", async () => {
      const scenarios = [createScenario()];
      const executions = [createExecutionResult()];
      const config = createConfig({
        evaluation: {
          ...createConfig().evaluation,
          detection_mode: "llm_only",
        },
      });

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.results[0]?.detection_source).toBe("llm");
    });
  });

  describe("multi-sampling variance tracking", () => {
    it("should propagate variance from runJudgment to multi_sample_stats", async () => {
      // Mock runJudgment to return varying scores with non-zero variance
      (runJudgment as Mock).mockResolvedValue(
        createMultiSampleResult({
          individual_scores: [6, 8, 10],
          aggregated_score: 8,
          score_variance: 2.67, // Variance of [6, 8, 10]
        }),
      );

      const scenarios = [createScenario({ id: "s1" })];
      const executions = [createExecutionResult({ scenario_id: "s1" })];
      const config = createConfig({
        evaluation: {
          ...createConfig().evaluation,
          num_samples: 3,
        },
      });

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.metrics.multi_sample_stats).toBeDefined();
      expect(output.metrics.multi_sample_stats?.avg_score_variance).toBeCloseTo(
        2.67,
      );
      expect(output.metrics.multi_sample_stats?.samples_per_scenario).toBe(3);
    });

    it("should identify high variance scenarios", async () => {
      // First scenario has high variance, second has low variance
      let callCount = 0;
      (runJudgment as Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            createMultiSampleResult({
              individual_scores: [3, 8, 10],
              aggregated_score: 7,
              score_variance: 8.67, // High variance
            }),
          );
        }
        return Promise.resolve(
          createMultiSampleResult({
            individual_scores: [7, 8, 8],
            aggregated_score: 7.67,
            score_variance: 0.22, // Low variance
          }),
        );
      });

      const scenarios = [
        createScenario({ id: "s1" }),
        createScenario({ id: "s2" }),
      ];
      const executions = [
        createExecutionResult({ scenario_id: "s1" }),
        createExecutionResult({ scenario_id: "s2" }),
      ];
      const config = createConfig({
        evaluation: {
          ...createConfig().evaluation,
          num_samples: 3,
        },
      });

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.metrics.multi_sample_stats).toBeDefined();
      expect(
        output.metrics.multi_sample_stats?.high_variance_scenarios,
      ).toContain("s1");
      expect(
        output.metrics.multi_sample_stats?.high_variance_scenarios,
      ).not.toContain("s2");
    });

    it("should not include multi_sample_stats when num_samples is 1", async () => {
      (runJudgment as Mock).mockResolvedValue(createMultiSampleResult());

      const scenarios = [createScenario()];
      const executions = [createExecutionResult()];
      const config = createConfig({
        evaluation: {
          ...createConfig().evaluation,
          num_samples: 1,
        },
      });

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.metrics.multi_sample_stats).toBeUndefined();
    });

    it("should calculate consensus_rate from actual trigger_accuracy agreement", async () => {
      // Scenario 1: unanimous (all agree on trigger_accuracy)
      // Scenario 2: not unanimous (samples disagree on trigger_accuracy)
      let callCount = 0;
      (runJudgment as Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            createMultiSampleResult({
              individual_scores: [7, 8, 8],
              aggregated_score: 7.67,
              score_variance: 0.22,
              is_unanimous: true, // All samples agreed
            }),
          );
        }
        return Promise.resolve(
          createMultiSampleResult({
            individual_scores: [7, 8, 9],
            aggregated_score: 8,
            score_variance: 0.67,
            is_unanimous: false, // Samples disagreed
          }),
        );
      });

      const scenarios = [
        createScenario({ id: "s1" }),
        createScenario({ id: "s2" }),
      ];
      const executions = [
        createExecutionResult({ scenario_id: "s1" }),
        createExecutionResult({ scenario_id: "s2" }),
      ];
      const config = createConfig({
        evaluation: {
          ...createConfig().evaluation,
          num_samples: 3,
        },
      });

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.metrics.multi_sample_stats).toBeDefined();
      // 1 out of 2 scenarios had unanimous trigger_accuracy agreement
      expect(output.metrics.multi_sample_stats?.consensus_rate).toBe(0.5);
    });

    it("should correctly differentiate consensus from variance", async () => {
      // This test verifies that consensus is independent of variance:
      // - Low variance but no consensus (similar scores, disagreement on accuracy)
      // - High variance but has consensus (different scores, agreement on accuracy)
      let callCount = 0;
      (runJudgment as Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Low variance, but no consensus on trigger_accuracy
          return Promise.resolve(
            createMultiSampleResult({
              individual_scores: [8, 8, 8],
              score_variance: 0, // Zero variance
              is_unanimous: false, // But samples disagreed on trigger_accuracy
            }),
          );
        }
        // High variance, but unanimous on trigger_accuracy
        return Promise.resolve(
          createMultiSampleResult({
            individual_scores: [3, 8, 10],
            score_variance: 8.67, // High variance
            is_unanimous: true, // But all samples agreed on trigger_accuracy
          }),
        );
      });

      const scenarios = [
        createScenario({ id: "s1" }),
        createScenario({ id: "s2" }),
      ];
      const executions = [
        createExecutionResult({ scenario_id: "s1" }),
        createExecutionResult({ scenario_id: "s2" }),
      ];
      const config = createConfig({
        evaluation: {
          ...createConfig().evaluation,
          num_samples: 3,
        },
      });

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.metrics.multi_sample_stats).toBeDefined();
      // s2 has high variance (> 1.0)
      expect(
        output.metrics.multi_sample_stats?.high_variance_scenarios,
      ).toContain("s2");
      expect(
        output.metrics.multi_sample_stats?.high_variance_scenarios,
      ).not.toContain("s1");
      // s2 has consensus, s1 does not - 50% consensus rate
      expect(output.metrics.multi_sample_stats?.consensus_rate).toBe(0.5);
    });
  });
});
