import path from "node:path";

import { describe, expect, it, vi } from "vitest";

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

  describe("state machine fallback parser", () => {
    it("forces state machine fallback when no assistant line present", () => {
      // This MUST trigger state machine because regex requires \nassistant: lookahead
      // Without assistant: line, regex pattern fails completely
      const description = `
<example>
Context: User wants help
user: Just a user message with no assistant response
</example>
      `;

      const examples = extractAgentExamples(description);

      expect(examples).toHaveLength(1);
      expect(examples[0]?.user_message).toBe(
        "Just a user message with no assistant response",
      );
      expect(examples[0]?.expected_response).toBe("");
      expect(examples[0]?.context).toBe("User wants help");
    });

    it("forces state machine when assistant has no newline boundary", () => {
      // Regex requires \n<commentary> or </example> after assistant
      // By having content between assistant and </example> without proper boundary
      const description = `
<example>
user: Simple message
assistant: Response</example>
      `;
      // Note: </example> is on same line as assistant - regex lookahead fails

      const examples = extractAgentExamples(description);

      expect(examples).toHaveLength(1);
      expect(examples[0]?.user_message).toBe("Simple message");
    });

    it("falls back to state machine when regex cannot match user content", () => {
      // This format breaks regex because the non-greedy [\s\S]*? can't properly
      // capture user content when there's no clear boundary before assistant:
      // The regex needs \nassistant: lookahead, but here content flows differently
      const description = `
<example>
Context: Testing fallback
user: Hello
there friend
assistant: Response here
</example>
      `;

      const examples = extractAgentExamples(description);

      expect(examples).toHaveLength(1);
      expect(examples[0]?.user_message).toContain("Hello");
      expect(examples[0]?.context).toBe("Testing fallback");
    });

    it("handles unquoted user and assistant content via state machine", () => {
      const description = `
<example>
user: This message has no quotes
assistant: Neither does this response
</example>
      `;

      const examples = extractAgentExamples(description);

      expect(examples).toHaveLength(1);
      expect(examples[0]?.user_message).toBe("This message has no quotes");
      expect(examples[0]?.expected_response).toBe("Neither does this response");
    });

    it("handles content with embedded colons via state machine", () => {
      const description = `
<example>
Context: User asking about time: format
user: What time is it: morning or evening?
assistant: The time: check your clock
<commentary>Tests colon handling</commentary>
</example>
      `;

      const examples = extractAgentExamples(description);

      expect(examples).toHaveLength(1);
      expect(examples[0]?.user_message).toContain("What time is it");
    });

    it("parses examples with continuation lines in user message", () => {
      const description = `
<example>
user: First line
second line continues
third line too
assistant: Got all three lines
</example>
      `;

      const examples = extractAgentExamples(description);

      expect(examples).toHaveLength(1);
      // State machine joins lines with spaces
      expect(examples[0]?.user_message).toContain("First line");
      expect(examples[0]?.user_message).toContain("second line");
      expect(examples[0]?.user_message).toContain("third line");
    });

    it("parses examples with continuation lines in assistant message", () => {
      const description = `
<example>
user: Simple question
assistant: First part of response
continuing the response
more content here
<commentary>Multi-line response</commentary>
</example>
      `;

      const examples = extractAgentExamples(description);

      expect(examples).toHaveLength(1);
      expect(examples[0]?.expected_response).toContain("First part");
      expect(examples[0]?.expected_response).toContain("continuing");
    });

    it("parses examples with multi-line context", () => {
      const description = `
<example>
Context: This context spans
multiple lines of text
with various details
user: Question here
assistant: Answer here
</example>
      `;

      const examples = extractAgentExamples(description);

      expect(examples).toHaveLength(1);
      expect(examples[0]?.context).toContain("multiple lines");
    });

    it("parses examples with multi-line commentary", () => {
      const description = `
<example>
user: Test message
assistant: Test response
<commentary>
This commentary
spans multiple
lines
</commentary>
</example>
      `;

      const examples = extractAgentExamples(description);

      expect(examples).toHaveLength(1);
      expect(examples[0]?.commentary).toContain("spans multiple");
    });

    it("handles mixed quote styles", () => {
      const description = `
<example>
user: 'Single quoted message'
assistant: "Double quoted response"
</example>
      `;

      const examples = extractAgentExamples(description);

      expect(examples).toHaveLength(1);
      // Quotes should be stripped
      expect(examples[0]?.user_message).not.toContain("'");
      expect(examples[0]?.expected_response).not.toContain('"');
    });

    it("handles empty commentary block", () => {
      const description = `
<example>
user: Message here
assistant: Response here
<commentary></commentary>
</example>
      `;

      const examples = extractAgentExamples(description);

      expect(examples).toHaveLength(1);
      expect(examples[0]?.commentary).toBe("");
    });

    it("returns null for example with no user message", () => {
      const description = `
<example>
Context: Just context
assistant: Just response
</example>
      `;

      // Should warn and skip - mock console.warn
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const examples = extractAgentExamples(description);

      expect(examples).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("handles whitespace-only lines between sections", () => {
      const description = `
<example>
user: Message with blank lines

assistant: Response after blank
</example>
      `;

      const examples = extractAgentExamples(description);

      expect(examples).toHaveLength(1);
      expect(examples[0]?.user_message).toBe("Message with blank lines");
    });

    it("parses commentary tag on separate line via state machine", () => {
      // Force state machine parsing with unquoted multi-line format
      // The <commentary> tag on its own line tests state transition
      const description = `
<example>
user: Question that spans
multiple lines here
assistant: Answer that also
spans lines
<commentary>
Commentary on its own line
More commentary
</commentary>
</example>
      `;

      const examples = extractAgentExamples(description);

      expect(examples).toHaveLength(1);
      expect(examples[0]?.commentary).toContain("Commentary on its own line");
      expect(examples[0]?.commentary).toContain("More commentary");
    });

    it("handles closing example tag transition", () => {
      // Test where </example> triggers state transition back to init
      const description = `
<example>
user: Message
assistant: Response
that continues
on multiple lines
</example>
      `;

      const examples = extractAgentExamples(description);

      expect(examples).toHaveLength(1);
      // Should capture all assistant content before </example>
      expect(examples[0]?.expected_response).toContain("continues");
    });
  });

  describe("edge cases", () => {
    it("handles assistant: appearing inside user message", () => {
      const description = `
<example>
user: "The assistant: mentioned something"
assistant: "I see you mentioned an assistant"
</example>
      `;

      const examples = extractAgentExamples(description);

      expect(examples).toHaveLength(1);
      expect(examples[0]?.user_message).toContain("assistant: mentioned");
    });

    it("handles user: appearing inside assistant message", () => {
      const description = `
<example>
user: "Regular question"
assistant: "The user: asked a question"
</example>
      `;

      const examples = extractAgentExamples(description);

      expect(examples).toHaveLength(1);
      expect(examples[0]?.expected_response).toContain("user: asked");
    });

    it("handles example blocks with extra whitespace", () => {
      const description = `

<example>

Context:   Lots of spaces   
user:    Spaced out message    
assistant:    Spaced response    

</example>

      `;

      const examples = extractAgentExamples(description);

      expect(examples).toHaveLength(1);
      expect(examples[0]?.user_message).toBeTruthy();
    });

    it("handles case-insensitive section names", () => {
      const description = `
<example>
CONTEXT: Uppercase context
USER: Uppercase user message
ASSISTANT: Uppercase response
<COMMENTARY>Uppercase commentary</COMMENTARY>
</example>
      `;

      const examples = extractAgentExamples(description);

      expect(examples).toHaveLength(1);
      expect(examples[0]?.user_message).toBe("Uppercase user message");
      expect(examples[0]?.context).toBe("Uppercase context");
    });

    it("handles malformed example blocks gracefully", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const description = `
<example>
This has no proper structure at all
Just random text
</example>
      `;

      const examples = extractAgentExamples(description);

      expect(examples).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("parses multiple examples with mixed formatting", () => {
      const description = `
<example>
user: "Quoted example"
assistant: "Quoted response"
</example>

<example>
user: Unquoted example
assistant: Unquoted response
</example>

<example>
Context: With context
user: Third example
assistant: Third response
<commentary>Has commentary</commentary>
</example>
      `;

      const examples = extractAgentExamples(description);

      expect(examples).toHaveLength(3);
      expect(examples[0]?.user_message).toBe("Quoted example");
      expect(examples[1]?.user_message).toBe("Unquoted example");
      expect(examples[2]?.context).toBe("With context");
    });
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
