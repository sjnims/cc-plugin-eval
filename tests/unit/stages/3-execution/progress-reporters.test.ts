/**
 * Tests for progress reporters.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ExecutionResult,
  TestScenario,
} from "../../../../src/types/index.js";

import {
  consoleProgress,
  verboseProgress,
  silentProgress,
  jsonProgress,
  createProgressReporter,
  createStreamingReporter,
} from "../../../../src/stages/3-execution/progress-reporters.js";

describe("consoleProgress", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs stage start", () => {
    consoleProgress.onStageStart!("execution", 10);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("="));
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("STAGE: EXECUTION (10 items)"),
    );
  });

  it("writes scenario progress to stdout", () => {
    const result: ExecutionResult = {
      scenario_id: "test-scenario-1",
      transcript: { metadata: { version: "v3.0" }, events: [] },
      detected_tools: [],
      cost_usd: 0.01,
      api_duration_ms: 100,
      num_turns: 1,
      permission_denials: 0,
      errors: [],
    };

    consoleProgress.onScenarioComplete!(result, 5, 10);

    expect(process.stdout.write).toHaveBeenCalledWith(
      expect.stringContaining("5/10 (50%)"),
    );
    expect(process.stdout.write).toHaveBeenCalledWith(
      expect.stringContaining("test-scenario-1"),
    );
  });

  it("shows error icon for failed scenarios", () => {
    const result: ExecutionResult = {
      scenario_id: "test-scenario-1",
      transcript: { metadata: { version: "v3.0" }, events: [] },
      detected_tools: [],
      cost_usd: 0.01,
      api_duration_ms: 100,
      num_turns: 1,
      permission_denials: 0,
      errors: ["Some error"],
    };

    consoleProgress.onScenarioComplete!(result, 1, 10);

    expect(process.stdout.write).toHaveBeenCalledWith(
      expect.stringContaining("❌"),
    );
  });

  it("logs stage completion", () => {
    consoleProgress.onStageComplete!("execution", 5000, 10);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("execution complete: 10 items in 5.0s"),
    );
  });

  it("logs errors with scenario info", () => {
    const scenario: TestScenario = {
      id: "test-scenario",
      prompt: "test",
      expected_component: "skill-a",
      component_type: "skill",
      scenario_type: "direct",
      expected_trigger: true,
    };

    consoleProgress.onError!(new Error("Test error"), scenario);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Error in test-scenario: Test error"),
    );
  });

  it("logs errors without scenario info", () => {
    consoleProgress.onError!(new Error("Test error"), undefined);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Error: Test error"),
    );
  });
});

describe("verboseProgress", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs scenario start with details", () => {
    const scenario: TestScenario = {
      id: "test-scenario",
      prompt: "test",
      user_prompt: "How do I create a hook?",
      expected_component: "hook-development",
      component_type: "skill",
      scenario_type: "direct",
      expected_trigger: true,
    };

    verboseProgress.onScenarioStart!(scenario, 0, 10);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("[1/10] Starting: test-scenario"),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Type: skill"),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Prompt:"),
    );
  });

  it("truncates long prompts", () => {
    const scenario: TestScenario = {
      id: "test-scenario",
      prompt: "test",
      user_prompt: "A".repeat(100),
      expected_component: "skill-a",
      component_type: "skill",
      scenario_type: "direct",
      expected_trigger: true,
    };

    verboseProgress.onScenarioStart!(scenario, 0, 10);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/Prompt:.*\.\.\./),
    );
  });

  it("logs scenario completion with details", () => {
    const result: ExecutionResult = {
      scenario_id: "test-scenario",
      transcript: { metadata: { version: "v3.0" }, events: [] },
      detected_tools: [{ name: "Skill", input: { skill: "test" } }],
      cost_usd: 0.0123,
      api_duration_ms: 456,
      num_turns: 2,
      permission_denials: 0,
      errors: [],
    };

    verboseProgress.onScenarioComplete!(result, 1, 10);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("PASSED"));
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Cost: $0.0123"),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Detected: Skill"),
    );
  });

  it("shows failed status for errors", () => {
    const result: ExecutionResult = {
      scenario_id: "test-scenario",
      transcript: { metadata: { version: "v3.0" }, events: [] },
      detected_tools: [],
      cost_usd: 0.01,
      api_duration_ms: 100,
      num_turns: 1,
      permission_denials: 0,
      errors: ["Error occurred"],
    };

    verboseProgress.onScenarioComplete!(result, 1, 10);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("FAILED"));
  });

  it("shows permission denials", () => {
    const result: ExecutionResult = {
      scenario_id: "test-scenario",
      transcript: { metadata: { version: "v3.0" }, events: [] },
      detected_tools: [],
      cost_usd: 0.01,
      api_duration_ms: 100,
      num_turns: 1,
      permission_denials: ["Write", "Bash"],
      errors: [],
    };

    verboseProgress.onScenarioComplete!(result, 1, 10);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Denials: Write, Bash"),
    );
  });
});

describe("silentProgress", () => {
  it("has no callbacks defined", () => {
    expect(silentProgress.onStageStart).toBeUndefined();
    expect(silentProgress.onScenarioStart).toBeUndefined();
    expect(silentProgress.onScenarioComplete).toBeUndefined();
    expect(silentProgress.onStageComplete).toBeUndefined();
    expect(silentProgress.onError).toBeUndefined();
  });
});

describe("jsonProgress", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs stage start as JSON", () => {
    jsonProgress.onStageStart!("execution", 10);

    const call = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(call);

    expect(parsed.event).toBe("stage_start");
    expect(parsed.stage).toBe("execution");
    expect(parsed.total).toBe(10);
    expect(parsed.timestamp).toBeDefined();
  });

  it("logs scenario start as JSON", () => {
    const scenario: TestScenario = {
      id: "test-scenario",
      prompt: "test",
      expected_component: "skill-a",
      component_type: "skill",
      scenario_type: "direct",
      expected_trigger: true,
    };

    jsonProgress.onScenarioStart!(scenario, 0, 10);

    const call = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(call);

    expect(parsed.event).toBe("scenario_start");
    expect(parsed.scenario_id).toBe("test-scenario");
    expect(parsed.index).toBe(0);
    expect(parsed.total).toBe(10);
  });

  it("logs scenario completion as JSON", () => {
    const result: ExecutionResult = {
      scenario_id: "test-scenario",
      transcript: { metadata: { version: "v3.0" }, events: [] },
      detected_tools: [{ name: "Skill", input: {} }],
      cost_usd: 0.01,
      api_duration_ms: 100,
      num_turns: 1,
      permission_denials: 0,
      errors: [],
    };

    jsonProgress.onScenarioComplete!(result, 1, 10);

    const call = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(call);

    expect(parsed.event).toBe("scenario_complete");
    expect(parsed.scenario_id).toBe("test-scenario");
    expect(parsed.success).toBe(true);
    expect(parsed.cost_usd).toBe(0.01);
    expect(parsed.tools_detected).toBe(1);
  });

  it("logs stage completion as JSON", () => {
    jsonProgress.onStageComplete!("execution", 5000, 10);

    const call = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(call);

    expect(parsed.event).toBe("stage_complete");
    expect(parsed.stage).toBe("execution");
    expect(parsed.duration_ms).toBe(5000);
    expect(parsed.count).toBe(10);
  });

  it("logs errors as JSON", () => {
    const scenario: TestScenario = {
      id: "test-scenario",
      prompt: "test",
      expected_component: "skill-a",
      component_type: "skill",
      scenario_type: "direct",
      expected_trigger: true,
    };

    jsonProgress.onError!(new Error("Test error"), scenario);

    const call = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(call);

    expect(parsed.event).toBe("error");
    expect(parsed.scenario_id).toBe("test-scenario");
    expect(parsed.error).toBe("Test error");
  });
});

describe("createProgressReporter", () => {
  it("merges overrides with base", () => {
    const customComplete = vi.fn();
    const reporter = createProgressReporter({
      onScenarioComplete: customComplete,
    });

    // Base callbacks should be present
    expect(reporter.onStageStart).toBe(consoleProgress.onStageStart);
    expect(reporter.onStageComplete).toBe(consoleProgress.onStageComplete);

    // Override should replace
    expect(reporter.onScenarioComplete).toBe(customComplete);
  });

  it("uses custom base callbacks", () => {
    const customBase = { onStageStart: vi.fn() };
    const reporter = createProgressReporter({}, customBase);

    expect(reporter.onStageStart).toBe(customBase.onStageStart);
  });
});

describe("createStreamingReporter", () => {
  it("calls callback for stage start", () => {
    const callback = vi.fn();
    const reporter = createStreamingReporter(callback);

    reporter.onStageStart!("execution", 10);

    expect(callback).toHaveBeenCalledWith({
      type: "stage_start",
      data: { stage: "execution", total: 10 },
    });
  });

  it("calls callback for scenario start", () => {
    const callback = vi.fn();
    const reporter = createStreamingReporter(callback);

    const scenario: TestScenario = {
      id: "test-scenario",
      prompt: "test",
      expected_component: "skill-a",
      component_type: "skill",
      scenario_type: "direct",
      expected_trigger: true,
    };

    reporter.onScenarioStart!(scenario, 0, 10);

    expect(callback).toHaveBeenCalledWith({
      type: "scenario_start",
      data: {
        scenario_id: "test-scenario",
        index: 0,
        total: 10,
        component_type: "skill",
      },
    });
  });

  it("calls callback for scenario complete", () => {
    const callback = vi.fn();
    const reporter = createStreamingReporter(callback);

    const result: ExecutionResult = {
      scenario_id: "test-scenario",
      transcript: { metadata: { version: "v3.0" }, events: [] },
      detected_tools: [{ name: "Skill", input: {} }],
      cost_usd: 0.01,
      api_duration_ms: 100,
      num_turns: 1,
      permission_denials: 0,
      errors: [],
    };

    reporter.onScenarioComplete!(result, 1, 10);

    expect(callback).toHaveBeenCalledWith({
      type: "scenario_complete",
      data: {
        scenario_id: "test-scenario",
        index: 1,
        total: 10,
        success: true,
        cost_usd: 0.01,
        tools_detected: 1,
      },
    });
  });

  it("calls callback for stage complete", () => {
    const callback = vi.fn();
    const reporter = createStreamingReporter(callback);

    reporter.onStageComplete!("execution", 5000, 10);

    expect(callback).toHaveBeenCalledWith({
      type: "stage_complete",
      data: { stage: "execution", duration_ms: 5000, count: 10 },
    });
  });

  it("calls callback for errors", () => {
    const callback = vi.fn();
    const reporter = createStreamingReporter(callback);

    const scenario: TestScenario = {
      id: "test-scenario",
      prompt: "test",
      expected_component: "skill-a",
      component_type: "skill",
      scenario_type: "direct",
      expected_trigger: true,
    };

    reporter.onError!(new Error("Test error"), scenario);

    expect(callback).toHaveBeenCalledWith({
      type: "error",
      data: { scenario_id: "test-scenario", error: "Test error" },
    });
  });

  it("handles undefined scenario in error", () => {
    const callback = vi.fn();
    const reporter = createStreamingReporter(callback);

    reporter.onError!(new Error("Test error"), undefined);

    expect(callback).toHaveBeenCalledWith({
      type: "error",
      data: { scenario_id: undefined, error: "Test error" },
    });
  });
});
