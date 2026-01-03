/**
 * Tests for programmatic detector functions.
 */

import { describe, it, expect } from "vitest";

import type {
  HookResponseCapture,
  ProgrammaticDetection,
  TestScenario,
  ToolCapture,
  Transcript,
} from "../../../../src/types/index.js";

import {
  detectAllComponents,
  detectAllComponentsWithHooks,
  detectDirectCommandInvocation,
  detectFromCaptures,
  detectFromHookResponses,
  detectFromTranscript,
  getUniqueDetections,
  wasExpectedComponentTriggered,
  wasExpectedHookTriggered,
} from "../../../../src/stages/4-evaluation/programmatic-detector.js";

/**
 * Create a mock ToolCapture for testing.
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
 * Create a minimal transcript for testing.
 */
function createTranscript(
  events: Transcript["events"] = [],
  pluginName = "test-plugin",
): Transcript {
  return {
    metadata: {
      version: "v3.0",
      plugin_name: pluginName,
      scenario_id: "test-scenario",
      timestamp: new Date().toISOString(),
      model: "claude-3-opus-20240229",
    },
    events,
  };
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
    user_prompt: "test prompt",
    expected_trigger: true,
    expected_component: "test-skill",
    ...overrides,
  };
}

describe("detectFromCaptures", () => {
  it("should detect Skill tool invocations", () => {
    const captures = [createToolCapture("Skill", { skill: "commit" })];

    const detections = detectFromCaptures(captures);

    expect(detections).toHaveLength(1);
    expect(detections[0]).toMatchObject({
      component_type: "skill",
      component_name: "commit",
      confidence: 100,
      tool_name: "Skill",
    });
    expect(detections[0]?.evidence).toContain("Skill tool invoked: commit");
  });

  it("should detect Task tool invocations (agents)", () => {
    const captures = [
      createToolCapture("Task", { subagent_type: "bootstrap-expert" }),
    ];

    const detections = detectFromCaptures(captures);

    expect(detections).toHaveLength(1);
    expect(detections[0]).toMatchObject({
      component_type: "agent",
      component_name: "bootstrap-expert",
      confidence: 100,
      tool_name: "Task",
    });
  });

  it("should detect SlashCommand invocations (commands)", () => {
    const captures = [
      createToolCapture("SlashCommand", { skill: "create-plugin" }),
    ];

    const detections = detectFromCaptures(captures);

    expect(detections).toHaveLength(1);
    expect(detections[0]).toMatchObject({
      component_type: "command",
      component_name: "create-plugin",
      confidence: 100,
      tool_name: "SlashCommand",
    });
  });

  it("should ignore non-trigger tool calls", () => {
    const captures = [
      createToolCapture("Read", { file_path: "/test.txt" }),
      createToolCapture("Glob", { pattern: "*.ts" }),
    ];

    const detections = detectFromCaptures(captures);

    expect(detections).toHaveLength(0);
  });

  it("should detect multiple tool invocations", () => {
    const captures = [
      createToolCapture("Skill", { skill: "commit" }),
      createToolCapture("Task", { subagent_type: "explore-agent" }),
      createToolCapture("Read", { file_path: "/test.txt" }),
    ];

    const detections = detectFromCaptures(captures);

    expect(detections).toHaveLength(2);
    expect(detections[0]?.component_name).toBe("commit");
    expect(detections[1]?.component_name).toBe("explore-agent");
  });

  it("should handle invalid input gracefully", () => {
    const captures = [
      createToolCapture("Skill", { wrong: "field" }),
      createToolCapture("Task", "not an object"),
    ];

    const detections = detectFromCaptures(captures);

    expect(detections).toHaveLength(0);
  });

  it("should preserve timestamps", () => {
    const timestamp = 1700000000000;
    const captures = [createToolCapture("Skill", { skill: "test" }, timestamp)];

    const detections = detectFromCaptures(captures);

    expect(detections[0]?.timestamp).toBe(timestamp);
  });
});

