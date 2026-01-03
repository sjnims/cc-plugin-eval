/**
 * Hook Scenario Generator - Deterministic scenario generation for hooks.
 *
 * Hooks are reactive components that intercept operations. Test scenarios must:
 * - Cause Claude to invoke tools that match the hook's matcher pattern
 * - Trigger the correct hook event type
 * - Include negative scenarios for tools that should NOT match
 */

import type { HookComponent, TestScenario } from "../../types/index.js";

/**
 * Tool to prompt mapping for deterministic scenario generation.
 * Each tool has prompts that reliably cause Claude to invoke that tool.
 */
const TOOL_PROMPTS: Record<string, string> = {
  Write:
    "Create a new file called test-output.txt with the content 'Hello from test'",
  Read: "Read the contents of the file package.json and summarize it",
  Edit: "In the file README.md, replace the word 'example' with 'demo'",
  Bash: "Run the command npm --version to check the npm version",
  Glob: "Find all TypeScript files in the src directory",
  Grep: "Search for TODO comments across the entire codebase",
  Task: "Use a subagent to explore the codebase structure",
  Skill: "Use the appropriate skill to help with this task",
  WebFetch: "Fetch the documentation from https://example.com",
  WebSearch: "Search the web for TypeScript best practices",
  // Wildcard - use a generic task that will invoke some tool
  "*": "What is the current working directory and what files are in it?",
};

/**
 * Get a prompt that will trigger a specific tool.
 *
 * Returns a deterministic prompt designed to reliably cause Claude to invoke
 * the specified tool. This enables predictable hook testing without LLM calls.
 *
 * @param tool - Tool name
 * @returns Prompt that should invoke the tool
 *
 * @example
 * ```typescript
 * getToolPrompt("Write");   // "Create a new file called test-output.txt..."
 * getToolPrompt("Read");    // "Read the contents of the file package.json..."
 * getToolPrompt("Bash");    // "Run the command npm --version..."
 * getToolPrompt("*");       // "What is the current working directory..."
 * getToolPrompt("mcp__github__create"); // "Use the MCP tool mcp__github__create..."
 * ```
 */
export function getToolPrompt(tool: string): string {
  // Check direct mapping
  const prompt = TOOL_PROMPTS[tool];
  if (prompt !== undefined) {
    return prompt;
  }

  // Handle MCP tools
  if (tool.startsWith("mcp__")) {
    return `Use the MCP tool ${tool} to perform the required operation`;
  }

  // Generic fallback
  return `Perform an operation that requires using the ${tool} tool`;
}

/**
 * Get non-matching tools for negative scenarios.
 *
 * @param matchingTools - Tools that DO match the hook
 * @returns Tools that should NOT match
 */
function getNonMatchingTools(matchingTools: string[]): string[] {
  const allKnownTools = Object.keys(TOOL_PROMPTS).filter((t) => t !== "*");
  return allKnownTools.filter((t) => !matchingTools.includes(t)).slice(0, 2);
}

/**
 * Generate scenarios for a hook component.
 *
 * @param hook - Hook component
 * @returns Array of test scenarios
 */
export function generateHookScenarios(hook: HookComponent): TestScenario[] {
  const scenarios: TestScenario[] = [];
  const baseId = hook.name.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();

  // Handle different event types
  switch (hook.eventType) {
    case "PreToolUse":
    case "PostToolUse":
    case "PostToolUseFailure":
      return generateToolEventScenarios(hook, baseId);

    case "Stop":
    case "SubagentStop":
      return generateStopEventScenarios(hook, baseId);

    case "SessionStart":
    case "SessionEnd":
      return generateSessionEventScenarios(hook, baseId);

    case "UserPromptSubmit":
      return generatePromptSubmitScenarios(hook, baseId);

    case "PreCompact":
    case "Notification":
    case "PermissionRequest":
    case "SubagentStart":
      return generateOtherEventScenarios(hook, baseId);

    default: {
      // Unknown event type - generate basic scenario
      // Cast to string for template literal since TypeScript narrows to never
      const eventTypeStr = hook.eventType as string;
      scenarios.push({
        id: `${baseId}-basic`,
        component_ref: hook.name,
        component_type: "hook",
        scenario_type: "direct",
        user_prompt: "Perform a basic task",
        expected_trigger: true,
        expected_component: hook.name,
        reasoning: `Basic scenario for ${eventTypeStr} hook`,
      });
      return scenarios;
    }
  }
}

/**
 * Generate scenarios for tool-based events (PreToolUse, PostToolUse).
 */
function generateToolEventScenarios(
  hook: HookComponent,
  baseId: string,
): TestScenario[] {
  const scenarios: TestScenario[] = [];

  // Generate positive scenarios for each matching tool
  for (const tool of hook.matchingTools) {
    const prompt = getToolPrompt(tool);

    scenarios.push({
      id: `${baseId}-${tool.toLowerCase()}-direct`,
      component_ref: hook.name,
      component_type: "hook",
      scenario_type: "direct",
      user_prompt: prompt,
      expected_trigger: true,
      expected_component: hook.name,
      reasoning: `Scenario designed to invoke ${tool} tool, which should trigger ${hook.eventType} hook with matcher "${hook.matcher}"`,
    });
  }

  // Generate negative scenarios for non-matching tools
  if (hook.matcher !== "*") {
    const nonMatchingTools = getNonMatchingTools(hook.matchingTools);
    for (const tool of nonMatchingTools) {
      const prompt = getToolPrompt(tool);

      scenarios.push({
        id: `${baseId}-${tool.toLowerCase()}-negative`,
        component_ref: hook.name,
        component_type: "hook",
        scenario_type: "negative",
        user_prompt: prompt,
        expected_trigger: false,
        expected_component: hook.name,
        reasoning: `Scenario invokes ${tool} which should NOT match hook matcher "${hook.matcher}"`,
      });
    }
  }

  return scenarios;
}

