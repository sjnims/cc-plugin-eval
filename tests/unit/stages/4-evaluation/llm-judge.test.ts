/**
 * Tests for LLM judge functions.
 *
 * Uses mocked Anthropic SDK to test LLM integration paths.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

import type {
  EvaluationConfig,
  ProgrammaticDetection,
  TestScenario,
  Transcript,
} from "../../../../src/types/index.js";

import {
  evaluateWithLLMJudge,
  evaluateWithFallback,
  buildJudgePrompt,
  formatTranscriptWithIds,
  createErrorJudgeResponse,
} from "../../../../src/stages/4-evaluation/llm-judge.js";

// Mock the retry utility to avoid delays in tests
vi.mock("../../../../src/utils/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

/**
 * Create a mock Anthropic client.
 */
function createMockClient(
  responseText: string,
): Anthropic & { messages: { create: Mock } } {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: responseText }],
      }),
    },
  } as unknown as Anthropic & { messages: { create: Mock } };
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
function createTranscript(
  events: Transcript["events"] = [],
  pluginName = "test-plugin",
): Transcript {
  return {
    metadata: {
      version: "v3.0",
      plugin_name: pluginName,
      scenario_id: "test-scenario-1",
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
 * Create mock programmatic detections.
 */
function createDetections(
  components: { name: string; type: "skill" | "agent" | "command" }[] = [],
): ProgrammaticDetection[] {
  return components.map((c) => ({
    component_type: c.type,
    component_name: c.name,
    confidence: 100 as const,
    tool_name:
      c.type === "skill"
        ? "Skill"
        : c.type === "agent"
          ? "Task"
          : "SlashCommand",
    evidence: `${c.type} triggered: ${c.name}`,
    timestamp: Date.now(),
  }));
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
 * Create a valid judge response JSON string.
 */
function createJudgeResponseJson(
  overrides: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    quality_score: 8,
    response_relevance: 9,
    trigger_accuracy: "correct",
    issues: [],
    highlights: [
      {
        description: "Component triggered correctly",
        message_id: "msg-2",
        quoted_text: "I'll help you commit",
        position_start: 0,
        position_end: 20,
      },
    ],
    summary: "The component triggered correctly and responded appropriately.",
    ...overrides,
  });
}

describe("formatTranscriptWithIds", () => {
  it("should format user events with message ID", () => {
    const transcript = createTranscript([
      {
        id: "msg-1",
        type: "user",
        edit: { message: { role: "user", content: "Hello world" } },
      },
    ]);

    const formatted = formatTranscriptWithIds(transcript);

    expect(formatted).toContain("[msg-1] USER:");
    expect(formatted).toContain("Hello world");
  });

  it("should format assistant events with tool info", () => {
    const transcript = createTranscript([
      {
        id: "msg-2",
        type: "assistant",
        edit: {
          message: {
            role: "assistant",
            content: "I'll help you",
            tool_calls: [
              { id: "tc-1", name: "Skill", input: { skill: "commit" } },
            ],
          },
        },
      },
    ]);

    const formatted = formatTranscriptWithIds(transcript);

    expect(formatted).toContain("[msg-2] ASSISTANT:");
    expect(formatted).toContain("I'll help you");
    expect(formatted).toContain("[Tools: Skill]");
  });

  it("should format tool_result events", () => {
    const transcript = createTranscript([
      {
        id: "msg-3",
        type: "tool_result",
        tool_use_id: "tc-1",
        result: "Success",
      },
    ]);

    const formatted = formatTranscriptWithIds(transcript);

    expect(formatted).toContain("[msg-3] TOOL_RESULT:");
    expect(formatted).toContain("Success");
  });

  it("should truncate long content", () => {
    const longContent = "x".repeat(600);
    const transcript = createTranscript([
      {
        id: "msg-1",
        type: "user",
        edit: { message: { role: "user", content: longContent } },
      },
    ]);

    const formatted = formatTranscriptWithIds(transcript, 500);

    expect(formatted.length).toBeLessThan(longContent.length + 50);
    expect(formatted).toContain("...");
  });

  it("should handle object results in tool_result", () => {
    const transcript = createTranscript([
      {
        id: "msg-3",
        type: "tool_result",
        tool_use_id: "tc-1",
        result: { status: "success", data: [1, 2, 3] },
      },
    ]);

    const formatted = formatTranscriptWithIds(transcript);

    expect(formatted).toContain("status");
    expect(formatted).toContain("success");
  });
});

describe("buildJudgePrompt", () => {
  it("should include all required fields", () => {
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([{ name: "commit", type: "skill" }]);
    const config = createConfig();

    const prompt = buildJudgePrompt(scenario, transcript, detections, config);

    expect(prompt).toContain("PLUGIN: test-plugin");
    expect(prompt).toContain("COMPONENT BEING TESTED: commit (skill)");
    expect(prompt).toContain("SCENARIO TYPE: direct");
    expect(prompt).toContain("EXPECTED TO TRIGGER: true");
    expect(prompt).toContain("PROGRAMMATIC DETECTION: skill:commit");
    expect(prompt).toContain("COMPONENT DETAILS:");
    expect(prompt).toContain("test-skill");
  });

  it("should show no components detected when empty", () => {
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections: ProgrammaticDetection[] = [];
    const config = createConfig();

    const prompt = buildJudgePrompt(scenario, transcript, detections, config);

    expect(prompt).toContain("PROGRAMMATIC DETECTION: No components detected");
  });

  it("should include citation instruction when enabled", () => {
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([]);
    const config = createConfig({ include_citations: true });

    const prompt = buildJudgePrompt(scenario, transcript, detections, config);

    expect(prompt).toContain(
      "message_id and quoted_text for citation grounding",
    );
  });

  it("should use simple highlight instruction when citations disabled", () => {
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([]);
    const config = createConfig({ include_citations: false });

    const prompt = buildJudgePrompt(scenario, transcript, detections, config);

    expect(prompt).toContain(
      "Notable quotes demonstrating good or bad behavior",
    );
  });

  it("should include multiple detected components", () => {
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([
      { name: "commit", type: "skill" },
      { name: "review", type: "skill" },
    ]);
    const config = createConfig();

    const prompt = buildJudgePrompt(scenario, transcript, detections, config);

    expect(prompt).toContain("skill:commit, skill:review");
  });
});

describe("createErrorJudgeResponse", () => {
  it("should create response with error message", () => {
    const response = createErrorJudgeResponse("API connection failed");

    expect(response.quality_score).toBe(0);
    expect(response.response_relevance).toBe(0);
    expect(response.trigger_accuracy).toBe("incorrect");
    expect(response.issues).toContain("API connection failed");
    expect(response.summary).toContain("Evaluation failed");
    expect(response.summary).toContain("API connection failed");
  });

  it("should have no highlights", () => {
    const response = createErrorJudgeResponse("Error");

    expect(response.highlights).toBeUndefined();
  });
});

describe("evaluateWithLLMJudge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call Anthropic API with correct parameters", async () => {
    const responseJson = createJudgeResponseJson();
    const mockClient = createMockClient(responseJson);
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([{ name: "commit", type: "skill" }]);
    const config = createConfig({ model: "sonnet", max_tokens: 2048 });

    await evaluateWithLLMJudge(
      mockClient,
      scenario,
      transcript,
      detections,
      config,
    );

    expect(mockClient.messages.create).toHaveBeenCalledTimes(1);
    const callArgs = mockClient.messages.create.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(callArgs).toBeDefined();
    expect(callArgs["model"]).toBe("claude-sonnet-4-5-20250929");
    expect(callArgs["max_tokens"]).toBe(2048);
    expect(callArgs["messages"]).toHaveLength(1);
  });

  it("should parse structured output response correctly", async () => {
    const responseJson = createJudgeResponseJson({
      quality_score: 9,
      response_relevance: 8,
      trigger_accuracy: "correct",
      issues: ["Minor formatting issue"],
      summary: "Good response overall",
    });
    const mockClient = createMockClient(responseJson);
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([{ name: "commit", type: "skill" }]);
    const config = createConfig();

    const result = await evaluateWithLLMJudge(
      mockClient,
      scenario,
      transcript,
      detections,
      config,
    );

    expect(result.quality_score).toBe(9);
    expect(result.response_relevance).toBe(8);
    expect(result.trigger_accuracy).toBe("correct");
    expect(result.issues).toContain("Minor formatting issue");
    expect(result.summary).toBe("Good response overall");
  });

  it("should transform highlights with citations", async () => {
    const responseJson = createJudgeResponseJson({
      highlights: [
        {
          description: "Good trigger",
          message_id: "msg-2",
          quoted_text: "I'll help you commit",
          position_start: 0,
          position_end: 20,
        },
      ],
    });
    const mockClient = createMockClient(responseJson);
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([]);
    const config = createConfig();

    const result = await evaluateWithLLMJudge(
      mockClient,
      scenario,
      transcript,
      detections,
      config,
    );

    expect(result.highlights).toHaveLength(1);
    expect(result.highlights?.[0]?.description).toBe("Good trigger");
    expect(result.highlights?.[0]?.citation.message_id).toBe("msg-2");
    expect(result.highlights?.[0]?.citation.quoted_text).toBe(
      "I'll help you commit",
    );
    expect(result.highlights?.[0]?.citation.position).toEqual([0, 20]);
  });

  it("should handle response without highlights", async () => {
    const responseJson = JSON.stringify({
      quality_score: 7,
      response_relevance: 7,
      trigger_accuracy: "partial",
      issues: [],
      summary: "Acceptable",
    });
    const mockClient = createMockClient(responseJson);
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([]);
    const config = createConfig();

    const result = await evaluateWithLLMJudge(
      mockClient,
      scenario,
      transcript,
      detections,
      config,
    );

    expect(result.highlights).toBeUndefined();
  });

  it("should throw on invalid JSON response", async () => {
    const mockClient = createMockClient("not valid json");
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([]);
    const config = createConfig();

    await expect(
      evaluateWithLLMJudge(
        mockClient,
        scenario,
        transcript,
        detections,
        config,
      ),
    ).rejects.toThrow("Failed to parse structured output");
  });

  it("should throw when no text block in response", async () => {
    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "tool_use", id: "tc-1", name: "test", input: {} }],
        }),
      },
    } as unknown as Anthropic;
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([]);
    const config = createConfig();

    await expect(
      evaluateWithLLMJudge(
        mockClient,
        scenario,
        transcript,
        detections,
        config,
      ),
    ).rejects.toThrow("No text block");
  });
});

