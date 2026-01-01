/**
 * Unit tests for agent-scenario-generator.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";

import {
  buildAgentPrompt,
  parseAgentScenarioResponse,
  createFallbackAgentScenarios,
  generateAgentScenarios,
  generateAllAgentScenarios,
} from "../../../../src/stages/2-generation/agent-scenario-generator.js";
import type {
  AgentComponent,
  GenerationConfig,
} from "../../../../src/types/index.js";

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(),
}));

// Mock the retry utility to avoid delays in tests
vi.mock("../../../../src/utils/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

describe("buildAgentPrompt", () => {
  const agent: AgentComponent = {
    name: "code-reviewer",
    path: "/path/agent.md",
    description: "Reviews code for quality and best practices",
    model: "sonnet",
    tools: ["Read", "Grep", "Glob"],
    example_triggers: [
      {
        context: "After writing code",
        user_message: "Please review my changes",
        expected_response: "I will review your changes",
        commentary: "Direct review request",
      },
      {
        context: "PR review",
        user_message: "Review this PR for issues",
        expected_response: "Reviewing the PR",
        commentary: "PR context",
      },
    ],
  };

  it("should include agent name and description", () => {
    const prompt = buildAgentPrompt(agent, 10);

    expect(prompt).toContain("code-reviewer");
    expect(prompt).toContain("Reviews code for quality and best practices");
  });

  it("should include model", () => {
    const prompt = buildAgentPrompt(agent, 10);

    expect(prompt).toContain("sonnet");
  });

  it("should include tools when present", () => {
    const prompt = buildAgentPrompt(agent, 10);

    expect(prompt).toContain("Read");
    expect(prompt).toContain("Grep");
    expect(prompt).toContain("Glob");
  });

  it("should exclude tools section when empty", () => {
    const agentNoTools: AgentComponent = {
      ...agent,
      tools: undefined,
    };

    const prompt = buildAgentPrompt(agentNoTools, 10);

    expect(prompt).not.toContain("Available Tools");
  });

  it("should include example triggers when present", () => {
    const prompt = buildAgentPrompt(agent, 10);

    expect(prompt).toContain("After writing code");
    expect(prompt).toContain("Please review my changes");
    expect(prompt).toContain("PR review");
  });

  it("should exclude examples section when empty", () => {
    const agentNoExamples: AgentComponent = {
      ...agent,
      example_triggers: [],
    };

    const prompt = buildAgentPrompt(agentNoExamples, 10);

    expect(prompt).not.toContain("Example triggers");
  });

  it("should include scenario count", () => {
    const prompt = buildAgentPrompt(agent, 15);

    expect(prompt).toContain("15");
  });

  it("should include type distribution with proactive", () => {
    const prompt = buildAgentPrompt(agent, 10);

    expect(prompt).toContain("direct");
    expect(prompt).toContain("proactive");
  });
});

describe("parseAgentScenarioResponse", () => {
  const agent: AgentComponent = {
    name: "code-reviewer",
    path: "/path/agent.md",
    description: "Reviews code",
    model: "haiku",
    example_triggers: [],
  };

  it("should parse valid JSON response", () => {
    const response = `[
      {
        "user_prompt": "review my code please",
        "scenario_type": "direct",
        "expected_trigger": true,
        "reasoning": "Direct request for code review"
      }
    ]`;

    const scenarios = parseAgentScenarioResponse(response, agent);

    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].user_prompt).toBe("review my code please");
    expect(scenarios[0].scenario_type).toBe("direct");
    expect(scenarios[0].expected_trigger).toBe(true);
  });

  it("should handle markdown code blocks", () => {
    const response = `\`\`\`json
[
  {
    "user_prompt": "check this code",
    "scenario_type": "paraphrased",
    "expected_trigger": true,
    "reasoning": "Paraphrased review request"
  }
]
\`\`\``;

    const scenarios = parseAgentScenarioResponse(response, agent);

    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].scenario_type).toBe("paraphrased");
  });

  it("should set correct component metadata", () => {
    const response = `[
      {
        "user_prompt": "test",
        "scenario_type": "direct",
        "expected_trigger": true,
        "reasoning": "test"
      }
    ]`;

    const scenarios = parseAgentScenarioResponse(response, agent);

    expect(scenarios[0].component_ref).toBe("code-reviewer");
    expect(scenarios[0].component_type).toBe("agent");
    expect(scenarios[0].expected_component).toBe("code-reviewer");
  });

  it("should parse proactive scenarios with setup messages", () => {
    const response = `[
      {
        "user_prompt": "yes, please do that",
        "scenario_type": "proactive",
        "expected_trigger": true,
        "reasoning": "Proactive after code change context",
        "setup_messages": [
          {"role": "user", "content": "I just finished implementing the feature"},
          {"role": "assistant", "content": "Great! Would you like me to review it?"}
        ]
      }
    ]`;

    const scenarios = parseAgentScenarioResponse(response, agent);

    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].scenario_type).toBe("proactive");
    expect(scenarios[0].setup_messages).toBeDefined();
    expect(scenarios[0].setup_messages).toHaveLength(2);
    expect(scenarios[0].setup_messages?.[0].role).toBe("user");
  });

  it("should not include setup_messages for non-proactive scenarios", () => {
    const response = `[
      {
        "user_prompt": "review code",
        "scenario_type": "direct",
        "expected_trigger": true,
        "reasoning": "Direct request",
        "setup_messages": [{"role": "user", "content": "ignored"}]
      }
    ]`;

    const scenarios = parseAgentScenarioResponse(response, agent);

    // setup_messages should be ignored for non-proactive
    expect(scenarios[0].setup_messages).toBeUndefined();
  });

  it("should generate unique IDs", () => {
    const response = `[
      {
        "user_prompt": "test 1",
        "scenario_type": "direct",
        "expected_trigger": true,
        "reasoning": "test"
      },
      {
        "user_prompt": "test 2",
        "scenario_type": "direct",
        "expected_trigger": true,
        "reasoning": "test"
      }
    ]`;

    const scenarios = parseAgentScenarioResponse(response, agent);

    expect(scenarios[0].id).toBe("code-reviewer-direct-0");
    expect(scenarios[1].id).toBe("code-reviewer-direct-1");
  });

  it("should return empty array for invalid JSON", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(vi.fn());

    const response = "Invalid JSON";
    const scenarios = parseAgentScenarioResponse(response, agent);

    expect(scenarios).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to parse agent scenarios"),
      expect.any(SyntaxError),
    );
    consoleSpy.mockRestore();
  });
});

describe("createFallbackAgentScenarios", () => {
  it("should create scenarios from example triggers", () => {
    const agent: AgentComponent = {
      name: "code-reviewer",
      path: "/path/agent.md",
      description: "Reviews code",
      model: "haiku",
      example_triggers: [
        {
          context: "After coding",
          user_message: "Review my changes",
          expected_response: "Reviewing",
          commentary: "Direct request",
        },
        {
          context: "PR review",
          user_message: "Check this PR",
          expected_response: "Checking",
          commentary: "PR context",
        },
      ],
    };

    const scenarios = createFallbackAgentScenarios(agent);

    const directScenarios = scenarios.filter(
      (s) => s.scenario_type === "direct",
    );
    expect(directScenarios).toHaveLength(2);
    expect(directScenarios[0].user_prompt).toBe("Review my changes");
    expect(directScenarios[1].user_prompt).toBe("Check this PR");
  });

  it("should create generic scenario when no examples", () => {
    const agent: AgentComponent = {
      name: "generic-agent",
      path: "/path/agent.md",
      description: "Does generic things for testing",
      model: "haiku",
      example_triggers: [],
    };

    const scenarios = createFallbackAgentScenarios(agent);

    const directScenarios = scenarios.filter(
      (s) => s.scenario_type === "direct",
    );
    expect(directScenarios).toHaveLength(1);
    expect(directScenarios[0].user_prompt).toContain("Help me with");
  });

  it("should include one negative scenario", () => {
    const agent: AgentComponent = {
      name: "test-agent",
      path: "/path/agent.md",
      description: "Test",
      model: "haiku",
      example_triggers: [],
    };

    const scenarios = createFallbackAgentScenarios(agent);

    const negativeScenarios = scenarios.filter(
      (s) => s.scenario_type === "negative",
    );
    expect(negativeScenarios).toHaveLength(1);
    expect(negativeScenarios[0].expected_trigger).toBe(false);
    expect(negativeScenarios[0].user_prompt).toBe(
      "What is the capital of France?",
    );
  });

  it("should set correct component metadata", () => {
    const agent: AgentComponent = {
      name: "my-agent",
      path: "/path/agent.md",
      description: "Test",
      model: "haiku",
      example_triggers: [
        {
          context: "test",
          user_message: "test",
          expected_response: "test",
          commentary: "test",
        },
      ],
    };

    const scenarios = createFallbackAgentScenarios(agent);

    for (const scenario of scenarios) {
      expect(scenario.component_ref).toBe("my-agent");
      expect(scenario.component_type).toBe("agent");
      expect(scenario.expected_component).toBe("my-agent");
    }
  });

  it("should generate fallback IDs", () => {
    const agent: AgentComponent = {
      name: "test-agent",
      path: "/path/agent.md",
      description: "Test",
      model: "haiku",
      example_triggers: [
        {
          context: "test",
          user_message: "test",
          expected_response: "test",
          commentary: "test",
        },
      ],
    };

    const scenarios = createFallbackAgentScenarios(agent);

    expect(scenarios[0].id).toContain("fallback");
  });

  it("should include context in reasoning", () => {
    const agent: AgentComponent = {
      name: "test-agent",
      path: "/path/agent.md",
      description: "Test",
      model: "haiku",
      example_triggers: [
        {
          context: "After debugging",
          user_message: "check it",
          expected_response: "checking",
          commentary: "debug context",
        },
      ],
    };

    const scenarios = createFallbackAgentScenarios(agent);

    const directScenario = scenarios.find((s) => s.scenario_type === "direct");
    expect(directScenario?.reasoning).toContain("After debugging");
  });
});

describe("generateAgentScenarios", () => {
  let mockClient: { messages: { create: Mock } };
  const agent: AgentComponent = {
    name: "code-reviewer",
    path: "/path/agent.md",
    description: "Reviews code for quality and best practices",
    model: "sonnet",
    tools: ["Read", "Grep", "Glob"],
    example_triggers: [
      {
        context: "After writing code",
        user_message: "Please review my changes",
        expected_response: "I will review your changes",
        commentary: "Direct review request",
      },
    ],
  };

  const config: GenerationConfig = {
    model: "haiku",
    scenarios_per_component: 5,
    diversity: 0.5,
    semantic_variations: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      messages: {
        create: vi.fn(),
      },
    };
  });

  it("should generate scenarios from LLM response", async () => {
    const mockResponse = {
      content: [
        {
          type: "text",
          text: JSON.stringify([
            {
              user_prompt: "review my code please",
              scenario_type: "direct",
              expected_trigger: true,
              reasoning: "Direct request for code review",
            },
            {
              user_prompt: "can you check this PR?",
              scenario_type: "paraphrased",
              expected_trigger: true,
              reasoning: "Paraphrased review request",
            },
          ]),
        },
      ],
    };
    mockClient.messages.create.mockResolvedValue(mockResponse);

    const scenarios = await generateAgentScenarios(
      mockClient as unknown as Anthropic,
      agent,
      config,
    );

    expect(mockClient.messages.create).toHaveBeenCalledTimes(1);
    expect(mockClient.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.stringContaining("haiku"),
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "user" }),
        ]),
      }),
    );
    expect(scenarios).toHaveLength(2);
    expect(scenarios[0].user_prompt).toBe("review my code please");
    expect(scenarios[0].component_type).toBe("agent");
  });

  it("should handle proactive scenarios with setup_messages", async () => {
    const mockResponse = {
      content: [
        {
          type: "text",
          text: JSON.stringify([
            {
              user_prompt: "yes, please do that",
              scenario_type: "proactive",
              expected_trigger: true,
              reasoning: "Proactive after code context",
              setup_messages: [
                { role: "user", content: "I just finished the feature" },
                {
                  role: "assistant",
                  content: "Would you like me to review it?",
                },
              ],
            },
          ]),
        },
      ],
    };
    mockClient.messages.create.mockResolvedValue(mockResponse);

    const scenarios = await generateAgentScenarios(
      mockClient as unknown as Anthropic,
      agent,
      config,
    );

    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].scenario_type).toBe("proactive");
    expect(scenarios[0].setup_messages).toHaveLength(2);
    expect(scenarios[0].setup_messages?.[0].role).toBe("user");
  });

  it("should handle empty response gracefully", async () => {
    const mockResponse = {
      content: [{ type: "text", text: "[]" }],
    };
    mockClient.messages.create.mockResolvedValue(mockResponse);

    const scenarios = await generateAgentScenarios(
      mockClient as unknown as Anthropic,
      agent,
      config,
    );

    expect(scenarios).toEqual([]);
  });

  it("should handle markdown-wrapped JSON response", async () => {
    const mockResponse = {
      content: [
        {
          type: "text",
          text: '```json\n[{"user_prompt": "test", "scenario_type": "direct", "expected_trigger": true, "reasoning": "test"}]\n```',
        },
      ],
    };
    mockClient.messages.create.mockResolvedValue(mockResponse);

    const scenarios = await generateAgentScenarios(
      mockClient as unknown as Anthropic,
      agent,
      config,
    );

    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].user_prompt).toBe("test");
  });

  it("should throw when no text content in response", async () => {
    const mockResponse = {
      content: [{ type: "tool_use", id: "123", name: "test", input: {} }],
    };
    mockClient.messages.create.mockResolvedValue(mockResponse);

    await expect(
      generateAgentScenarios(mockClient as unknown as Anthropic, agent, config),
    ).rejects.toThrow("No text content in response");
  });

  it("should use correct model from config", async () => {
    const mockResponse = {
      content: [{ type: "text", text: "[]" }],
    };
    mockClient.messages.create.mockResolvedValue(mockResponse);

    const opusConfig = { ...config, model: "opus" };
    await generateAgentScenarios(
      mockClient as unknown as Anthropic,
      agent,
      opusConfig,
    );

    expect(mockClient.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.stringContaining("opus"),
      }),
    );
  });
});

describe("generateAllAgentScenarios", () => {
  let mockClient: { messages: { create: Mock } };
  const agents: AgentComponent[] = [
    {
      name: "agent-one",
      path: "/path/agent1.md",
      description: "First agent",
      model: "haiku",
      example_triggers: [],
    },
    {
      name: "agent-two",
      path: "/path/agent2.md",
      description: "Second agent",
      model: "haiku",
      example_triggers: [],
    },
  ];

  const config: GenerationConfig = {
    model: "haiku",
    scenarios_per_component: 3,
    diversity: 0.5,
    semantic_variations: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      messages: {
        create: vi.fn(),
      },
    };
  });

  it("should generate scenarios for all agents", async () => {
    mockClient.messages.create
      .mockResolvedValueOnce({
        content: [
          {
            type: "text",
            text: JSON.stringify([
              {
                user_prompt: "agent one prompt",
                scenario_type: "direct",
                expected_trigger: true,
                reasoning: "test",
              },
            ]),
          },
        ],
      })
      .mockResolvedValueOnce({
        content: [
          {
            type: "text",
            text: JSON.stringify([
              {
                user_prompt: "agent two prompt",
                scenario_type: "direct",
                expected_trigger: true,
                reasoning: "test",
              },
            ]),
          },
        ],
      });

    const scenarios = await generateAllAgentScenarios(
      mockClient as unknown as Anthropic,
      agents,
      config,
    );

    expect(mockClient.messages.create).toHaveBeenCalledTimes(2);
    expect(scenarios).toHaveLength(2);
    expect(scenarios[0].component_ref).toBe("agent-one");
    expect(scenarios[1].component_ref).toBe("agent-two");
  });

  it("should call progress callback", async () => {
    mockClient.messages.create.mockResolvedValue({
      content: [{ type: "text", text: "[]" }],
    });

    const progressCallback = vi.fn();
    await generateAllAgentScenarios(
      mockClient as unknown as Anthropic,
      agents,
      config,
      progressCallback,
    );

    // Called before and after each agent
    expect(progressCallback).toHaveBeenCalledWith(0, 2, "agent-one");
    expect(progressCallback).toHaveBeenCalledWith(1, 2, "agent-one");
    expect(progressCallback).toHaveBeenCalledWith(1, 2, "agent-two");
    expect(progressCallback).toHaveBeenCalledWith(2, 2, "agent-two");
  });

  it("should return empty array for empty agents list", async () => {
    const scenarios = await generateAllAgentScenarios(
      mockClient as unknown as Anthropic,
      [],
      config,
    );

    expect(scenarios).toEqual([]);
    expect(mockClient.messages.create).not.toHaveBeenCalled();
  });

  it("should aggregate scenarios from all agents", async () => {
    mockClient.messages.create
      .mockResolvedValueOnce({
        content: [
          {
            type: "text",
            text: JSON.stringify([
              {
                user_prompt: "p1",
                scenario_type: "direct",
                expected_trigger: true,
                reasoning: "r1",
              },
              {
                user_prompt: "p2",
                scenario_type: "proactive",
                expected_trigger: true,
                reasoning: "r2",
                setup_messages: [{ role: "user", content: "context" }],
              },
            ]),
          },
        ],
      })
      .mockResolvedValueOnce({
        content: [
          {
            type: "text",
            text: JSON.stringify([
              {
                user_prompt: "p3",
                scenario_type: "negative",
                expected_trigger: false,
                reasoning: "r3",
              },
            ]),
          },
        ],
      });

    const scenarios = await generateAllAgentScenarios(
      mockClient as unknown as Anthropic,
      agents,
      config,
    );

    expect(scenarios).toHaveLength(3);
    expect(scenarios[1].setup_messages).toBeDefined();
  });
});
