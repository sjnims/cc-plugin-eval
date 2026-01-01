/**
 * Unit tests for skill-scenario-generator.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";

import {
  buildSkillPrompt,
  parseSkillScenarioResponse,
  createFallbackSkillScenarios,
  generateSkillScenarios,
  generateAllSkillScenarios,
} from "../../../../src/stages/2-generation/skill-scenario-generator.js";
import type {
  SkillComponent,
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

describe("buildSkillPrompt", () => {
  const skill: SkillComponent = {
    name: "hook-development",
    path: "/path/skill.md",
    description: "Helps create Claude Code hooks",
    trigger_phrases: [
      "create a hook",
      "add a PreToolUse hook",
      "implement hook",
    ],
    semantic_intents: [
      {
        action: "create",
        object: "hook",
        raw_phrase: "create a hook",
      },
    ],
  };

  it("should include skill name and description", () => {
    const prompt = buildSkillPrompt(skill, 10, false);

    expect(prompt).toContain("hook-development");
    expect(prompt).toContain("Helps create Claude Code hooks");
  });

  it("should include trigger phrases", () => {
    const prompt = buildSkillPrompt(skill, 10, false);

    expect(prompt).toContain("create a hook");
    expect(prompt).toContain("add a PreToolUse hook");
    expect(prompt).toContain("implement hook");
  });

  it("should include scenario count", () => {
    const prompt = buildSkillPrompt(skill, 15, false);

    expect(prompt).toContain("15");
  });

  it("should include type distribution", () => {
    const prompt = buildSkillPrompt(skill, 10, false);

    expect(prompt).toContain("direct");
    expect(prompt).toContain("paraphrased");
    expect(prompt).toContain("edge_case");
    expect(prompt).toContain("negative");
  });

  it("should include semantic when enabled", () => {
    const prompt = buildSkillPrompt(skill, 10, true);

    expect(prompt).toContain("semantic");
  });
});

describe("parseSkillScenarioResponse", () => {
  const skill: SkillComponent = {
    name: "hook-development",
    path: "/path/skill.md",
    description: "Helps create hooks",
    trigger_phrases: ["create a hook"],
    semantic_intents: [],
  };

  it("should parse valid JSON response", () => {
    const response = `[
      {
        "user_prompt": "create a hook for me",
        "scenario_type": "direct",
        "expected_trigger": true,
        "reasoning": "Direct match of trigger phrase"
      }
    ]`;

    const scenarios = parseSkillScenarioResponse(response, skill);

    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].user_prompt).toBe("create a hook for me");
    expect(scenarios[0].scenario_type).toBe("direct");
    expect(scenarios[0].expected_trigger).toBe(true);
  });

  it("should handle markdown code blocks", () => {
    const response = `\`\`\`json
[
  {
    "user_prompt": "help with hooks",
    "scenario_type": "paraphrased",
    "expected_trigger": true,
    "reasoning": "Paraphrased request"
  }
]
\`\`\``;

    const scenarios = parseSkillScenarioResponse(response, skill);

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

    const scenarios = parseSkillScenarioResponse(response, skill);

    expect(scenarios[0].component_ref).toBe("hook-development");
    expect(scenarios[0].component_type).toBe("skill");
    expect(scenarios[0].expected_component).toBe("hook-development");
  });

  it("should generate unique IDs with type and index", () => {
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

    const scenarios = parseSkillScenarioResponse(response, skill);

    expect(scenarios[0].id).toBe("hook-development-direct-0");
    expect(scenarios[1].id).toBe("hook-development-direct-1");
  });

  it("should include semantic fields when present", () => {
    const response = `[
      {
        "user_prompt": "build a hook",
        "scenario_type": "semantic",
        "expected_trigger": true,
        "reasoning": "Synonym variation",
        "original_trigger_phrase": "create a hook",
        "semantic_variation_type": "synonym"
      }
    ]`;

    const scenarios = parseSkillScenarioResponse(response, skill);

    expect(scenarios[0].original_trigger_phrase).toBe("create a hook");
    expect(scenarios[0].semantic_variation_type).toBe("synonym");
  });

  it("should return empty array for invalid JSON", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(vi.fn());

    const response = "Not valid JSON at all";
    const scenarios = parseSkillScenarioResponse(response, skill);

    expect(scenarios).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to parse skill scenarios"),
      expect.any(SyntaxError),
    );
    consoleSpy.mockRestore();
  });

  it("should parse multiple scenario types", () => {
    const response = `[
      {
        "user_prompt": "create a hook",
        "scenario_type": "direct",
        "expected_trigger": true,
        "reasoning": "direct"
      },
      {
        "user_prompt": "what is the weather",
        "scenario_type": "negative",
        "expected_trigger": false,
        "reasoning": "unrelated"
      },
      {
        "user_prompt": "hook pls",
        "scenario_type": "edge_case",
        "expected_trigger": true,
        "reasoning": "informal"
      }
    ]`;

    const scenarios = parseSkillScenarioResponse(response, skill);

    expect(scenarios).toHaveLength(3);
    expect(scenarios.map((s) => s.scenario_type)).toEqual([
      "direct",
      "negative",
      "edge_case",
    ]);
  });
});

describe("createFallbackSkillScenarios", () => {
  it("should create direct scenarios from trigger phrases", () => {
    const skill: SkillComponent = {
      name: "hook-development",
      path: "/path/skill.md",
      description: "Create hooks",
      trigger_phrases: ["create a hook", "add hook"],
      semantic_intents: [],
    };

    const scenarios = createFallbackSkillScenarios(skill);

    const directScenarios = scenarios.filter(
      (s) => s.scenario_type === "direct",
    );
    expect(directScenarios).toHaveLength(2);
    expect(directScenarios[0].user_prompt).toBe("create a hook");
    expect(directScenarios[1].user_prompt).toBe("add hook");
  });

  it("should include one negative scenario", () => {
    const skill: SkillComponent = {
      name: "test-skill",
      path: "/path/skill.md",
      description: "Test",
      trigger_phrases: ["test trigger"],
      semantic_intents: [],
    };

    const scenarios = createFallbackSkillScenarios(skill);

    const negativeScenarios = scenarios.filter(
      (s) => s.scenario_type === "negative",
    );
    expect(negativeScenarios).toHaveLength(1);
    expect(negativeScenarios[0].expected_trigger).toBe(false);
  });

  it("should set correct component metadata", () => {
    const skill: SkillComponent = {
      name: "my-skill",
      path: "/path/skill.md",
      description: "Test",
      trigger_phrases: ["trigger"],
      semantic_intents: [],
    };

    const scenarios = createFallbackSkillScenarios(skill);

    for (const scenario of scenarios) {
      expect(scenario.component_ref).toBe("my-skill");
      expect(scenario.component_type).toBe("skill");
      expect(scenario.expected_component).toBe("my-skill");
    }
  });

  it("should generate fallback IDs", () => {
    const skill: SkillComponent = {
      name: "test-skill",
      path: "/path/skill.md",
      description: "Test",
      trigger_phrases: ["trigger1", "trigger2"],
      semantic_intents: [],
    };

    const scenarios = createFallbackSkillScenarios(skill);

    expect(scenarios[0].id).toContain("fallback");
    expect(scenarios[0].id).toContain("direct");
  });

  it("should include reasoning", () => {
    const skill: SkillComponent = {
      name: "test-skill",
      path: "/path/skill.md",
      description: "Test",
      trigger_phrases: ["trigger"],
      semantic_intents: [],
    };

    const scenarios = createFallbackSkillScenarios(skill);

    for (const scenario of scenarios) {
      expect(scenario.reasoning).toContain("Fallback");
    }
  });
});

describe("generateSkillScenarios", () => {
  let mockClient: { messages: { create: Mock } };
  const skill: SkillComponent = {
    name: "hook-development",
    path: "/path/skill.md",
    description: "Helps create Claude Code hooks",
    trigger_phrases: ["create a hook", "add a PreToolUse hook"],
    semantic_intents: [
      {
        action: "create",
        object: "hook",
        raw_phrase: "create a hook",
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
              user_prompt: "create a hook for validation",
              scenario_type: "direct",
              expected_trigger: true,
              reasoning: "Direct match of trigger phrase",
            },
            {
              user_prompt: "help me build a hook",
              scenario_type: "paraphrased",
              expected_trigger: true,
              reasoning: "Paraphrased request",
            },
          ]),
        },
      ],
    };
    mockClient.messages.create.mockResolvedValue(mockResponse);

    const scenarios = await generateSkillScenarios(
      mockClient as unknown as Anthropic,
      skill,
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
    expect(scenarios[0].user_prompt).toBe("create a hook for validation");
    expect(scenarios[0].component_type).toBe("skill");
  });

  it("should handle empty response gracefully", async () => {
    const mockResponse = {
      content: [{ type: "text", text: "[]" }],
    };
    mockClient.messages.create.mockResolvedValue(mockResponse);

    const scenarios = await generateSkillScenarios(
      mockClient as unknown as Anthropic,
      skill,
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

    const scenarios = await generateSkillScenarios(
      mockClient as unknown as Anthropic,
      skill,
      config,
    );

    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].user_prompt).toBe("test");
  });

  it("should throw when no text content in response", async () => {
    const mockResponse = {
      content: [{ type: "image", source: {} }],
    };
    mockClient.messages.create.mockResolvedValue(mockResponse);

    await expect(
      generateSkillScenarios(mockClient as unknown as Anthropic, skill, config),
    ).rejects.toThrow("No text content in response");
  });

  it("should use correct model from config", async () => {
    const mockResponse = {
      content: [{ type: "text", text: "[]" }],
    };
    mockClient.messages.create.mockResolvedValue(mockResponse);

    const sonnetConfig = { ...config, model: "sonnet" };
    await generateSkillScenarios(
      mockClient as unknown as Anthropic,
      skill,
      sonnetConfig,
    );

    expect(mockClient.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.stringContaining("sonnet"),
      }),
    );
  });

  it("should use max_tokens from config", async () => {
    const mockResponse = {
      content: [{ type: "text", text: "[]" }],
    };
    mockClient.messages.create.mockResolvedValue(mockResponse);

    const configWithTokens = { ...config, max_tokens: 2000 };
    await generateSkillScenarios(
      mockClient as unknown as Anthropic,
      skill,
      configWithTokens,
    );

    expect(mockClient.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 2000,
      }),
    );
  });
});

describe("generateAllSkillScenarios", () => {
  let mockClient: { messages: { create: Mock } };
  const skills: SkillComponent[] = [
    {
      name: "skill-one",
      path: "/path/skill1.md",
      description: "First skill",
      trigger_phrases: ["trigger one"],
      semantic_intents: [],
    },
    {
      name: "skill-two",
      path: "/path/skill2.md",
      description: "Second skill",
      trigger_phrases: ["trigger two"],
      semantic_intents: [],
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

  it("should generate scenarios for all skills", async () => {
    mockClient.messages.create
      .mockResolvedValueOnce({
        content: [
          {
            type: "text",
            text: JSON.stringify([
              {
                user_prompt: "skill one prompt",
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
                user_prompt: "skill two prompt",
                scenario_type: "direct",
                expected_trigger: true,
                reasoning: "test",
              },
            ]),
          },
        ],
      });

    const scenarios = await generateAllSkillScenarios(
      mockClient as unknown as Anthropic,
      skills,
      config,
    );

    expect(mockClient.messages.create).toHaveBeenCalledTimes(2);
    expect(scenarios).toHaveLength(2);
    expect(scenarios[0].component_ref).toBe("skill-one");
    expect(scenarios[1].component_ref).toBe("skill-two");
  });

  it("should call progress callback", async () => {
    mockClient.messages.create.mockResolvedValue({
      content: [{ type: "text", text: "[]" }],
    });

    const progressCallback = vi.fn();
    await generateAllSkillScenarios(
      mockClient as unknown as Anthropic,
      skills,
      config,
      progressCallback,
    );

    // Called before and after each skill
    expect(progressCallback).toHaveBeenCalledWith(0, 2, "skill-one");
    expect(progressCallback).toHaveBeenCalledWith(1, 2, "skill-one");
    expect(progressCallback).toHaveBeenCalledWith(1, 2, "skill-two");
    expect(progressCallback).toHaveBeenCalledWith(2, 2, "skill-two");
  });

  it("should return empty array for empty skills list", async () => {
    const scenarios = await generateAllSkillScenarios(
      mockClient as unknown as Anthropic,
      [],
      config,
    );

    expect(scenarios).toEqual([]);
    expect(mockClient.messages.create).not.toHaveBeenCalled();
  });

  it("should aggregate scenarios from all skills", async () => {
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
                scenario_type: "negative",
                expected_trigger: false,
                reasoning: "r2",
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
                scenario_type: "direct",
                expected_trigger: true,
                reasoning: "r3",
              },
            ]),
          },
        ],
      });

    const scenarios = await generateAllSkillScenarios(
      mockClient as unknown as Anthropic,
      skills,
      config,
    );

    expect(scenarios).toHaveLength(3);
  });
});
