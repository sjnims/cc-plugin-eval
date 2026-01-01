/**
 * Integration tests for Stage 4: Evaluation
 *
 * Tests the full runEvaluation() pipeline with real fixtures.
 * LLM judge calls are mocked to avoid actual API costs.
 */

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { runEvaluation } from "../../../../src/stages/4-evaluation/index.js";
import {
  detectAllComponents,
  detectFromCaptures,
  detectFromTranscript,
  getUniqueDetections,
  wasExpectedComponentTriggered,
} from "../../../../src/stages/4-evaluation/programmatic-detector.js";
import {
  calculateConflictSeverity,
  countConflicts,
  getConflictSummary,
} from "../../../../src/stages/4-evaluation/conflict-tracker.js";
import {
  calculateEvalMetrics,
  calculateAccuracy,
  calculateTriggerRate,
  formatMetrics,
} from "../../../../src/stages/4-evaluation/metrics.js";
import type {
  EvalConfig,
  ExecutionResult,
  TestScenario,
  Transcript,
  ToolCapture,
} from "../../../../src/types/index.js";

const fixturesPath = path.resolve(process.cwd(), "tests/fixtures");
const transcriptsPath = path.join(fixturesPath, "sample-transcripts");

/**
 * Load a transcript fixture.
 */
function loadTranscript(filename: string): Transcript {
  const filePath = path.join(transcriptsPath, filename);
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as Transcript;
}

/**
 * Create a test scenario.
 */
function createScenario(overrides: Partial<TestScenario> = {}): TestScenario {
  return {
    id: "test-scenario-1",
    component_ref: "test-skill",
    component_type: "skill",
    scenario_type: "direct",
    user_prompt: "Help me test my function",
    expected_trigger: true,
    expected_component: "test-skill",
    ...overrides,
  };
}

/**
 * Create an execution result from a transcript.
 */
function createExecutionResult(
  transcript: Transcript,
  toolCaptures: ToolCapture[] = [],
  overrides: Partial<ExecutionResult> = {},
): ExecutionResult {
  return {
    scenario_id: transcript.metadata.scenario_id,
    transcript,
    detected_tools: toolCaptures,
    cost_usd: 0.01,
    api_duration_ms: 1000,
    num_turns: transcript.events.length,
    permission_denials: [],
    errors: [],
    ...overrides,
  };
}

/**
 * Create a minimal EvalConfig for testing.
 */
function createTestConfig(): EvalConfig {
  return {
    plugin: { path: path.join(fixturesPath, "valid-plugin") },
    scope: {
      skills: true,
      agents: true,
      commands: true,
      hooks: false,
      mcp_servers: false,
    },
    generation: {
      model: "claude-sonnet-4-5-20250929",
      scenarios_per_component: 2,
      diversity: 0.5,
      max_tokens: 4000,
      reasoning_effort: "low",
      semantic_variations: false,
    },
    execution: {
      model: "claude-sonnet-4-20250514",
      max_turns: 3,
      timeout_ms: 30000,
      max_budget_usd: 1.0,
      session_isolation: true,
      permission_bypass: true,
      num_reps: 1,
      additional_plugins: [],
    },
    evaluation: {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      detection_mode: "programmatic_first",
      reasoning_effort: "low",
      num_samples: 1,
      aggregate_method: "average",
      include_citations: false,
    },
    output: {
      format: "json",
      include_cli_summary: true,
      junit_test_suite_name: "test-plugin-eval",
    },
    dry_run: false,
    estimate_costs: false,
    batch_threshold: 50,
    force_synchronous: true,
    poll_interval_ms: 30000,
    rewind_file_changes: false,
    debug: false,
    verbose: false,
    max_concurrent: 5,
  };
}