describe("detectFromTranscript", () => {
  it("should detect tool calls from assistant events", () => {
    const transcript = createTranscript([
      {
        id: "msg-1",
        type: "user",
        edit: { message: { role: "user", content: "Help me commit" } },
      },
      {
        id: "msg-2",
        type: "assistant",
        edit: {
          message: {
            role: "assistant",
            content: "I'll help you commit",
            tool_calls: [
              { id: "tc-1", name: "Skill", input: { skill: "commit" } },
            ],
          },
        },
      },
    ]);

    const detections = detectFromTranscript(transcript);

    expect(detections).toHaveLength(1);
    expect(detections[0]).toMatchObject({
      component_type: "skill",
      component_name: "commit",
      confidence: 100,
    });
  });

  it("should handle assistant events without tool calls", () => {
    const transcript = createTranscript([
      {
        id: "msg-1",
        type: "assistant",
        edit: {
          message: {
            role: "assistant",
            content: "Hello!",
          },
        },
      },
    ]);

    const detections = detectFromTranscript(transcript);

    expect(detections).toHaveLength(0);
  });

  it("should skip user and tool_result events", () => {
    const transcript = createTranscript([
      {
        id: "msg-1",
        type: "user",
        edit: { message: { role: "user", content: "test" } },
      },
      {
        id: "msg-2",
        type: "tool_result",
        tool_use_id: "tc-1",
        result: "success",
      },
    ]);

    const detections = detectFromTranscript(transcript);

    expect(detections).toHaveLength(0);
  });
});

describe("detectDirectCommandInvocation", () => {
  it("should detect /command syntax in user message", () => {
    const transcript = createTranscript([
      {
        id: "msg-1",
        type: "user",
        edit: { message: { role: "user", content: "/create-plugin" } },
      },
    ]);
    const scenario = createScenario({ component_type: "command" });

    const detection = detectDirectCommandInvocation(transcript, scenario);

    expect(detection).not.toBeNull();
    expect(detection?.component_type).toBe("command");
    expect(detection?.component_name).toBe("create-plugin");
    expect(detection?.tool_name).toBe("DirectInvocation");
  });

  it("should detect /plugin:command syntax", () => {
    const transcript = createTranscript([
      {
        id: "msg-1",
        type: "user",
        edit: {
          message: { role: "user", content: "/plugin-dev:create-plugin" },
        },
      },
    ]);
    const scenario = createScenario({ component_type: "command" });

    const detection = detectDirectCommandInvocation(transcript, scenario);

    expect(detection).not.toBeNull();
    expect(detection?.component_name).toBe("create-plugin");
  });

  it("should detect /plugin:namespace/command syntax", () => {
    const transcript = createTranscript([
      {
        id: "msg-1",
        type: "user",
        edit: {
          message: { role: "user", content: "/bootstrap:utils/flexbox" },
        },
      },
    ]);
    const scenario = createScenario({ component_type: "command" });

    const detection = detectDirectCommandInvocation(transcript, scenario);

    expect(detection).not.toBeNull();
    expect(detection?.component_name).toBe("flexbox");
  });

  it("should return null for non-command messages", () => {
    const transcript = createTranscript([
      {
        id: "msg-1",
        type: "user",
        edit: { message: { role: "user", content: "Help me create a plugin" } },
      },
    ]);
    const scenario = createScenario({ component_type: "command" });

    const detection = detectDirectCommandInvocation(transcript, scenario);

    expect(detection).toBeNull();
  });

  it("should return null for empty transcript", () => {
    const transcript = createTranscript([]);
    const scenario = createScenario({ component_type: "command" });

    const detection = detectDirectCommandInvocation(transcript, scenario);

    expect(detection).toBeNull();
  });
});

