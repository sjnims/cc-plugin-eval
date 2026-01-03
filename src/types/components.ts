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

/**
 * Hook type: command-based or prompt-based.
 */
export type HookType = "command" | "prompt";

/**
 * Supported hook event types.
 * Based on Claude Agent SDK HOOK_EVENTS constant.
 */
export type HookEventType =
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "PermissionRequest"
  | "Stop"
  | "SubagentStart"
  | "SubagentStop"
  | "UserPromptSubmit"
  | "SessionStart"
  | "SessionEnd"
  | "PreCompact"
  | "Notification";

/**
 * Expected behavior of a hook.
 */
export type HookExpectedBehavior =
  | "block"
  | "allow"
  | "modify"
  | "log"
  | "context"
  | "unknown";

/**
 * Individual hook action within an event handler.
 */
export interface HookAction {
  type: HookType;
  /** For command hooks: the shell command to execute */
  command?: string | undefined;
  /** For prompt hooks: the LLM prompt to evaluate */
  prompt?: string | undefined;
  /** Timeout in seconds */
  timeout?: number | undefined;
}

/**
 * Hook event handler with matcher and actions.
 */
export interface HookEventHandler {
  /** Tool name pattern (regex, glob, or exact match) */
  matcher: string;
  /** Array of hooks to execute when matcher triggers */
  hooks: HookAction[];
}

/**
 * Parsed hook component from hooks.json.
 * Each matcher within an event type becomes a separate HookComponent.
 */
export interface HookComponent {
  /** Unique identifier: event_matcher pattern */
  name: string;
  /** Path to hooks.json */
  path: string;
  /** Event type (PreToolUse, PostToolUse, Stop, etc.) */
  eventType: HookEventType;
  /** Tool matcher pattern */
  matcher: string;
  /** Inferred expected behavior from hook content */
  expectedBehavior: HookExpectedBehavior;
  /** Description derived from hook prompt/command */
  description: string;
  /** The hook actions to execute */
  actions: HookAction[];
  /** Tools that would trigger this hook (parsed from matcher) */
  matchingTools: string[];
}
