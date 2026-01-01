import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  analyzeAgent,
  analyzeAgents,
  extractAgentExamples,
} from "../../../../src/stages/1-analysis/agent-analyzer.js";

const fixturesPath = path.resolve(process.cwd(), "tests/fixtures");
const validPluginPath = path.join(fixturesPath, "valid-plugin");

describe("extractAgentExamples", () => {
  it("extracts example blocks", () => {
    const description = `
<example>
Context: User has code
user: "Review my code"
assistant: "I'll review it"
<commentary>Triggered by review request</commentary>
</example>
    `;

    const examples = extractAgentExamples(description);

    expect(examples).toHaveLength(1);
    expect(examples[0]?.user_message).toBe("Review my code");
    expect(examples[0]?.expected_response).toBe("I'll review it");
    expect(examples[0]?.context).toBe("User has code");
    expect(examples[0]?.commentary).toBe("Triggered by review request");
  });

  it("handles multiple example blocks", () => {
    const description = `
<example>
user: "First example"
assistant: "Response 1"
</example>
<example>
user: "Second example"
assistant: "Response 2"
</example>
    `;

    const examples = extractAgentExamples(description);

    expect(examples).toHaveLength(2);
    expect(examples[0]?.user_message).toBe("First example");
    expect(examples[1]?.user_message).toBe("Second example");
  });

  it("handles missing optional fields", () => {
    const description = `
<example>
user: "Just a message"
assistant: "Just a response"
</example>
    `;

    const examples = extractAgentExamples(description);

    expect(examples).toHaveLength(1);
    expect(examples[0]?.context).toBe("");
    expect(examples[0]?.commentary).toBe("");
  });

  it("handles multi-line content", () => {
    const description = `
<example>
Context: This is a
multi-line context
user: "This is a
multi-line message"
assistant: "Multi-line
response"
</example>
    `;

    const examples = extractAgentExamples(description);

    expect(examples).toHaveLength(1);
    // State machine parser joins lines with spaces
    expect(examples[0]?.user_message).toContain("multi-line");
  });

  it("returns empty array for no examples", () => {
    const examples = extractAgentExamples("No examples here");
    expect(examples).toHaveLength(0);
  });
});

describe("analyzeAgent", () => {
  it("parses agent from markdown file", () => {
    const agentPath = path.join(validPluginPath, "agents", "test-agent.md");
    const agent = analyzeAgent(agentPath);

    expect(agent.name).toBe("test-agent");
    expect(agent.model).toBe("inherit");
    expect(agent.tools).toContain("Read");
    expect(agent.tools).toContain("Grep");
    expect(agent.example_triggers.length).toBeGreaterThan(0);
  });

  it("extracts example triggers", () => {
    const agentPath = path.join(validPluginPath, "agents", "test-agent.md");
    const agent = analyzeAgent(agentPath);

    const examples = agent.example_triggers;
    expect(examples.length).toBeGreaterThanOrEqual(1);

    const firstExample = examples[0];
    expect(firstExample?.user_message).toContain("Review my code");
  });
});

describe("analyzeAgents", () => {
  it("analyzes multiple agents", () => {
    const agentPaths = [
      path.join(validPluginPath, "agents", "test-agent.md"),
      path.join(validPluginPath, "agents", "helper-agent.md"),
    ];
    const agents = analyzeAgents(agentPaths);

    expect(agents).toHaveLength(2);
    expect(agents.map((a) => a.name)).toContain("test-agent");
    expect(agents.map((a) => a.name)).toContain("helper-agent");
  });
});