describe("detectAllComponents", () => {
  it("should use captures as primary detection method", () => {
    const captures = [createToolCapture("Skill", { skill: "commit" })];
    const transcript = createTranscript([
      {
        id: "msg-1",
        type: "user",
        edit: { message: { role: "user", content: "commit changes" } },
      },
    ]);
    const scenario = createScenario({ component_type: "skill" });

    const detections = detectAllComponents(captures, transcript, scenario);

    expect(detections).toHaveLength(1);
    expect(detections[0]?.component_name).toBe("commit");
  });

  it("should add direct command detection for commands", () => {
    const captures: ToolCapture[] = [];
    const transcript = createTranscript([
      {
        id: "msg-1",
        type: "user",
        edit: { message: { role: "user", content: "/create-plugin" } },
      },
    ]);
    const scenario = createScenario({
      component_type: "command",
      expected_component: "create-plugin",
    });

    const detections = detectAllComponents(captures, transcript, scenario);

    expect(detections).toHaveLength(1);
    expect(detections[0]?.component_name).toBe("create-plugin");
    expect(detections[0]?.tool_name).toBe("DirectInvocation");
  });

  it("should not duplicate direct command if already in captures", () => {
    const captures = [
      createToolCapture("SlashCommand", { skill: "create-plugin" }),
    ];
    const transcript = createTranscript([
      {
        id: "msg-1",
        type: "user",
        edit: { message: { role: "user", content: "/create-plugin" } },
      },
    ]);
    const scenario = createScenario({
      component_type: "command",
      expected_component: "create-plugin",
    });

    const detections = detectAllComponents(captures, transcript, scenario);

    expect(detections).toHaveLength(1);
    expect(detections[0]?.tool_name).toBe("SlashCommand");
  });

  it("should fallback to transcript parsing when captures empty", () => {
    const captures: ToolCapture[] = [];
    const transcript = createTranscript([
      {
        id: "msg-1",
        type: "assistant",
        edit: {
          message: {
            role: "assistant",
            content: "I'll use the skill",
            tool_calls: [
              { id: "tc-1", name: "Skill", input: { skill: "commit" } },
            ],
          },
        },
      },
    ]);
    const scenario = createScenario({ component_type: "skill" });

    const detections = detectAllComponents(captures, transcript, scenario);

    expect(detections).toHaveLength(1);
    expect(detections[0]?.component_name).toBe("commit");
  });
});

describe("wasExpectedComponentTriggered", () => {
  it("should return true when expected component triggered", () => {
    const detections: ProgrammaticDetection[] = [
      {
        component_type: "skill",
        component_name: "commit",
        confidence: 100,
        tool_name: "Skill",
        evidence: "test",
        timestamp: 0,
      },
    ];

    expect(wasExpectedComponentTriggered(detections, "commit", "skill")).toBe(
      true,
    );
  });

  it("should return false when wrong component triggered", () => {
    const detections: ProgrammaticDetection[] = [
      {
        component_type: "skill",
        component_name: "review",
        confidence: 100,
        tool_name: "Skill",
        evidence: "test",
        timestamp: 0,
      },
    ];

    expect(wasExpectedComponentTriggered(detections, "commit", "skill")).toBe(
      false,
    );
  });

  it("should return false when wrong type triggered", () => {
    const detections: ProgrammaticDetection[] = [
      {
        component_type: "agent",
        component_name: "commit",
        confidence: 100,
        tool_name: "Task",
        evidence: "test",
        timestamp: 0,
      },
    ];

    expect(wasExpectedComponentTriggered(detections, "commit", "skill")).toBe(
      false,
    );
  });

  it("should return false when nothing triggered", () => {
    expect(wasExpectedComponentTriggered([], "commit", "skill")).toBe(false);
  });
});

describe("getUniqueDetections", () => {
  it("should remove duplicate detections", () => {
    const detections: ProgrammaticDetection[] = [
      {
        component_type: "skill",
        component_name: "commit",
        confidence: 100,
        tool_name: "Skill",
        evidence: "first",
        timestamp: 1,
      },
      {
        component_type: "skill",
        component_name: "commit",
        confidence: 100,
        tool_name: "Skill",
        evidence: "second",
        timestamp: 2,
      },
    ];

    const unique = getUniqueDetections(detections);

    expect(unique).toHaveLength(1);
    expect(unique[0]?.evidence).toBe("first");
  });

  it("should keep different components", () => {
    const detections: ProgrammaticDetection[] = [
      {
        component_type: "skill",
        component_name: "commit",
        confidence: 100,
        tool_name: "Skill",
        evidence: "first",
        timestamp: 1,
      },
      {
        component_type: "skill",
        component_name: "review",
        confidence: 100,
        tool_name: "Skill",
        evidence: "second",
        timestamp: 2,
      },
    ];

    const unique = getUniqueDetections(detections);

    expect(unique).toHaveLength(2);
  });

  it("should treat same name different type as different", () => {
    const detections: ProgrammaticDetection[] = [
      {
        component_type: "skill",
        component_name: "commit",
        confidence: 100,
        tool_name: "Skill",
        evidence: "skill",
        timestamp: 1,
      },
      {
        component_type: "command",
        component_name: "commit",
        confidence: 100,
        tool_name: "SlashCommand",
        evidence: "command",
        timestamp: 2,
      },
    ];

    const unique = getUniqueDetections(detections);

    expect(unique).toHaveLength(2);
  });
});

