/**
 * Tests for state management module.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AnalysisOutput,
  EvalConfig,
  EvaluationResult,
  ExecutionResult,
  TestScenario,
} from "../../../src/types/index.js";

// Mock the file-io module
vi.mock("../../../src/utils/file-io.js", () => ({
  readJson: vi.fn(),
  writeJson: vi.fn(),
  ensureDir: vi.fn(),
}));

// Mock the logger
vi.mock("../../../src/utils/logging.js", () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  generateRunId,
  getStateFilePath,
  getRunResultsDir,
  createPipelineState,
  saveState,
  loadState,
  updateStateAfterAnalysis,
  updateStateAfterGeneration,
  updateStateAfterExecution,
  updateStateAfterEvaluation,
  updateStateComplete,
  updateStateWithPartialExecutions,
  updateStateWithError,
  canResumeFrom,
  getNextStage,
  getFailedScenarios,
  getIncompleteScenarios,
  formatState,
  type PipelineState,
  type PipelineStage,
} from "../../../src/state/state-manager.js";
import { readJson, writeJson, ensureDir } from "../../../src/utils/file-io.js";

describe("generateRunId", () => {
  it("generates a valid run ID format", () => {
    const runId = generateRunId();
    // Format: YYYYMMDD-HHMMSS-XXXX
    expect(runId).toMatch(/^\d{8}-\d{6}-[a-zA-Z0-9_-]{4}$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateRunId());
    }
    // All IDs should be unique
    expect(ids.size).toBe(100);
  });

  it("includes current date components", () => {
    const now = new Date();
    const runId = generateRunId();
    const datePart = runId.split("-")[0];

    expect(datePart).toBe(
      [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join(""),
    );
  });
});

describe("getStateFilePath", () => {
  it("returns correct path for plugin and run", () => {
    const result = getStateFilePath("my-plugin", "20240101-120000-abcd");
    expect(result).toBe("results/my-plugin/20240101-120000-abcd/state.json");
  });
});

describe("getRunResultsDir", () => {
  it("returns correct path with run ID", () => {
    const result = getRunResultsDir("my-plugin", "20240101-120000-abcd");
    expect(result).toBe("results/my-plugin/20240101-120000-abcd");
  });

  it("returns correct path without run ID", () => {
    const result = getRunResultsDir("my-plugin");
    expect(result).toBe("results/my-plugin");
  });
});

describe("createPipelineState", () => {
  it("creates state with provided options", () => {
    const config = { plugin: { path: "/test" } } as EvalConfig;
    const state = createPipelineState({
      pluginName: "test-plugin",
      config,
      runId: "test-run-123",
    });

    expect(state.run_id).toBe("test-run-123");
    expect(state.plugin_name).toBe("test-plugin");
    expect(state.stage).toBe("pending");
    expect(state.config).toBe(config);
    expect(state.timestamp).toBeDefined();
  });

  it("generates run ID if not provided", () => {
    const config = { plugin: { path: "/test" } } as EvalConfig;
    const state = createPipelineState({
      pluginName: "test-plugin",
      config,
    });

    expect(state.run_id).toMatch(/^\d{8}-\d{6}-[a-zA-Z0-9_-]{4}$/);
  });
});

describe("saveState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves state to correct path", () => {
    const state: PipelineState = {
      run_id: "test-run-123",
      plugin_name: "test-plugin",
      stage: "analysis",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const result = saveState(state);

    expect(ensureDir).toHaveBeenCalledWith("results/test-plugin/test-run-123");
    expect(writeJson).toHaveBeenCalled();
    expect(result).toBe("results/test-plugin/test-run-123/state.json");
  });

  it("updates timestamp when saving", () => {
    const state: PipelineState = {
      run_id: "test-run-123",
      plugin_name: "test-plugin",
      stage: "pending",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    saveState(state);

    const savedState = (writeJson as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(savedState.timestamp).not.toBe("2024-01-01T00:00:00.000Z");
  });
});

describe("loadState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads state from correct path", () => {
    const mockState: PipelineState = {
      run_id: "test-run-123",
      plugin_name: "test-plugin",
      stage: "analysis",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    vi.mocked(readJson).mockReturnValue(mockState);

    const result = loadState("test-plugin", "test-run-123");

    expect(readJson).toHaveBeenCalledWith(
      "results/test-plugin/test-run-123/state.json",
    );
    expect(result).toEqual(mockState);
  });

  it("returns null when state not found", () => {
    vi.mocked(readJson).mockImplementation(() => {
      throw new Error("File not found");
    });

    const result = loadState("test-plugin", "nonexistent-run");

    expect(result).toBeNull();
  });
});

describe("updateStateAfterAnalysis", () => {
  it("updates state with analysis output", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "pending",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const analysis: AnalysisOutput = {
      plugin_name: "test-plugin",
      plugin_path: "/test",
      components: {
        skills: [],
        agents: [],
        commands: [],
      },
    };

    const result = updateStateAfterAnalysis(state, analysis);

    expect(result.stage).toBe("analysis");
    expect(result.analysis).toBe(analysis);
    expect(writeJson).toHaveBeenCalled();
  });
});

describe("updateStateAfterGeneration", () => {
  it("updates state with scenarios", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "analysis",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const scenarios: TestScenario[] = [
      {
        id: "scenario-1",
        prompt: "test prompt",
        expected_component: "skill-a",
        component_type: "skill",
        scenario_type: "direct",
        expected_trigger: true,
      },
    ];

    const result = updateStateAfterGeneration(state, scenarios);

    expect(result.stage).toBe("generation");
    expect(result.scenarios).toBe(scenarios);
  });
});

describe("updateStateAfterExecution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates state with executions", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "generation",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const executions: ExecutionResult[] = [
      {
        scenario_id: "scenario-1",
        transcript: { metadata: { version: "v3.0" }, events: [] },
        detected_tools: [],
        cost_usd: 0.01,
        api_duration_ms: 100,
        num_turns: 1,
        permission_denials: 0,
        errors: [],
      },
    ];

    const result = updateStateAfterExecution(state, executions);

    expect(result.stage).toBe("execution");
    expect(result.executions).toBe(executions);
    expect(result.failed_scenario_ids).toBeUndefined();
  });

  it("tracks failed scenario IDs", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "generation",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const executions: ExecutionResult[] = [
      {
        scenario_id: "scenario-1",
        transcript: { metadata: { version: "v3.0" }, events: [] },
        detected_tools: [],
        cost_usd: 0.01,
        api_duration_ms: 100,
        num_turns: 1,
        permission_denials: 0,
        errors: ["Error occurred"],
      },
      {
        scenario_id: "scenario-2",
        transcript: { metadata: { version: "v3.0" }, events: [] },
        detected_tools: [],
        cost_usd: 0.01,
        api_duration_ms: 100,
        num_turns: 1,
        permission_denials: 0,
        errors: [],
      },
    ];

    const result = updateStateAfterExecution(state, executions);

    expect(result.failed_scenario_ids).toEqual(["scenario-1"]);
  });
});

describe("updateStateAfterEvaluation", () => {
  it("updates state with evaluations", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "execution",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const evaluations: EvaluationResult[] = [
      {
        scenario_id: "scenario-1",
        triggered: true,
        confidence: 100,
        quality_score: 8,
        evidence: [],
        issues: [],
        summary: "Test",
        detection_source: "programmatic",
        all_triggered_components: [],
        has_conflict: false,
        conflict_severity: "none",
      },
    ];

    const result = updateStateAfterEvaluation(state, evaluations);

    expect(result.stage).toBe("evaluation");
    expect(result.evaluations).toBe(evaluations);
  });
});

describe("updateStateComplete", () => {
  it("marks state as complete", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "evaluation",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const result = updateStateComplete(state);

    expect(result.stage).toBe("complete");
  });
});

describe("updateStateWithPartialExecutions", () => {
  it("saves partial execution results", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "generation",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const partials: ExecutionResult[] = [
      {
        scenario_id: "scenario-1",
        transcript: { metadata: { version: "v3.0" }, events: [] },
        detected_tools: [],
        cost_usd: 0.01,
        api_duration_ms: 100,
        num_turns: 1,
        permission_denials: 0,
        errors: [],
      },
    ];

    const result = updateStateWithPartialExecutions(state, partials);

    expect(result.partial_executions).toBe(partials);
  });
});

describe("updateStateWithError", () => {
  it("saves error message", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "execution",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const result = updateStateWithError(state, "Something went wrong");

    expect(result.error).toBe("Something went wrong");
  });
});

describe("canResumeFrom", () => {
  const baseState: PipelineState = {
    run_id: "test-run",
    plugin_name: "test-plugin",
    stage: "complete",
    timestamp: "2024-01-01T00:00:00.000Z",
    config: { plugin: { path: "/test" } } as EvalConfig,
    analysis: {
      plugin_name: "test-plugin",
      plugin_path: "/test",
      components: { skills: [], agents: [], commands: [] },
    },
    scenarios: [],
    executions: [],
    evaluations: [],
  };

  it("returns true for pending stage", () => {
    expect(canResumeFrom(baseState, "pending")).toBe(true);
  });

  it("returns true for analysis stage", () => {
    expect(canResumeFrom(baseState, "analysis")).toBe(true);
  });

  it("returns true for generation if analysis exists", () => {
    expect(canResumeFrom(baseState, "generation")).toBe(true);
  });

  it("returns false for generation if no analysis", () => {
    const state = { ...baseState, analysis: undefined };
    expect(canResumeFrom(state, "generation")).toBe(false);
  });

  it("returns true for execution if analysis and scenarios exist", () => {
    expect(canResumeFrom(baseState, "execution")).toBe(true);
  });

  it("returns false for execution if no scenarios", () => {
    const state = { ...baseState, scenarios: undefined };
    expect(canResumeFrom(state, "execution")).toBe(false);
  });

  it("returns true for evaluation if all data exists", () => {
    expect(canResumeFrom(baseState, "evaluation")).toBe(true);
  });

  it("returns false for evaluation if no executions", () => {
    const state = { ...baseState, executions: undefined };
    expect(canResumeFrom(state, "evaluation")).toBe(false);
  });

  it("returns true for complete only if already complete", () => {
    expect(canResumeFrom(baseState, "complete")).toBe(true);
    expect(
      canResumeFrom({ ...baseState, stage: "execution" }, "complete"),
    ).toBe(false);
  });
});

describe("getNextStage", () => {
  it("returns analysis after pending", () => {
    expect(getNextStage("pending")).toBe("analysis");
  });

  it("returns generation after analysis", () => {
    expect(getNextStage("analysis")).toBe("generation");
  });

  it("returns execution after generation", () => {
    expect(getNextStage("generation")).toBe("execution");
  });

  it("returns evaluation after execution", () => {
    expect(getNextStage("execution")).toBe("evaluation");
  });

  it("returns complete after evaluation", () => {
    expect(getNextStage("evaluation")).toBe("complete");
  });

  it("returns null after complete", () => {
    expect(getNextStage("complete")).toBeNull();
  });
});

describe("getFailedScenarios", () => {
  it("returns failed scenarios from state", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "execution",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
      failed_scenario_ids: ["scenario-1", "scenario-3"],
    };

    const allScenarios: TestScenario[] = [
      {
        id: "scenario-1",
        prompt: "test",
        expected_component: "a",
        component_type: "skill",
        scenario_type: "direct",
        expected_trigger: true,
      },
      {
        id: "scenario-2",
        prompt: "test",
        expected_component: "b",
        component_type: "skill",
        scenario_type: "direct",
        expected_trigger: true,
      },
      {
        id: "scenario-3",
        prompt: "test",
        expected_component: "c",
        component_type: "skill",
        scenario_type: "direct",
        expected_trigger: true,
      },
    ];

    const result = getFailedScenarios(state, allScenarios);

    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toEqual(["scenario-1", "scenario-3"]);
  });

  it("returns empty array if no failed scenarios", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "execution",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const allScenarios: TestScenario[] = [
      {
        id: "scenario-1",
        prompt: "test",
        expected_component: "a",
        component_type: "skill",
        scenario_type: "direct",
        expected_trigger: true,
      },
    ];

    expect(getFailedScenarios(state, allScenarios)).toEqual([]);
  });
});

describe("getIncompleteScenarios", () => {
  it("returns scenarios not in executions", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "execution",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
      executions: [
        {
          scenario_id: "scenario-1",
          transcript: { metadata: { version: "v3.0" }, events: [] },
          detected_tools: [],
          cost_usd: 0,
          api_duration_ms: 0,
          num_turns: 0,
          permission_denials: 0,
          errors: [],
        },
      ],
    };

    const allScenarios: TestScenario[] = [
      {
        id: "scenario-1",
        prompt: "test",
        expected_component: "a",
        component_type: "skill",
        scenario_type: "direct",
        expected_trigger: true,
      },
      {
        id: "scenario-2",
        prompt: "test",
        expected_component: "b",
        component_type: "skill",
        scenario_type: "direct",
        expected_trigger: true,
      },
    ];

    const result = getIncompleteScenarios(state, allScenarios);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("scenario-2");
  });

  it("includes partial executions in completed set", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "execution",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
      partial_executions: [
        {
          scenario_id: "scenario-1",
          transcript: { metadata: { version: "v3.0" }, events: [] },
          detected_tools: [],
          cost_usd: 0,
          api_duration_ms: 0,
          num_turns: 0,
          permission_denials: 0,
          errors: [],
        },
      ],
    };

    const allScenarios: TestScenario[] = [
      {
        id: "scenario-1",
        prompt: "test",
        expected_component: "a",
        component_type: "skill",
        scenario_type: "direct",
        expected_trigger: true,
      },
      {
        id: "scenario-2",
        prompt: "test",
        expected_component: "b",
        component_type: "skill",
        scenario_type: "direct",
        expected_trigger: true,
      },
    ];

    const result = getIncompleteScenarios(state, allScenarios);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("scenario-2");
  });
});

describe("formatState", () => {
  it("formats basic state information", () => {
    const state: PipelineState = {
      run_id: "test-run-123",
      plugin_name: "test-plugin",
      stage: "analysis",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const result = formatState(state);

    expect(result).toContain("Run ID: test-run-123");
    expect(result).toContain("Plugin: test-plugin");
    expect(result).toContain("Stage: analysis");
    expect(result).toContain("Last Updated: 2024-01-01T00:00:00.000Z");
  });

  it("includes component count when analysis exists", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "analysis",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
      analysis: {
        plugin_name: "test-plugin",
        plugin_path: "/test",
        components: {
          skills: [{ name: "s1" } as never, { name: "s2" } as never],
          agents: [{ name: "a1" } as never],
          commands: [],
        },
      },
    };

    const result = formatState(state);

    expect(result).toContain("Components: 3");
  });

  it("includes scenario count when scenarios exist", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "generation",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
      scenarios: [{ id: "s1" } as TestScenario, { id: "s2" } as TestScenario],
    };

    const result = formatState(state);

    expect(result).toContain("Scenarios: 2");
  });

  it("includes execution stats when executions exist", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "execution",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
      executions: [
        { scenario_id: "s1", errors: [] } as ExecutionResult,
        { scenario_id: "s2", errors: ["error"] } as ExecutionResult,
      ],
    };

    const result = formatState(state);

    expect(result).toContain("Executions: 1/2 passed");
  });

  it("includes evaluation stats when evaluations exist", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "evaluation",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
      evaluations: [
        { scenario_id: "s1", triggered: true } as EvaluationResult,
        { scenario_id: "s2", triggered: false } as EvaluationResult,
      ],
    };

    const result = formatState(state);

    expect(result).toContain("Evaluations: 1/2 triggered");
  });

  it("includes failed scenario count", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "execution",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
      failed_scenario_ids: ["s1", "s2", "s3"],
    };

    const result = formatState(state);

    expect(result).toContain("Failed Scenarios: 3");
  });

  it("includes error message", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "execution",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
      error: "Pipeline failed due to timeout",
    };

    const result = formatState(state);

    expect(result).toContain("Error: Pipeline failed due to timeout");
  });
});