describe("evaluateWithFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should use structured output when it works", async () => {
    const responseJson = createJudgeResponseJson({ quality_score: 9 });
    const mockClient = createMockClient(responseJson);
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([{ name: "commit", type: "skill" }]);
    const config = createConfig();

    const result = await evaluateWithFallback(
      mockClient,
      scenario,
      transcript,
      detections,
      config,
    );

    expect(result.quality_score).toBe(9);
    expect(mockClient.messages.create).toHaveBeenCalledTimes(1);
  });

  it("should fallback to JSON parsing on structured output failure", async () => {
    // First call fails, second call succeeds with plain JSON
    const responseJson = createJudgeResponseJson({ quality_score: 7 });
    let callCount = 0;
    const createMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call - simulate structured output failure
        return Promise.reject(new Error("Structured output not supported"));
      }
      // Second call - return plain JSON
      return Promise.resolve({
        content: [{ type: "text", text: responseJson }],
      });
    });
    const mockClient = {
      messages: { create: createMock },
    } as unknown as Anthropic;
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([]);
    const config = createConfig();

    const result = await evaluateWithFallback(
      mockClient,
      scenario,
      transcript,
      detections,
      config,
    );

    expect(result.quality_score).toBe(7);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("should handle markdown code blocks in fallback response", async () => {
    const responseJson = createJudgeResponseJson({ quality_score: 6 });
    const wrappedResponse = "```json\n" + responseJson + "\n```";
    let callCount = 0;
    const mockClient = {
      messages: {
        create: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error("Structured output error"));
          }
          return Promise.resolve({
            content: [{ type: "text", text: wrappedResponse }],
          });
        }),
      },
    } as unknown as Anthropic;
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([]);
    const config = createConfig();

    const result = await evaluateWithFallback(
      mockClient,
      scenario,
      transcript,
      detections,
      config,
    );

    expect(result.quality_score).toBe(6);
  });

  it("should return error response when both methods fail", async () => {
    let callCount = 0;
    const mockClient = {
      messages: {
        create: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error("Structured output error"));
          }
          // Fallback returns invalid JSON
          return Promise.resolve({
            content: [{ type: "text", text: "This is not JSON at all" }],
          });
        }),
      },
    } as unknown as Anthropic;
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([]);
    const config = createConfig();

    const result = await evaluateWithFallback(
      mockClient,
      scenario,
      transcript,
      detections,
      config,
    );

    // Should return default error response
    expect(result.quality_score).toBe(1);
    expect(result.trigger_accuracy).toBe("incorrect");
    expect(result.issues.some((i) => i.includes("Failed to parse"))).toBe(true);
    expect(result.summary).toContain("parsing error");
  });
});