describe("detectFromHookResponses", () => {
  it("should detect hook activation from responses", () => {
    const responses: HookResponseCapture[] = [
      {
        hookName: "PreToolUse::Write|Edit",
        hookEvent: "PreToolUse",
        stdout: "Hook executed",
        stderr: "",
        timestamp: Date.now(),
      },
    ];

    const detections = detectFromHookResponses(responses);

    expect(detections).toHaveLength(1);
    expect(detections[0]).toMatchObject({
      component_type: "hook",
      component_name: "PreToolUse::Write|Edit",
      confidence: 100,
      tool_name: "PreToolUse",
    });
    expect(detections[0]?.evidence).toContain("Hook response:");
    expect(detections[0]?.evidence).toContain("fired");
  });

  it("should detect multiple hook activations", () => {
    const responses: HookResponseCapture[] = [
      {
        hookName: "PreToolUse::Write",
        hookEvent: "PreToolUse",
        stdout: "First hook",
        stderr: "",
        timestamp: 1000,
      },
      {
        hookName: "PostToolUse::Write",
        hookEvent: "PostToolUse",
        stdout: "Second hook",
        stderr: "",
        timestamp: 2000,
      },
    ];

    const detections = detectFromHookResponses(responses);

    expect(detections).toHaveLength(2);
    expect(detections[0]?.component_name).toBe("PreToolUse::Write");
    expect(detections[1]?.component_name).toBe("PostToolUse::Write");
  });

  it("should preserve timestamps from hook responses", () => {
    const timestamp = 1700000000000;
    const responses: HookResponseCapture[] = [
      {
        hookName: "Stop::*",
        hookEvent: "Stop",
        stdout: "Stop hook",
        stderr: "",
        timestamp,
      },
    ];

    const detections = detectFromHookResponses(responses);

    expect(detections[0]?.timestamp).toBe(timestamp);
  });

  it("should return empty array for empty responses", () => {
    const detections = detectFromHookResponses([]);

    expect(detections).toEqual([]);
  });

  it("should include hook event in tool_name", () => {
    const responses: HookResponseCapture[] = [
      {
        hookName: "SessionStart::*",
        hookEvent: "SessionStart",
        stdout: "Session initialized",
        stderr: "",
        timestamp: Date.now(),
      },
    ];

    const detections = detectFromHookResponses(responses);

    expect(detections[0]?.tool_name).toBe("SessionStart");
  });

  it("should handle hooks with stderr output", () => {
    const responses: HookResponseCapture[] = [
      {
        hookName: "PreToolUse::Bash",
        hookEvent: "PreToolUse",
        stdout: "",
        stderr: "Warning: validation failed",
        exitCode: 1,
        timestamp: Date.now(),
      },
    ];

    const detections = detectFromHookResponses(responses);

    expect(detections).toHaveLength(1);
    expect(detections[0]?.evidence).toContain("Hook response:");
    expect(detections[0]?.evidence).toContain("exit code:");
  });
});

describe("wasExpectedHookTriggered", () => {
  const mockResponses: HookResponseCapture[] = [
    {
      hookName: "PreToolUse::Write|Edit",
      hookEvent: "PreToolUse",
      stdout: "Hook 1",
      stderr: "",
      timestamp: Date.now(),
    },
    {
      hookName: "PostToolUse::Write",
      hookEvent: "PostToolUse",
      stdout: "Hook 2",
      stderr: "",
      timestamp: Date.now(),
    },
    {
      hookName: "Stop::*",
      hookEvent: "Stop",
      stdout: "Hook 3",
      stderr: "",
      timestamp: Date.now(),
    },
  ];

  it("should return true when exact hook name matches", () => {
    const triggered = wasExpectedHookTriggered(mockResponses, "Stop::*");

    expect(triggered).toBe(true);
  });

  it("should return true when event type and matcher match", () => {
    const triggered = wasExpectedHookTriggered(
      mockResponses,
      "PreToolUse::Write|Edit",
    );

    expect(triggered).toBe(true);
  });

  it("should match by event type when provided", () => {
    const triggered = wasExpectedHookTriggered(
      mockResponses,
      "PostToolUse::Write",
      "PostToolUse",
    );

    expect(triggered).toBe(true);
  });

  it("should return false when event type mismatches", () => {
    const triggered = wasExpectedHookTriggered(
      mockResponses,
      "PreToolUse::Write",
      "PostToolUse",
    );

    expect(triggered).toBe(false);
  });

  it("should return false when no matching hook", () => {
    const triggered = wasExpectedHookTriggered(
      mockResponses,
      "SessionStart::*",
    );

    expect(triggered).toBe(false);
  });

  it("should return false for empty responses", () => {
    const triggered = wasExpectedHookTriggered([], "PreToolUse::Write");

    expect(triggered).toBe(false);
  });

  it("should match partial matcher in hook name", () => {
    const triggered = wasExpectedHookTriggered(
      mockResponses,
      "PreToolUse::Write",
    );

    expect(triggered).toBe(true);
  });

  it("should handle hook names without colon delimiter", () => {
    const responses: HookResponseCapture[] = [
      {
        hookName: "custom-hook-name",
        hookEvent: "PreToolUse",
        stdout: "Hook",
        stderr: "",
        timestamp: Date.now(),
      },
    ];

    const triggered = wasExpectedHookTriggered(responses, "custom-hook-name");

    expect(triggered).toBe(true);
  });
});

