/**
 * Agent analyzer.
 * Parses agent markdown files and extracts example blocks.
 */

import { parseFrontmatter, readText, basename } from "../../utils/index.js";

import type { AgentComponent, AgentExample } from "../../types/index.js";

/**
 * Analyze an agent file.
 *
 * @param agentPath - Path to agent markdown file
 * @returns Parsed agent component
 */
export function analyzeAgent(agentPath: string): AgentComponent {
  const content = readText(agentPath);
  const { frontmatter, body } = parseFrontmatter(content);

  // Get agent name from frontmatter or filename
  const name =
    typeof frontmatter["name"] === "string"
      ? frontmatter["name"]
      : basename(agentPath, ".md");

  // Get description from frontmatter or body
  const description =
    typeof frontmatter["description"] === "string"
      ? frontmatter["description"]
      : body;

  // Get model
  const model =
    typeof frontmatter["model"] === "string" ? frontmatter["model"] : "inherit";

  // Get tools
  let tools: string[] | undefined;
  const rawTools = frontmatter["tools"];
  if (typeof rawTools === "string") {
    tools = rawTools.split(",").map((t) => t.trim());
  } else if (Array.isArray(rawTools)) {
    tools = rawTools.filter((t): t is string => typeof t === "string");
  }

  // Extract example blocks from description/body
  const exampleTriggers = extractAgentExamples(description + "\n" + body);

  return {
    name,
    path: agentPath,
    description,
    model,
    tools,
    example_triggers: exampleTriggers,
  };
}

/**
 * Extract agent examples from description.
 *
 * Robust parser with multiple fallback strategies:
 * 1. Primary: Regex-based extraction with known patterns
 * 2. Fallback: Line-by-line state machine parsing
 *
 * @param description - Agent description text
 * @returns Array of parsed examples
 */
export function extractAgentExamples(description: string): AgentExample[] {
  const examples: AgentExample[] = [];

  // Extract all <example>...</example> blocks (handles multi-line)
  const exampleBlocks =
    description.match(/<example>[\s\S]*?<\/example>/gi) ?? [];

  for (const block of exampleBlocks) {
    try {
      // Try primary regex-based parsing
      let parsed = parseExampleWithRegex(block);

      // Fallback to state machine if regex fails
      if (!parsed?.user_message) {
        parsed = parseExampleWithStateMachine(block);
      }

      if (parsed?.user_message) {
        examples.push(parsed);
      } else {
        console.warn(
          `Could not parse example block, skipping: ${block.slice(0, 100)}...`,
        );
      }
    } catch (err) {
      console.warn(`Failed to parse example block: ${String(err)}`);
    }
  }

  return examples;
}

/**
 * Primary parsing strategy using regex patterns.
 *
 * @param block - Example block content
 * @returns Parsed example or null
 */
function parseExampleWithRegex(block: string): AgentExample | null {
  // Extract Context (optional) - everything after "Context:" until "user:"
  const contextMatch = /Context:\s*([\s\S]*?)(?=\nuser:)/i.exec(block);
  const context = contextMatch?.[1]?.trim() ?? "";

  // Extract user message - handles quoted or unquoted, single or multi-line
  const userMatch = /user:\s*["']?([\s\S]*?)["']?\s*(?=\nassistant:)/i.exec(
    block,
  );
  const userMessage = userMatch?.[1]?.trim() ?? "";

  // Extract assistant message
  const assistantMatch =
    /assistant:\s*["']?([\s\S]*?)["']?\s*(?=\n<commentary>|<\/example>)/i.exec(
      block,
    );
  const assistantMessage = assistantMatch?.[1]?.trim() ?? "";

  // Extract commentary (optional)
  const commentaryMatch = /<commentary>([\s\S]*?)<\/commentary>/i.exec(block);
  const commentary = commentaryMatch?.[1]?.trim() ?? "";

  if (!userMessage) {
    return null;
  }

  return {
    context,
    user_message: userMessage,
    expected_response: assistantMessage,
    commentary,
  };
}

/**
 * State type for the example parser.
 */
type ParserState = "init" | "context" | "user" | "assistant" | "commentary";

/**
 * Extract content, handling optional quotes.
 */
function extractContent(line: string, prefix: RegExp): string {
  let content = line.replace(prefix, "");
  content = content.replace(/^["']|["']$/g, "");
  return content;
}

/**
 * State transition configuration.
 * Each entry defines how to detect and handle a state transition.
 */
const stateTransitions: {
  check: (line: string) => boolean;
  getState: () => ParserState;
  getContent: (line: string) => string;
}[] = [
  {
    check: (l) => l.toLowerCase().startsWith("context:"),
    getState: () => "context",
    getContent: (l) => l.replace(/^context:\s*/i, ""),
  },
  {
    check: (l) => l.toLowerCase().startsWith("user:"),
    getState: () => "user",
    getContent: (l) => extractContent(l, /^user:\s*/i),
  },
  {
    check: (l) => l.toLowerCase().startsWith("assistant:"),
    getState: () => "assistant",
    getContent: (l) => extractContent(l, /^assistant:\s*/i),
  },
  {
    check: (l) => l === "<commentary>",
    getState: () => "commentary",
    getContent: () => "",
  },
  {
    check: (l) => l === "</commentary>" || l === "</example>",
    getState: () => "init",
    getContent: () => "",
  },
];

/**
 * Fallback: State machine parser for edge cases.
 * Handles cases where regex patterns fail due to unusual formatting.
 *
 * @param block - Example block content
 * @returns Parsed example or null
 */
function parseExampleWithStateMachine(block: string): AgentExample | null {
  const lines = block.split("\n");
  let state: ParserState = "init";
  const parts: Record<string, string[]> = {
    context: [],
    user: [],
    assistant: [],
    commentary: [],
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for state transitions
    const transition = stateTransitions.find((t) => t.check(trimmed));

    if (transition) {
      state = transition.getState();
      const content = transition.getContent(trimmed);
      if (content && state !== "init") {
        parts[state]?.push(content);
      }
    } else if (state !== "init" && trimmed !== "<example>") {
      // Continue current section
      parts[state]?.push(trimmed);
    }
  }

  const userMessage = parts["user"]?.join(" ").trim() ?? "";
  if (!userMessage) {
    return null;
  }

  return {
    context: parts["context"]?.join(" ").trim() ?? "",
    user_message: userMessage,
    expected_response: parts["assistant"]?.join(" ").trim() ?? "",
    commentary: parts["commentary"]?.join(" ").trim() ?? "",
  };
}

/**
 * Analyze multiple agents.
 *
 * @param agentPaths - Array of agent file paths
 * @returns Array of parsed agent components
 */
export function analyzeAgents(agentPaths: string[]): AgentComponent[] {
  return agentPaths.map(analyzeAgent);
}
