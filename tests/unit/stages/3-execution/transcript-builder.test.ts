/**
 * Unit tests for transcript-builder.ts
 */

import { describe, expect, it } from "vitest";

import {
  isUserMessage,
  isAssistantMessage,
  isToolResultMessage,
  isResultMessage,
  isSystemMessage,
  buildTranscript,
  extractMetrics,
  createErrorEvent,
  extractSessionId,
  isSuccessfulExecution,
  countAssistantTurns,
  type SDKMessage,
  type SDKUserMessage,
  type SDKAssistantMessage,
  type SDKToolResultMessage,
  type SDKResultMessage,
  type SDKSystemMessage,
} from "../../../../src/stages/3-execution/transcript-builder.js";
import type { TestScenario } from "../../../../src/types/index.js";

describe("isUserMessage", () => {
  it("should return true for user messages", () => {
    const msg: SDKMessage = {
      type: "user",
      message: { role: "user", content: "Hello" },
    };

    expect(isUserMessage(msg)).toBe(true);
  });

  it("should return false for non-user messages", () => {
    expect(isUserMessage({ type: "assistant" })).toBe(false);
    expect(isUserMessage({ type: "user" })).toBe(false); // No message
  });
});

describe("isAssistantMessage", () => {
  it("should return true for assistant messages", () => {
    const msg: SDKMessage = {
      type: "assistant",
      message: { role: "assistant", content: [] },
    };

    expect(isAssistantMessage(msg)).toBe(true);
  });

  it("should return false for non-assistant messages", () => {
    expect(isAssistantMessage({ type: "user" })).toBe(false);
    expect(isAssistantMessage({ type: "assistant" })).toBe(false); // No message
  });
});

describe("isToolResultMessage", () => {
  it("should return true for tool result messages", () => {
    const msg: SDKMessage = {
      type: "tool_result",
      tool_use_id: "123",
    };

    expect(isToolResultMessage(msg)).toBe(true);
  });

  it("should return false for non-tool-result messages", () => {
    expect(isToolResultMessage({ type: "user" })).toBe(false);
    expect(isToolResultMessage({ type: "tool_result" })).toBe(false); // No tool_use_id
  });
});

describe("isResultMessage", () => {
  it("should return true for result messages", () => {
    const msg: SDKMessage = { type: "result" };

    expect(isResultMessage(msg)).toBe(true);
  });

  it("should return false for non-result messages", () => {
    expect(isResultMessage({ type: "user" })).toBe(false);
  });
});

describe("isSystemMessage", () => {
  it("should return true for system messages", () => {
    const msg: SDKMessage = { type: "system", subtype: "init" };

    expect(isSystemMessage(msg)).toBe(true);
  });

  it("should return false for non-system messages", () => {
    expect(isSystemMessage({ type: "user" })).toBe(false);
  });
});

describe("buildTranscript", () => {
  const mockScenario: TestScenario = {
    id: "test-scenario-1",
    component_ref: "skill/test",
    component_type: "skill",
    scenario_type: "direct",
    user_prompt: "Test prompt",
    expected_trigger: true,
    expected_component: "test-skill",
  };

  const context = {
    scenario: mockScenario,
    pluginName: "test-plugin",
    model: "claude-sonnet-4-5-20250929",
  };

  it("should build transcript with correct metadata", () => {
    const messages: SDKMessage[] = [];

    const transcript = buildTranscript(context, messages, []);

    expect(transcript.metadata.version).toBe("v3.0");
    expect(transcript.metadata.plugin_name).toBe("test-plugin");
    expect(transcript.metadata.scenario_id).toBe("test-scenario-1");
    expect(transcript.metadata.model).toBe("claude-sonnet-4-5-20250929");
    expect(transcript.metadata.timestamp).toBeDefined();
  });

  it("should include cost from result message", () => {
    const messages: SDKMessage[] = [
      {
        type: "result",
        total_cost_usd: 0.05,
        duration_ms: 1000,
      } as SDKResultMessage,
    ];

    const transcript = buildTranscript(context, messages, []);

    expect(transcript.metadata.total_cost_usd).toBe(0.05);
    expect(transcript.metadata.api_duration_ms).toBe(1000);
  });

  it("should convert user messages to events", () => {
    const messages: SDKMessage[] = [
      {
        type: "user",
        message: { role: "user", content: "Hello" },
      } as SDKUserMessage,
    ];

    const transcript = buildTranscript(context, messages, []);

    expect(transcript.events).toHaveLength(1);
    expect(transcript.events[0]?.type).toBe("user");
  });

  it("should convert assistant messages to events", () => {
    const messages: SDKMessage[] = [
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Hello back" }],
        },
      } as SDKAssistantMessage,
    ];

    const transcript = buildTranscript(context, messages, []);

    expect(transcript.events).toHaveLength(1);
    expect(transcript.events[0]?.type).toBe("assistant");
  });

  it("should convert tool result messages to events", () => {
    const messages: SDKMessage[] = [
      {
        type: "tool_result",
        tool_use_id: "tool-123",
        content: "File contents...",
      } as SDKToolResultMessage,
    ];

    const transcript = buildTranscript(context, messages, []);

    expect(transcript.events).toHaveLength(1);
    expect(transcript.events[0]?.type).toBe("tool_result");
  });

  it("should include errors when present", () => {
    const errors = [
      {
        type: "error" as const,
        error_type: "api_error" as const,
        message: "Something went wrong",
        timestamp: Date.now(),
        recoverable: false,
      },
    ];

    const transcript = buildTranscript(context, [], errors);

    expect(transcript.errors).toHaveLength(1);
    expect(transcript.errors?.[0]?.message).toBe("Something went wrong");
  });

  it("should not include errors key when empty", () => {
    const transcript = buildTranscript(context, [], []);

    expect(transcript.errors).toBeUndefined();
  });
});