/**
 * Generate scenarios for Stop/SubagentStop events.
 */
function generateStopEventScenarios(
  hook: HookComponent,
  baseId: string,
): TestScenario[] {
  const scenarios: TestScenario[] = [];

  // Stop hooks fire when agent completes - use simple completable tasks
  scenarios.push({
    id: `${baseId}-simple-task`,
    component_ref: hook.name,
    component_type: "hook",
    scenario_type: "direct",
    user_prompt: "What is 2 + 2? Just tell me the answer.",
    expected_trigger: true,
    expected_component: hook.name,
    reasoning: `Simple task that completes quickly, triggering ${hook.eventType} hook`,
  });

  scenarios.push({
    id: `${baseId}-quick-answer`,
    component_ref: hook.name,
    component_type: "hook",
    scenario_type: "direct",
    user_prompt: "Say hello world",
    expected_trigger: true,
    expected_component: hook.name,
    reasoning: `Quick response task that triggers ${hook.eventType} on completion`,
  });

  return scenarios;
}

/**
 * Generate scenarios for SessionStart/SessionEnd events.
 */
function generateSessionEventScenarios(
  hook: HookComponent,
  baseId: string,
): TestScenario[] {
  const scenarios: TestScenario[] = [];

  // Session hooks fire at session boundaries
  scenarios.push({
    id: `${baseId}-session`,
    component_ref: hook.name,
    component_type: "hook",
    scenario_type: "direct",
    user_prompt: "Hello, what can you help me with today?",
    expected_trigger: true,
    expected_component: hook.name,
    reasoning: `First message in session triggers ${hook.eventType} hook`,
  });

  return scenarios;
}

/**
 * Generate scenarios for UserPromptSubmit events.
 */
function generatePromptSubmitScenarios(
  hook: HookComponent,
  baseId: string,
): TestScenario[] {
  const scenarios: TestScenario[] = [];

  // UserPromptSubmit fires on every user message
  scenarios.push({
    id: `${baseId}-any-prompt`,
    component_ref: hook.name,
    component_type: "hook",
    scenario_type: "direct",
    user_prompt: "Help me understand this codebase",
    expected_trigger: true,
    expected_component: hook.name,
    reasoning: "UserPromptSubmit hook fires on every user prompt",
  });

  scenarios.push({
    id: `${baseId}-code-question`,
    component_ref: hook.name,
    component_type: "hook",
    scenario_type: "direct",
    user_prompt: "What programming language is this project written in?",
    expected_trigger: true,
    expected_component: hook.name,
    reasoning: "UserPromptSubmit hook fires on every user prompt",
  });

  return scenarios;
}

/**
 * Generate scenarios for other event types.
 */
function generateOtherEventScenarios(
  hook: HookComponent,
  baseId: string,
): TestScenario[] {
  const scenarios: TestScenario[] = [];

  // These events are harder to trigger reliably
  scenarios.push({
    id: `${baseId}-basic`,
    component_ref: hook.name,
    component_type: "hook",
    scenario_type: "direct",
    user_prompt: "Perform a task that might trigger system events",
    expected_trigger: true,
    expected_component: hook.name,
    reasoning: `Basic scenario for ${hook.eventType} hook - may require specific conditions`,
  });

  return scenarios;
}

/**
 * Generate scenarios for all hook components.
 *
 * @param hooks - Array of hook components
 * @returns Array of all test scenarios
 */
export function generateAllHookScenarios(
  hooks: HookComponent[],
): TestScenario[] {
  const scenarios: TestScenario[] = [];

  for (const hook of hooks) {
    scenarios.push(...generateHookScenarios(hook));
  }

  return scenarios;
}

/**
 * Get expected scenario count for hooks.
 *
 * Calculates the number of test scenarios that will be generated for the
 * given hooks. Used for cost estimation before scenario generation.
 *
 * @param hooks - Array of hook components
 * @returns Expected scenario count
 *
 * @example
 * ```typescript
 * const hooks = analyzeHooks("/path/to/hooks.json");
 * const count = getExpectedHookScenarioCount(hooks);
 * console.log(`Will generate approximately ${count} scenarios`);
 * ```
 */
export function getExpectedHookScenarioCount(hooks: HookComponent[]): number {
  let count = 0;

  for (const hook of hooks) {
    switch (hook.eventType) {
      case "PreToolUse":
      case "PostToolUse":
      case "PostToolUseFailure":
        // One positive per matching tool + up to 2 negatives
        count += hook.matchingTools.length;
        if (hook.matcher !== "*") {
          count += Math.min(2, getNonMatchingTools(hook.matchingTools).length);
        }
        break;

      case "Stop":
      case "SubagentStop":
        count += 2; // Two completable task scenarios
        break;

      case "SessionStart":
      case "SessionEnd":
        count += 1; // One session scenario
        break;

      case "UserPromptSubmit":
        count += 2; // Two prompt scenarios
        break;

      default:
        count += 1; // Basic scenario
    }
  }

  return count;
}