describe("Stage 4: Evaluation Integration", () => {
  describe("Programmatic Detection with Real Transcripts", () => {
    it("detects skill trigger from transcript fixture", () => {
      const transcript = loadTranscript("skill-triggered.json");
      const scenario = createScenario({
        id: transcript.metadata.scenario_id,
        expected_component: "test-skill",
        component_type: "skill",
      });

      const detections = detectAllComponents([], transcript, scenario);

      expect(detections).toHaveLength(1);
      expect(detections[0]).toMatchObject({
        component_type: "skill",
        component_name: "test-skill",
        confidence: 100,
        tool_name: "Skill",
      });
    });

    it("detects agent trigger from transcript fixture", () => {
      const transcript = loadTranscript("agent-triggered.json");
      const scenario = createScenario({
        id: transcript.metadata.scenario_id,
        expected_component: "test-agent",
        component_type: "agent",
      });

      const detections = detectAllComponents([], transcript, scenario);

      expect(detections).toHaveLength(1);
      expect(detections[0]).toMatchObject({
        component_type: "agent",
        component_name: "test-agent",
        confidence: 100,
        tool_name: "Task",
      });
    });

    it("detects no triggers for negative scenario", () => {
      const transcript = loadTranscript("skill-not-triggered.json");
      const scenario = createScenario({
        id: transcript.metadata.scenario_id,
        expected_component: "test-skill",
        expected_trigger: false,
      });

      const detections = detectAllComponents([], transcript, scenario);

      expect(detections).toHaveLength(0);
    });

    it("detects multiple component triggers (conflict scenario)", () => {
      const transcript = loadTranscript("multiple-components-triggered.json");
      const scenario = createScenario({
        id: transcript.metadata.scenario_id,
        expected_component: "skill-development",
        component_type: "skill",
      });

      const detections = detectAllComponents([], transcript, scenario);
      const unique = getUniqueDetections(detections);

      expect(unique).toHaveLength(2);
      expect(unique.map((d) => d.component_name)).toContain(
        "skill-development",
      );
      expect(unique.map((d) => d.component_name)).toContain(
        "command-development",
      );
    });

    it("correctly identifies expected component trigger status", () => {
      const skillTranscript = loadTranscript("skill-triggered.json");
      const skillDetections = detectFromTranscript(skillTranscript);

      expect(
        wasExpectedComponentTriggered(skillDetections, "test-skill", "skill"),
      ).toBe(true);
      expect(
        wasExpectedComponentTriggered(skillDetections, "wrong-skill", "skill"),
      ).toBe(false);
      expect(
        wasExpectedComponentTriggered(skillDetections, "test-skill", "agent"),
      ).toBe(false);
    });

    it("prioritizes tool captures over transcript parsing", () => {
      const transcript = loadTranscript("skill-triggered.json");
      const scenario = createScenario({
        expected_component: "captured-skill",
        component_type: "skill",
      });

      // Create a capture that should take precedence
      const captures: ToolCapture[] = [
        {
          name: "Skill",
          input: { skill: "captured-skill" },
          toolUseId: "capture-1",
          timestamp: Date.now(),
        },
      ];

      const detections = detectAllComponents(captures, transcript, scenario);

      // Should only include the captured skill, not parse transcript
      expect(detections).toHaveLength(1);
      expect(detections[0]?.component_name).toBe("captured-skill");
    });
  });

  describe("Conflict Detection with Real Transcripts", () => {
    it("detects minor conflict for related same-type components", () => {
      const transcript = loadTranscript("multiple-components-triggered.json");
      const detections = detectFromTranscript(transcript);

      const analysis = calculateConflictSeverity(
        "skill-development",
        "skill",
        detections,
      );

      expect(analysis.has_conflict).toBe(true);
      expect(analysis.conflict_severity).toBe("minor");
      expect(analysis.conflict_reason).toContain("Related components");
      expect(analysis.all_triggered_components).toHaveLength(2);
    });

    it("detects no conflict for single correct trigger", () => {
      const transcript = loadTranscript("skill-triggered.json");
      const detections = detectFromTranscript(transcript);

      const analysis = calculateConflictSeverity(
        "test-skill",
        "skill",
        detections,
      );

      expect(analysis.has_conflict).toBe(false);
      expect(analysis.conflict_severity).toBe("none");
    });

    it("detects major conflict when expected component missing", () => {
      const transcript = loadTranscript("skill-triggered.json");
      const detections = detectFromTranscript(transcript);

      // Expected 'wrong-skill' but 'test-skill' triggered
      const analysis = calculateConflictSeverity(
        "wrong-skill",
        "skill",
        detections,
      );

      expect(analysis.has_conflict).toBe(true);
      expect(analysis.conflict_severity).toBe("major");
      expect(analysis.conflict_reason).toContain("did not trigger");
    });

    it("provides accurate conflict summary", () => {
      const transcript = loadTranscript("multiple-components-triggered.json");
      const detections = detectFromTranscript(transcript);

      const analyses = [
        calculateConflictSeverity("skill-development", "skill", detections),
        calculateConflictSeverity("test-skill", "skill", []), // no triggers
      ];

      const counts = countConflicts(analyses);
      expect(counts.minor).toBe(1);
      expect(counts.none).toBe(1);
      expect(counts.total).toBe(1);

      const summary = getConflictSummary(analyses);
      expect(summary).toContain("1 conflict");
      expect(summary).toContain("1 minor");
    });
  });

  describe("Metrics Calculation with Real Data", () => {
    it("calculates trigger rate across mixed results", () => {
      const skillTranscript = loadTranscript("skill-triggered.json");
      const negativeTranscript = loadTranscript("skill-not-triggered.json");

      const skillDetections = detectFromTranscript(skillTranscript);
      const negativeDetections = detectFromTranscript(negativeTranscript);

      const results = [
        {
          result: {
            scenario_id: "skill-test-1",
            triggered: wasExpectedComponentTriggered(
              skillDetections,
              "test-skill",
              "skill",
            ),
            confidence: 100,
            quality_score: 8,
            evidence: [],
            issues: [],
            summary: "test",
            detection_source: "programmatic" as const,
            all_triggered_components: [],
            has_conflict: false,
            conflict_severity: "none" as const,
          },
          scenario: createScenario({ expected_trigger: true }),
          execution: createExecutionResult(skillTranscript),
        },
        {
          result: {
            scenario_id: "skill-negative-1",
            triggered: wasExpectedComponentTriggered(
              negativeDetections,
              "test-skill",
              "skill",
            ),
            confidence: 0,
            quality_score: null,
            evidence: [],
            issues: [],
            summary: "test",
            detection_source: "programmatic" as const,
            all_triggered_components: [],
            has_conflict: false,
            conflict_severity: "none" as const,
          },
          scenario: createScenario({ expected_trigger: false }),
          execution: createExecutionResult(negativeTranscript),
        },
      ];

      const evalResults = results.map((r) => r.result);
      const triggerRate = calculateTriggerRate(evalResults);
      const accuracy = calculateAccuracy(results);

      expect(triggerRate).toBe(0.5); // 1 of 2 triggered
      expect(accuracy).toBe(1); // Both correct (trigger when expected, no trigger when not expected)
    });

    it("calculates comprehensive metrics from execution results", () => {
      const skillTranscript = loadTranscript("skill-triggered.json");
      const agentTranscript = loadTranscript("agent-triggered.json");

      const results = [
        {
          result: {
            scenario_id: "skill-test-1",
            triggered: true,
            confidence: 100,
            quality_score: 8,
            evidence: ["Skill tool invoked"],
            issues: [],
            summary: "Skill triggered correctly",
            detection_source: "programmatic" as const,
            all_triggered_components: [
              {
                component_type: "skill",
                component_name: "test-skill",
                confidence: 100,
              },
            ],
            has_conflict: false,
            conflict_severity: "none" as const,
          },
          scenario: createScenario({
            id: "skill-test-1",
            expected_trigger: true,
            expected_component: "test-skill",
          }),
          execution: createExecutionResult(skillTranscript, [], {
            cost_usd: 0.01,
            api_duration_ms: 1000,
          }),
        },
        {
          result: {
            scenario_id: "agent-test-1",
            triggered: true,
            confidence: 100,
            quality_score: 9,
            evidence: ["Task tool invoked"],
            issues: [],
            summary: "Agent triggered correctly",
            detection_source: "programmatic" as const,
            all_triggered_components: [
              {
                component_type: "agent",
                component_name: "test-agent",
                confidence: 100,
              },
            ],
            has_conflict: false,
            conflict_severity: "none" as const,
          },
          scenario: createScenario({
            id: "agent-test-1",
            expected_trigger: true,
            expected_component: "test-agent",
            component_type: "agent",
          }),
          execution: createExecutionResult(agentTranscript, [], {
            cost_usd: 0.02,
            api_duration_ms: 1500,
          }),
        },
      ];

      const executions = results.map((r) => r.execution);
      const metrics = calculateEvalMetrics(results, executions);

      expect(metrics.total_scenarios).toBe(2);
      expect(metrics.triggered_count).toBe(2);
      expect(metrics.trigger_rate).toBe(1);
      expect(metrics.accuracy).toBe(1);
      expect(metrics.avg_quality).toBe(8.5);
      expect(metrics.conflict_count).toBe(0);
      expect(metrics.total_cost_usd).toBe(0.03);
      expect(metrics.total_api_duration_ms).toBe(2500);
      expect(metrics.error_count).toBe(0);
    });

    it("formats metrics as human-readable string", () => {
      const skillTranscript = loadTranscript("skill-triggered.json");

      const results = [
        {
          result: {
            scenario_id: "skill-test-1",
            triggered: true,
            confidence: 100,
            quality_score: 8,
            evidence: [],
            issues: [],
            summary: "test",
            detection_source: "programmatic" as const,
            all_triggered_components: [],
            has_conflict: false,
            conflict_severity: "none" as const,
          },
          scenario: createScenario({ expected_trigger: true }),
          execution: createExecutionResult(skillTranscript),
        },
      ];

      const metrics = calculateEvalMetrics(
        results,
        results.map((r) => r.execution),
      );
      const formatted = formatMetrics(metrics);

      expect(formatted).toContain("Evaluation Metrics:");
      expect(formatted).toContain("Total Scenarios:    1");
      expect(formatted).toContain("Triggered:          1");
      expect(formatted).toContain("100.0%");
      expect(formatted).toContain("Accuracy:");
      expect(formatted).toContain("Avg Quality:");
    });
  });

  describe("Full Evaluation Pipeline (Mocked LLM)", () => {
    // Mock Anthropic client for LLM judge calls
    beforeEach(() => {
      vi.mock("@anthropic-ai/sdk", () => ({
        default: vi.fn().mockImplementation(() => ({
          messages: {
            create: vi.fn().mockResolvedValue({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    quality_score: 8,
                    response_relevance: 9,
                    trigger_accuracy: "correct",
                    issues: [],
                    summary:
                      "Component triggered correctly and responded appropriately.",
                  }),
                },
              ],
            }),
          },
        })),
      }));
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("handles empty execution results gracefully", async () => {
      const config = createTestConfig();
      const output = await runEvaluation("test-plugin", [], [], config);

      expect(output.plugin_name).toBe("test-plugin");
      expect(output.results).toHaveLength(0);
      expect(output.metrics.total_scenarios).toBe(0);
      expect(output.metrics.accuracy).toBe(0);
      expect(output.total_cost_usd).toBe(0);
    });

    it("processes scenarios with programmatic detection only", async () => {
      const skillTranscript = loadTranscript("skill-triggered.json");
      const negativeTranscript = loadTranscript("skill-not-triggered.json");

      const scenarios: TestScenario[] = [
        createScenario({
          id: skillTranscript.metadata.scenario_id,
          expected_component: "test-skill",
          expected_trigger: true,
          user_prompt: "Help me test my function",
        }),
        createScenario({
          id: negativeTranscript.metadata.scenario_id,
          expected_component: "test-skill",
          expected_trigger: false,
          user_prompt: "What is the weather like today?",
        }),
      ];

      const executions: ExecutionResult[] = [
        createExecutionResult(skillTranscript, [
          {
            name: "Skill",
            input: { skill: "test-skill" },
            toolUseId: "tc-1",
            timestamp: Date.now(),
          },
        ]),
        createExecutionResult(negativeTranscript),
      ];

      const config = createTestConfig();
      // Use programmatic detection only (skip LLM for true negatives)
      config.evaluation.detection_mode = "programmatic_first";

      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      expect(output.plugin_name).toBe("test-plugin");
      expect(output.results).toHaveLength(2);

      // Verify first scenario (should trigger)
      const triggeredResult = output.results.find(
        (r) => r.scenario_id === skillTranscript.metadata.scenario_id,
      );
      expect(triggeredResult?.triggered).toBe(true);
      expect(triggeredResult?.confidence).toBe(100);

      // Verify second scenario (should not trigger)
      const negativeResult = output.results.find(
        (r) => r.scenario_id === negativeTranscript.metadata.scenario_id,
      );
      expect(negativeResult?.triggered).toBe(false);

      // Verify metrics
      expect(output.metrics.total_scenarios).toBe(2);
      expect(output.metrics.triggered_count).toBe(1);
      expect(output.metrics.accuracy).toBe(1); // Both correct
    });

    it("detects conflicts across multiple component triggers", async () => {
      const conflictTranscript = loadTranscript(
        "multiple-components-triggered.json",
      );

      const scenarios: TestScenario[] = [
        createScenario({
          id: conflictTranscript.metadata.scenario_id,
          expected_component: "skill-development",
          expected_trigger: true,
        }),
      ];

      const executions: ExecutionResult[] = [
        createExecutionResult(conflictTranscript, [
          {
            name: "Skill",
            input: { skill: "skill-development" },
            toolUseId: "tc-1",
            timestamp: Date.now(),
          },
          {
            name: "Skill",
            input: { skill: "command-development" },
            toolUseId: "tc-2",
            timestamp: Date.now() + 1,
          },
        ]),
      ];

      const config = createTestConfig();
      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      const result = output.results[0];
      expect(result?.triggered).toBe(true);
      expect(result?.has_conflict).toBe(true);
      expect(result?.conflict_severity).toBe("minor"); // Same type, related domain
      expect(result?.all_triggered_components).toHaveLength(2);

      expect(output.metrics.conflict_count).toBe(1);
      expect(output.metrics.minor_conflicts).toBe(1);
    });

    it("tracks progress via callbacks", async () => {
      const skillTranscript = loadTranscript("skill-triggered.json");

      const scenarios: TestScenario[] = [
        createScenario({
          id: skillTranscript.metadata.scenario_id,
          expected_component: "test-skill",
          expected_trigger: true,
        }),
      ];

      const executions: ExecutionResult[] = [
        createExecutionResult(skillTranscript, [
          {
            name: "Skill",
            input: { skill: "test-skill" },
            toolUseId: "tc-1",
            timestamp: Date.now(),
          },
        ]),
      ];

      const config = createTestConfig();
      const progress = {
        onStageStart: vi.fn(),
        onStageComplete: vi.fn(),
        onError: vi.fn(),
      };

      await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
        progress,
      );

      expect(progress.onStageStart).toHaveBeenCalledWith("evaluation", 1);
      expect(progress.onStageComplete).toHaveBeenCalledWith(
        "evaluation",
        expect.any(Number),
        1,
      );
      expect(progress.onError).not.toHaveBeenCalled();
    });

    it("handles missing scenario gracefully", async () => {
      const skillTranscript = loadTranscript("skill-triggered.json");

      // Empty scenarios array - no matching scenario for execution
      const scenarios: TestScenario[] = [];

      const executions: ExecutionResult[] = [
        createExecutionResult(skillTranscript, [
          {
            name: "Skill",
            input: { skill: "test-skill" },
            toolUseId: "tc-1",
            timestamp: Date.now(),
          },
        ]),
      ];

      const config = createTestConfig();
      const output = await runEvaluation(
        "test-plugin",
        scenarios,
        executions,
        config,
      );

      // Should produce no results since scenario not found
      expect(output.results).toHaveLength(0);
    });
  });

  describe("Direct Command Detection", () => {
    it("detects /command syntax in user message", () => {
      const commandTranscript = loadTranscript("command-triggered.json");
      const scenario = createScenario({
        id: commandTranscript.metadata.scenario_id,
        expected_component: "test-command",
        component_type: "command",
      });

      const detections = detectAllComponents([], commandTranscript, scenario);

      // Should detect via direct command syntax detection
      expect(detections.length).toBeGreaterThanOrEqual(1);
      const commandDetection = detections.find(
        (d) => d.component_type === "command",
      );
      expect(commandDetection).toBeDefined();
      expect(commandDetection?.component_name).toBe("test-command");
    });
  });

  describe("Edge Cases", () => {
    it("handles transcript with no events", () => {
      const emptyTranscript: Transcript = {
        metadata: {
          version: "v3.0",
          plugin_name: "test-plugin",
          scenario_id: "empty-test",
          timestamp: new Date().toISOString(),
          model: "claude-sonnet-4-20250514",
        },
        events: [],
      };

      const scenario = createScenario({ expected_trigger: false });
      const detections = detectAllComponents([], emptyTranscript, scenario);

      expect(detections).toHaveLength(0);
    });

    it("handles transcript with only user event", () => {
      const userOnlyTranscript: Transcript = {
        metadata: {
          version: "v3.0",
          plugin_name: "test-plugin",
          scenario_id: "user-only-test",
          timestamp: new Date().toISOString(),
          model: "claude-sonnet-4-20250514",
        },
        events: [
          {
            id: "evt-1",
            type: "user",
            edit: { message: { role: "user", content: "Hello" } },
          },
        ],
      };

      const scenario = createScenario({ expected_trigger: false });
      const detections = detectAllComponents([], userOnlyTranscript, scenario);

      expect(detections).toHaveLength(0);
    });

    it("handles tool captures with invalid input", () => {
      const captures: ToolCapture[] = [
        {
          name: "Skill",
          input: { wrong_field: "value" }, // Missing 'skill' field
          toolUseId: "tc-1",
          timestamp: Date.now(),
        },
        {
          name: "Task",
          input: "not an object", // Invalid input type
          toolUseId: "tc-2",
          timestamp: Date.now(),
        },
      ];

      const detections = detectFromCaptures(captures);

      expect(detections).toHaveLength(0);
    });

    it("deduplicates same component triggered multiple times", () => {
      const captures: ToolCapture[] = [
        {
          name: "Skill",
          input: { skill: "test-skill" },
          toolUseId: "tc-1",
          timestamp: Date.now(),
        },
        {
          name: "Skill",
          input: { skill: "test-skill" },
          toolUseId: "tc-2",
          timestamp: Date.now() + 100,
        },
      ];

      const detections = detectFromCaptures(captures);
      const unique = getUniqueDetections(detections);

      expect(detections).toHaveLength(2);
      expect(unique).toHaveLength(1);
      expect(unique[0]?.component_name).toBe("test-skill");
    });
  });
});
