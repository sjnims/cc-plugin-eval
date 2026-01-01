/**
 * Tests for programmatic detector functions.
 */

import { describe, it, expect } from "vitest";

import type {
  ToolCapture,
  Transcript,
  TestScenario,
  ProgrammaticDetection,
} from "../../../../src/types/index.js";

import {
  detectFromCaptures,
  detectFromTranscript,
  detectDirectCommandInvocation,
  detectAllComponents,
  wasExpectedComponentTriggered,
  getUniqueDetections,
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