describe("detectAllComponentsWithHooks", () => {
  it("should detect both regular components and hooks", () => {
    const captures = [createToolCapture("Skill", { skill: "commit" })];
    const transcript = createTranscript([]);
    const scenario = createScenario({ component_type: "hook" });
    const hookResponses: HookResponseCapture[] = [
      {
        hookName: "PreToolUse::Write",
        hookEvent: "PreToolUse",
        stdout: "Hook",
        stderr: "",
        timestamp: Date.now(),
      },
    ];

    const detections = detectAllComponentsWithHooks(
      captures,
      transcript,
      scenario,
      hookResponses,
    );

    expect(detections.length).toBeGreaterThan(0);
    expect(detections.some((d) => d.component_type === "skill")).toBe(true);
    expect(detections.some((d) => d.component_type === "hook")).toBe(true);
  });

  it("should filter hooks by scenario component_ref", () => {
    const captures: ToolCapture[] = [];
    const transcript = createTranscript([]);
    const scenario = createScenario({
      component_type: "hook",
      component_ref: "PreToolUse::Write",
    });
    const hookResponses: HookResponseCapture[] = [
      {
        hookName: "PreToolUse::Write",
        hookEvent: "PreToolUse",
        stdout: "Relevant hook",
        stderr: "",
        timestamp: 1000,
      },
      {
        hookName: "PostToolUse::Read",
        hookEvent: "PostToolUse",
        stdout: "Irrelevant hook",
        stderr: "",
        timestamp: 2000,
      },
    ];

    const detections = detectAllComponentsWithHooks(
      captures,
      transcript,
      scenario,
      hookResponses,
    );

    const hookDetections = detections.filter(
      (d) => d.component_type === "hook",
    );
    expect(hookDetections).toHaveLength(1);
    expect(hookDetections[0]?.tool_name).toBe("PreToolUse");
  });

  it("should not add hook detections for non-hook scenarios", () => {
    const captures = [createToolCapture("Skill", { skill: "commit" })];
    const transcript = createTranscript([]);
    const scenario = createScenario({ component_type: "skill" });
    const hookResponses: HookResponseCapture[] = [
      {
        hookName: "PreToolUse::Write",
        hookEvent: "PreToolUse",
        stdout: "Hook",
        stderr: "",
        timestamp: Date.now(),
      },
    ];

    const detections = detectAllComponentsWithHooks(
      captures,
      transcript,
      scenario,
      hookResponses,
    );

    expect(detections.every((d) => d.component_type !== "hook")).toBe(true);
  });

  it("should work without hook responses", () => {
    const captures = [createToolCapture("Skill", { skill: "commit" })];
    const transcript = createTranscript([]);
    const scenario = createScenario({ component_type: "skill" });

    const detections = detectAllComponentsWithHooks(
      captures,
      transcript,
      scenario,
    );

    expect(detections).toHaveLength(1);
    expect(detections[0]?.component_type).toBe("skill");
  });

  it("should deduplicate detections", () => {
    const captures = [
      createToolCapture("Skill", { skill: "commit" }),
      createToolCapture("Skill", { skill: "commit" }),
    ];
    const transcript = createTranscript([]);
    const scenario = createScenario({ component_type: "skill" });

    const detections = detectAllComponentsWithHooks(
      captures,
      transcript,
      scenario,
    );

    expect(detections).toHaveLength(1);
  });
});
