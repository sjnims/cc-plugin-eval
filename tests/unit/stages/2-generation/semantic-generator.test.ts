/**
 * Unit tests for semantic-generator.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";

import {
  parseSemanticVariations,
  wouldTriggerDifferentComponent,
  extractAllComponentKeywords,
  generateSemanticScenarios,
  generateSemanticVariations,
  generateSkillSemanticScenarios,
  generateAllSemanticScenarios,
} from "../../../../src/stages/2-generation/semantic-generator.js";
import type {
  AnalysisOutput,
  SemanticVariation,
  SkillComponent,
} from "../../../../src/types/index.js";

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(),
}));

// Mock the retry utility to avoid delays in tests
vi.mock("../../../../src/utils/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

describe("parseSemanticVariations", () => {
  it("should parse valid JSON response", () => {
    const response = `[
      {
        "original": "create a hook",
        "variation": "build a hook",
        "variation_type": "synonym",
        "explanation": "build and create are synonyms"
      }
    ]`;

    const result = parseSemanticVariations(response, "create a hook");

    expect(result).toHaveLength(1);
    expect(result[0].original_trigger).toBe("create a hook");
    expect(result[0].variation).toBe("build a hook");
    expect(result[0].variation_type).toBe("synonym");
  });

  it("should handle markdown code blocks", () => {
    const response = `\`\`\`json
[
  {
    "original": "create a hook",
    "variation": "make a hook",
    "variation_type": "synonym",
    "explanation": "make and create are synonyms"
  }
]
\`\`\``;

    const result = parseSemanticVariations(response, "create a hook");

    expect(result).toHaveLength(1);
    expect(result[0].variation).toBe("make a hook");
  });

  it("should handle multiple variations", () => {
    const response = `[
      {
        "original": "create a hook",
        "variation": "build a hook",
        "variation_type": "synonym",
        "explanation": "synonym"
      },
      {
        "original": "create a hook",
        "variation": "I need a hook",
        "variation_type": "structure",
        "explanation": "different structure"
      }
    ]`;

    const result = parseSemanticVariations(response, "create a hook");

    expect(result).toHaveLength(2);
  });

  it("should return empty array for invalid JSON", () => {
    const response = "This is not valid JSON";

    const result = parseSemanticVariations(response, "create a hook");

    expect(result).toEqual([]);
  });

  it("should return empty array for empty response", () => {
    const result = parseSemanticVariations("", "create a hook");

    expect(result).toEqual([]);
  });
});

describe("wouldTriggerDifferentComponent", () => {
  const componentKeywords = ["hook", "skill", "agent", "command"];

  it("should return false when no component type change", () => {
    const result = wouldTriggerDifferentComponent(
      "create a hook",
      "build a hook",
      componentKeywords,
    );

    expect(result).toBe(false);
  });

  it("should return true when component type changes", () => {
    const result = wouldTriggerDifferentComponent(
      "create a hook",
      "create a skill",
      componentKeywords,
    );

    expect(result).toBe(true);
  });

  it("should return false when original has no component type", () => {
    const result = wouldTriggerDifferentComponent(
      "help me with something",
      "I need help with a hook",
      componentKeywords,
    );

    expect(result).toBe(false);
  });

  it("should return true when variation mentions different component keyword", () => {
    const result = wouldTriggerDifferentComponent(
      "create a hook",
      "create a hook and add an agent",
      ["hook", "agent", "mcp-integration"],
    );

    expect(result).toBe(true);
  });

  it("should be case insensitive", () => {
    const result = wouldTriggerDifferentComponent(
      "Create A HOOK",
      "BUILD a Hook",
      componentKeywords,
    );

    expect(result).toBe(false);
  });
});

describe("extractAllComponentKeywords", () => {
  const mockAnalysis: AnalysisOutput = {
    plugin_name: "test-plugin",
    plugin_path: "/path/to/plugin",
    components: {
      skills: [
        {
          name: "hook-development",
          path: "/path/skill.md",
          description: "Create hooks",
          trigger_phrases: ["create a hook"],
          semantic_intents: [],
        },
        {
          name: "mcp-integration",
          path: "/path/skill2.md",
          description: "MCP servers",
          trigger_phrases: ["add mcp"],
          semantic_intents: [],
        },
      ],
      agents: [
        {
          name: "code-reviewer",
          path: "/path/agent.md",
          description: "Reviews code",
          model: "haiku",
          example_triggers: [],
        },
      ],
      commands: [
        {
          name: "commit",
          path: "/path/cmd.md",
          plugin_prefix: "test-plugin",
          namespace: "",
          fullName: "commit",
          description: "Git commit",
          disable_model_invocation: false,
        },
      ],
    },
    extraction_metadata: {
      total_components: 4,
      components_by_type: { skill: 2, agent: 1, command: 1 },
      extraction_timestamp: new Date().toISOString(),
    },
  };

  it("should extract skill names and parts", () => {
    const keywords = extractAllComponentKeywords(mockAnalysis);

    expect(keywords).toContain("hook-development");
    expect(keywords).toContain("hook");
    expect(keywords).toContain("development");
    expect(keywords).toContain("mcp-integration");
    expect(keywords).toContain("integration");
  });

  it("should extract agent names", () => {
    const keywords = extractAllComponentKeywords(mockAnalysis);

    expect(keywords).toContain("code-reviewer");
    expect(keywords).toContain("code");
    expect(keywords).toContain("reviewer");
  });

  it("should extract command names", () => {
    const keywords = extractAllComponentKeywords(mockAnalysis);

    expect(keywords).toContain("commit");
  });

  it("should deduplicate keywords", () => {
    const keywords = extractAllComponentKeywords(mockAnalysis);
    const uniqueKeywords = new Set(keywords);

    expect(keywords).toHaveLength(uniqueKeywords.size);
  });

  it("should filter out short words", () => {
    const keywords = extractAllComponentKeywords(mockAnalysis);

    // Words <= 3 chars should be filtered (except full names with hyphens)
    const simpleKeywords = keywords.filter((k) => !k.includes("-"));
    const shortKeywords = simpleKeywords.filter((k) => k.length <= 3);

    expect(shortKeywords).toHaveLength(0);
  });
});

describe("generateSemanticScenarios", () => {
  const skill: SkillComponent = {
    name: "hook-development",
    path: "/path/skill.md",
    description: "Create hooks",
    trigger_phrases: ["create a hook"],
    semantic_intents: [],
  };

  it("should generate scenarios from variations", () => {
    const variations: SemanticVariation[] = [
      {
        original_trigger: "create a hook",
        variation: "build a hook",
        variation_type: "synonym",
        explanation: "synonym test",
      },
      {
        original_trigger: "create a hook",
        variation: "I need a hook",
        variation_type: "structure",
        explanation: "structure test",
      },
    ];

    const scenarios = generateSemanticScenarios(skill, variations);

    expect(scenarios).toHaveLength(2);
    expect(scenarios[0].scenario_type).toBe("semantic");
    expect(scenarios[0].user_prompt).toBe("build a hook");
    expect(scenarios[0].expected_trigger).toBe(true);
  });

  it("should set correct component metadata", () => {
    const variations: SemanticVariation[] = [
      {
        original_trigger: "create a hook",
        variation: "build a hook",
        variation_type: "synonym",
        explanation: "test",
      },
    ];

    const scenarios = generateSemanticScenarios(skill, variations);

    expect(scenarios[0].component_ref).toBe("hook-development");
    expect(scenarios[0].component_type).toBe("skill");
    expect(scenarios[0].expected_component).toBe("hook-development");
  });

  it("should include semantic variation metadata", () => {
    const variations: SemanticVariation[] = [
      {
        original_trigger: "create a hook",
        variation: "build a hook",
        variation_type: "synonym",
        explanation: "synonym explanation",
      },
    ];

    const scenarios = generateSemanticScenarios(skill, variations);

    expect(scenarios[0].original_trigger_phrase).toBe("create a hook");
    expect(scenarios[0].semantic_variation_type).toBe("synonym");
    expect(scenarios[0].reasoning).toBe("synonym explanation");
  });

  it("should generate unique IDs", () => {
    const variations: SemanticVariation[] = [
      {
        original_trigger: "create a hook",
        variation: "build a hook",
        variation_type: "synonym",
        explanation: "test",
      },
      {
        original_trigger: "create a hook",
        variation: "make a hook",
        variation_type: "synonym",
        explanation: "test",
      },
    ];

    const scenarios = generateSemanticScenarios(skill, variations);

    expect(scenarios[0].id).not.toBe(scenarios[1].id);
    expect(scenarios[0].id).toContain("semantic");
    expect(scenarios[1].id).toContain("semantic");
  });

  it("should handle empty variations", () => {
    const scenarios = generateSemanticScenarios(skill, []);

    expect(scenarios).toEqual([]);
  });
});

describe("generateSemanticVariations", () => {
  let mockClient: { messages: { create: Mock } };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      messages: {
        create: vi.fn(),
      },
    };
  });

  it("should generate semantic variations from LLM response", async () => {
    const mockResponse = {
      content: [
        {
          type: "text",
          text: JSON.stringify([
            {
              original: "create a hook",
              variation: "build a hook",
              variation_type: "synonym",
              explanation: "build and create are synonyms",
            },
            {
              original: "create a hook",
              variation: "make a hook",
              variation_type: "synonym",
              explanation: "make and create are synonyms",
            },
          ]),
        },
      ],
    };
    mockClient.messages.create.mockResolvedValue(mockResponse);

    const variations = await generateSemanticVariations(
      mockClient as unknown as Anthropic,
      "create a hook",
      "haiku",
    );

    expect(mockClient.messages.create).toHaveBeenCalledTimes(1);
    expect(variations).toHaveLength(2);
    expect(variations[0].original_trigger).toBe("create a hook");
    expect(variations[0].variation).toBe("build a hook");
    expect(variations[0].variation_type).toBe("synonym");
  });

  it("should handle empty response", async () => {
    const mockResponse = {
      content: [{ type: "text", text: "[]" }],
    };
    mockClient.messages.create.mockResolvedValue(mockResponse);

    const variations = await generateSemanticVariations(
      mockClient as unknown as Anthropic,
      "create a hook",
      "haiku",
    );

    expect(variations).toEqual([]);
  });

  it("should handle markdown-wrapped JSON response", async () => {
    const mockResponse = {
      content: [
        {
          type: "text",
          text: '```json\n[{"original": "test", "variation": "testing", "variation_type": "structure", "explanation": "test"}]\n```',
        },
      ],
    };
    mockClient.messages.create.mockResolvedValue(mockResponse);

    const variations = await generateSemanticVariations(
      mockClient as unknown as Anthropic,
      "test",
      "haiku",
    );

    expect(variations).toHaveLength(1);
    expect(variations[0].variation).toBe("testing");
  });

  it("should return empty array on LLM error", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(vi.fn());
    mockClient.messages.create.mockRejectedValue(new Error("API error"));

    const variations = await generateSemanticVariations(
      mockClient as unknown as Anthropic,
      "create a hook",
      "haiku",
    );

    expect(variations).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("should return empty array when no text content", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(vi.fn());
    const mockResponse = {
      content: [{ type: "tool_use", id: "123", name: "test", input: {} }],
    };
    mockClient.messages.create.mockResolvedValue(mockResponse);

    const variations = await generateSemanticVariations(
      mockClient as unknown as Anthropic,
      "create a hook",
      "haiku",
    );

    expect(variations).toEqual([]);
    consoleSpy.mockRestore();
  });

  it("should use correct model", async () => {
    const mockResponse = {
      content: [{ type: "text", text: "[]" }],
    };
    mockClient.messages.create.mockResolvedValue(mockResponse);

    await generateSemanticVariations(
      mockClient as unknown as Anthropic,
      "test",
      "sonnet",
    );

    expect(mockClient.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.stringContaining("sonnet"),
      }),
    );
  });
});

describe("generateSkillSemanticScenarios", () => {
  let mockClient: { messages: { create: Mock } };
  const skill: SkillComponent = {
    name: "hook-development",
    path: "/path/skill.md",
    description: "Create hooks",
    trigger_phrases: ["create a hook", "add hook"],
    semantic_intents: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      messages: {
        create: vi.fn(),
      },
    };
  });

  it("should generate semantic scenarios for all trigger phrases", async () => {
    mockClient.messages.create
      .mockResolvedValueOnce({
        content: [
          {
            type: "text",
            text: JSON.stringify([
              {
                original: "create a hook",
                variation: "build a hook",
                variation_type: "synonym",
                explanation: "synonym",
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
                original: "add hook",
                variation: "insert hook",
                variation_type: "synonym",
                explanation: "synonym",
              },
            ]),
          },
        ],
      });

    const scenarios = await generateSkillSemanticScenarios(
      mockClient as unknown as Anthropic,
      skill,
      "haiku",
      [],
    );

    expect(mockClient.messages.create).toHaveBeenCalledTimes(2);
    expect(scenarios).toHaveLength(2);
    expect(scenarios[0].scenario_type).toBe("semantic");
  });

  it("should filter out variations that trigger different components", async () => {
    // Use a skill with only one trigger phrase for this test
    const singleTriggerSkill: SkillComponent = {
      name: "hook-development",
      path: "/path/skill.md",
      description: "Create hooks",
      trigger_phrases: ["create a hook"], // Only one trigger phrase
      semantic_intents: [],
    };

    mockClient.messages.create.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify([
            {
              original: "create a hook",
              variation: "create a skill", // Should be filtered - different component
              variation_type: "related_concept",
              explanation: "related",
            },
            {
              original: "create a hook",
              variation: "build a hook", // Should pass
              variation_type: "synonym",
              explanation: "synonym",
            },
          ]),
        },
      ],
    });

    const scenarios = await generateSkillSemanticScenarios(
      mockClient as unknown as Anthropic,
      singleTriggerSkill,
      "haiku",
      ["skill", "agent", "hook"],
    );

    // Only "build a hook" should pass the filter
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].user_prompt).toBe("build a hook");
  });

  it("should return empty array when no variations generated", async () => {
    mockClient.messages.create.mockResolvedValue({
      content: [{ type: "text", text: "[]" }],
    });

    const scenarios = await generateSkillSemanticScenarios(
      mockClient as unknown as Anthropic,
      skill,
      "haiku",
      [],
    );

    expect(scenarios).toEqual([]);
  });
});

describe("generateAllSemanticScenarios", () => {
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

  const mockAnalysis: AnalysisOutput = {
    plugin_name: "test-plugin",
    plugin_path: "/path/to/plugin",
    components: {
      skills: skills,
      agents: [],
      commands: [],
    },
    extraction_metadata: {
      total_components: 2,
      components_by_type: { skill: 2, agent: 0, command: 0 },
      extraction_timestamp: new Date().toISOString(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      messages: {
        create: vi.fn(),
      },
    };
  });

  it("should generate semantic scenarios for all skills", async () => {
    mockClient.messages.create
      .mockResolvedValueOnce({
        content: [
          {
            type: "text",
            text: JSON.stringify([
              {
                original: "trigger one",
                variation: "variation one",
                variation_type: "synonym",
                explanation: "test",
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
                original: "trigger two",
                variation: "variation two",
                variation_type: "synonym",
                explanation: "test",
              },
            ]),
          },
        ],
      });

    const scenarios = await generateAllSemanticScenarios(
      mockClient as unknown as Anthropic,
      skills,
      "haiku",
      mockAnalysis,
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
    await generateAllSemanticScenarios(
      mockClient as unknown as Anthropic,
      skills,
      "haiku",
      mockAnalysis,
      progressCallback,
    );

    expect(progressCallback).toHaveBeenCalledWith(0, 2, "skill-one");
    expect(progressCallback).toHaveBeenCalledWith(1, 2, "skill-one");
    expect(progressCallback).toHaveBeenCalledWith(1, 2, "skill-two");
    expect(progressCallback).toHaveBeenCalledWith(2, 2, "skill-two");
  });

  it("should return empty array for empty skills list", async () => {
    const scenarios = await generateAllSemanticScenarios(
      mockClient as unknown as Anthropic,
      [],
      "haiku",
      mockAnalysis,
    );

    expect(scenarios).toEqual([]);
    expect(mockClient.messages.create).not.toHaveBeenCalled();
  });

  it("should extract and use component keywords for filtering", async () => {
    // Use a skill with a trigger phrase containing a component type word
    // (the filter only kicks in when original has a component type)
    const skillWithComponentType: SkillComponent = {
      name: "skill-one",
      path: "/path/skill1.md",
      description: "First skill for hooks",
      trigger_phrases: ["create a hook"], // Contains "hook" component type
      semantic_intents: [],
    };

    mockClient.messages.create.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify([
            {
              original: "create a hook",
              variation: "create a skill", // Changes component type from hook to skill
              variation_type: "related_concept",
              explanation: "test",
            },
          ]),
        },
      ],
    });

    const scenarios = await generateAllSemanticScenarios(
      mockClient as unknown as Anthropic,
      [skillWithComponentType],
      "haiku",
      mockAnalysis,
    );

    // Should be filtered out because it changes component type (hook → skill)
    expect(scenarios).toHaveLength(0);
  });
});
