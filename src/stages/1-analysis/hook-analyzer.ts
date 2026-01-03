/**
 * Hook analyzer.
 * Parses hooks.json files and extracts hook components for evaluation.
 */

import { existsSync, readFileSync } from "node:fs";

import { logger } from "../../utils/logging.js";

import type {
  HookAction,
  HookComponent,
  HookEventHandler,
  HookEventType,
  HookExpectedBehavior,
} from "../../types/index.js";

/**
 * Hooks manifest structure from hooks.json.
 */
interface HooksManifest {
  /** Optional description of the hooks */
  description?: string;
  /** Hooks organized by event type (may be undefined in invalid files) */
  hooks?: Partial<Record<HookEventType, HookEventHandler[]>>;
}

/**
 * Valid hook event types.
 */
const HOOK_EVENT_TYPES: HookEventType[] = [
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "Stop",
  "SubagentStart",
  "SubagentStop",
  "UserPromptSubmit",
  "SessionStart",
  "SessionEnd",
  "PreCompact",
  "Notification",
];

/**
 * Parse a matcher pattern to extract tool names.
 *
 * This function simplifies matcher patterns for display purposes. It does NOT
 * perform full regex parsing - complex patterns are converted to simplified
 * representations. For example, "mcp__.*" becomes "mcp__*".
 *
 * @param matcher - Matcher pattern (e.g., "Write|Edit", "*", "mcp__.*")
 * @returns Array of tool names that would match
 *
 * @example
 * ```typescript
 * parseMatcherToTools("*");              // ["*"]
 * parseMatcherToTools("Write|Edit");     // ["Write", "Edit"]
 * parseMatcherToTools("mcp__.*");        // ["mcp__*"]
 * parseMatcherToTools("Read");           // ["Read"]
 * ```
 */
export function parseMatcherToTools(matcher: string): string[] {
  // Wildcard matches everything
  if (matcher === "*") {
    return ["*"];
  }

  // Alternation pattern (e.g., "Write|Edit")
  if (matcher.includes("|") && !matcher.includes("(")) {
    return matcher.split("|").map((t) => t.trim());
  }

  // Regex pattern - convert to simplified glob
  if (matcher.includes(".*") || matcher.includes(".+")) {
    // Convert regex to simplified pattern for display
    const simplified = matcher
      .replace(/\.\*/g, "*")
      .replace(/\.\+/g, "+")
      .replace(/\\/g, "");
    return [simplified];
  }

  // Exact match
  return [matcher];
}

/**
 * Infer the expected behavior of a hook from its content.
 *
 * Analyzes prompt/command text to classify hook behavior using keyword patterns.
 *
 * @param hookContent - Combined prompt/command content
 * @returns Inferred expected behavior
 *
 * @example
 * ```typescript
 * inferExpectedBehavior("Return 'deny' if unsafe");  // "block"
 * inferExpectedBehavior("Approve the operation");    // "allow"
 * inferExpectedBehavior("Modify the input");         // "modify"
 * inferExpectedBehavior("Log this operation");       // "log"
 * inferExpectedBehavior("Load project context");     // "context"
 * inferExpectedBehavior("Do something");             // "unknown"
 * ```
 */
export function inferExpectedBehavior(
  hookContent: string,
): HookExpectedBehavior {
  const lowerContent = hookContent.toLowerCase();

  // Check for blocking/denying patterns
  if (
    /\bdeny\b|\bblock\b|\breject\b|\bforbid\b|\bprevent\b/.test(lowerContent)
  ) {
    return "block";
  }

  // Check for allowing/approving patterns
  if (/\bapprove\b|\ballow\b|\bpermit\b|\baccept\b/.test(lowerContent)) {
    return "allow";
  }

  // Check for modification patterns
  if (/\bmodify\b|\bupdate\b|\bchange\b|\balter\b/.test(lowerContent)) {
    return "modify";
  }

  // Check for logging patterns
  if (/\blog\b|\btrack\b|\brecord\b|\baudit\b/.test(lowerContent)) {
    return "log";
  }

  // Check for context loading patterns
  if (/\bcontext\b|\bload\b|\binitialize\b|\bsetup\b/.test(lowerContent)) {
    return "context";
  }

  return "unknown";
}

/**
 * Generate a description from hook actions.
 *
 * @param eventType - The hook event type
 * @param actions - The hook actions
 * @returns Generated description
 */
