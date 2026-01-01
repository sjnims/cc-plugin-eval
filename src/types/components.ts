/**
 * Component type definitions.
 * Represents skills, agents, and commands parsed from plugin files.
 */

/**
 * Semantic Intent - Parsed understanding of what triggers a skill.
 * Skills use SEMANTIC matching, not exact phrase matching.
 * "build a hook" should trigger skill with phrase "create a hook".
 */
export interface SemanticIntent {
  /** Action verb: "create", "add", "configure", "build", "set up" */
  action: string;
  /** Object of action: "hook", "MCP server", "plugin", "skill" */
  object: string;
  /** Optional context: "for validation", "in Claude Code" */
  context?: string | undefined;
  /** Original quoted phrase from description */
  raw_phrase: string;
}

/**
 * Semantic variation of a trigger phrase.
 */
export interface SemanticVariation {
  original_trigger: string;
  variation: string;
  variation_type: "synonym" | "related_concept" | "structure" | "informal";
  explanation: string;
}

/**
 * Parsed skill component from SKILL.md.
 */
export interface SkillComponent {
  name: string;
  path: string;
  description: string;
  /** Raw quoted phrases extracted from description */
  trigger_phrases: string[];
  /** Parsed semantic intents for better matching */
  semantic_intents: SemanticIntent[];
  /** Generated synonyms/variations for testing */
  semantic_variations?: SemanticVariation[] | undefined;
  /** Tool restrictions (note: uses hyphenated 'allowed-tools' in frontmatter) */
  allowed_tools?: string[] | undefined;
}

/**
 * Example block parsed from agent description.
 */
export interface AgentExample {
  context: string;
  user_message: string;
  expected_response: string;
  commentary: string;
}

/**
 * Parsed agent component from agent markdown file.
 */
export interface AgentComponent {
  name: string;
  path: string;
  description: string;
  model: string;
  tools?: string[] | undefined;
  example_triggers: AgentExample[];
}

/**
 * Parsed command component from command markdown file.
 */
export interface CommandComponent {
  name: string;
  path: string;
  plugin_prefix: string;
  /** Subdirectory namespace (e.g., "advanced") */
  namespace: string;
  /** namespace/name or just name */
  fullName: string;
  description: string;
  argument_hint?: string | undefined;
  allowed_tools?: string[] | undefined;
  disable_model_invocation: boolean;
}