describe("extractMetrics", () => {
  it("should extract metrics from result message", () => {
    const messages: SDKMessage[] = [
      { type: "user", message: {} },
      {
        type: "result",
        total_cost_usd: 0.1,
        duration_ms: 2000,
        num_turns: 3,
        permission_denials: ["Write"],
      } as SDKResultMessage,
    ];

    const metrics = extractMetrics(messages);

    expect(metrics.costUsd).toBe(0.1);
    expect(metrics.durationMs).toBe(2000);
    expect(metrics.numTurns).toBe(3);
    expect(metrics.permissionDenials).toEqual(["Write"]);
  });

  it("should return defaults when no result message", () => {
    const messages: SDKMessage[] = [{ type: "user", message: {} }];

    const metrics = extractMetrics(messages);

    expect(metrics.costUsd).toBe(0);
    expect(metrics.durationMs).toBe(0);
    expect(metrics.numTurns).toBe(0);
    expect(metrics.permissionDenials).toEqual([]);
  });
});

describe("createErrorEvent", () => {
  it("should create error event from Error", () => {
    const error = new Error("Test error");

    const event = createErrorEvent(error);

    expect(event.type).toBe("error");
    expect(event.error_type).toBe("api_error");
    expect(event.message).toBe("Test error");
    expect(event.recoverable).toBe(false);
    expect(event.timestamp).toBeTypeOf("number");
  });

  it("should create timeout error event", () => {
    const error = new Error("Timeout");

    const event = createErrorEvent(error, true);

    expect(event.error_type).toBe("timeout");
  });

  it("should handle non-Error objects", () => {
    const event = createErrorEvent("String error");

    expect(event.message).toBe("String error");
  });
});

describe("extractSessionId", () => {
  it("should extract session ID from init message", () => {
    const messages: SDKMessage[] = [
      {
        type: "system",
        subtype: "init",
        session_id: "session-123",
      } as SDKSystemMessage,
    ];

    expect(extractSessionId(messages)).toBe("session-123");
  });

  it("should return undefined when no init message", () => {
    const messages: SDKMessage[] = [{ type: "user", message: {} }];

    expect(extractSessionId(messages)).toBeUndefined();
  });
});

describe("isSuccessfulExecution", () => {
  it("should return true for successful execution", () => {
    const messages: SDKMessage[] = [{ type: "result" }];

    expect(isSuccessfulExecution(messages, [])).toBe(true);
  });

  it("should return false when errors present", () => {
    const messages: SDKMessage[] = [{ type: "result" }];
    const errors = [
      {
        type: "error" as const,
        error_type: "api_error" as const,
        message: "Error",
        timestamp: 1,
        recoverable: false,
      },
    ];

    expect(isSuccessfulExecution(messages, errors)).toBe(false);
  });

  it("should return false when no result message", () => {
    const messages: SDKMessage[] = [{ type: "user", message: {} }];

    expect(isSuccessfulExecution(messages, [])).toBe(false);
  });
});

describe("countAssistantTurns", () => {
  it("should count assistant messages", () => {
    const messages: SDKMessage[] = [
      { type: "user", message: {} },
      { type: "assistant", message: { role: "assistant", content: [] } },
      { type: "user", message: {} },
      { type: "assistant", message: { role: "assistant", content: [] } },
      { type: "result" },
    ];

    expect(countAssistantTurns(messages)).toBe(2);
  });

  it("should return 0 when no assistant messages", () => {
    const messages: SDKMessage[] = [{ type: "user", message: {} }];

    expect(countAssistantTurns(messages)).toBe(0);
  });
});