function generateDescription(
  eventType: HookEventType,
  actions: HookAction[],
): string {
  // Collect content from all actions
  const content = actions
    .map((a) => a.prompt ?? a.command ?? "")
    .filter((c) => c.length > 0)
    .join("; ");

  // Truncate if too long
  const truncated =
    content.length > 200 ? `${content.slice(0, 197)}...` : content;

  return `${eventType} hook: ${truncated || "no description available"}`;
}

/**
 * Analyze a hooks.json file and extract hook components.
 *
 * Parses the hooks manifest from hooks.json, validates the structure,
 * and extracts hook components for evaluation. Each handler becomes
 * a separate HookComponent with a unique name in the format
 * "EventType::Matcher" (e.g., "PreToolUse::Write|Edit").
 *
 * @param hooksPath - Absolute path to hooks.json file (from manifest.hooks field)
 * @returns Array of parsed hook components
 *
 * @example
 * ```typescript
 * const hooks = analyzeHook("/path/to/plugin/hooks/hooks.json");
 * // Returns:
 * // [
 * //   {
 * //     name: "PreToolUse::Write|Edit",
 * //     path: "/path/to/plugin/hooks/hooks.json",
 * //     eventType: "PreToolUse",
 * //     matcher: "Write|Edit",
 * //     expectedBehavior: "allow",
 * //     matchingTools: ["Write", "Edit"],
 * //     actions: [...]
 * //   }
 * // ]
 * ```
 */
export function analyzeHook(hooksPath: string): HookComponent[] {
  if (!existsSync(hooksPath)) {
    logger.warn(`Hooks file not found: ${hooksPath}`);
    return [];
  }

  let manifest: HooksManifest;
  try {
    const content = readFileSync(hooksPath, "utf-8");
    manifest = JSON.parse(content) as HooksManifest;
  } catch (error) {
    logger.error(`Failed to parse hooks.json: ${hooksPath}`, { error });
    return [];
  }

  // Validate manifest structure
  if (!manifest.hooks || typeof manifest.hooks !== "object") {
    logger.warn(`Invalid hooks manifest structure: ${hooksPath}`);
    return [];
  }

  const components: HookComponent[] = [];

  // Iterate over each event type in the manifest
  for (const eventTypeKey of Object.keys(manifest.hooks)) {
    // Validate event type
    if (!HOOK_EVENT_TYPES.includes(eventTypeKey as HookEventType)) {
      logger.warn(`Unknown hook event type: ${eventTypeKey}`);
      continue;
    }

    const eventType = eventTypeKey as HookEventType;
    const handlers = manifest.hooks[eventType];

    if (!Array.isArray(handlers)) {
      continue;
    }

    // Process each handler for this event type
    for (const handler of handlers) {
      if (!handler.matcher || !Array.isArray(handler.hooks)) {
        logger.warn(
          `Invalid handler in ${eventType}: missing matcher or hooks`,
        );
        continue;
      }

      // Convert handler hooks to HookAction[]
      const actions: HookAction[] = handler.hooks.map((h) => ({
        type: h.type === "command" ? "command" : "prompt",
        command: typeof h.command === "string" ? h.command : undefined,
        prompt: typeof h.prompt === "string" ? h.prompt : undefined,
        timeout: typeof h.timeout === "number" ? h.timeout : undefined,
      }));

      // Generate combined content for behavior inference
      const combinedContent = actions
        .map((a) => a.prompt ?? a.command ?? "")
        .join(" ");

      // Parse matching tools from matcher
      const matchingTools = parseMatcherToTools(handler.matcher);

      // Create unique name for this hook component
      // Use :: delimiter to avoid conflicts with matchers containing :
      const name = `${eventType}::${handler.matcher}`;

      const component: HookComponent = {
        name,
        path: hooksPath,
        eventType,
        matcher: handler.matcher,
        expectedBehavior: inferExpectedBehavior(combinedContent),
        description: generateDescription(eventType, actions),
        actions,
        matchingTools,
      };

      components.push(component);
    }
  }

  logger.info(`Analyzed ${String(components.length)} hooks from ${hooksPath}`);
  return components;
}

/**
 * Analyze hooks from a hooks.json path.
 * Wrapper for consistency with other analyzers.
 *
 * @param hooksPath - Path to hooks.json file
 * @returns Array of parsed hook components
 */
export function analyzeHooks(hooksPath: string): HookComponent[] {
  return analyzeHook(hooksPath);
}
