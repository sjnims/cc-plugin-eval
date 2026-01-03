/**
 * Programmatic Detector - 100% confidence detection from tool captures.
 *
 * Primary detection method using real-time captures from PreToolUse hooks.
 * Parses Skill, Task, and SlashCommand tool calls for deterministic
 * component identification.
 *
 * Detection priority:
 * 1. Real-time captures from PreToolUse hooks (highest confidence)
 * 2. Direct command invocation in user message (/command syntax)
 * 3. Tool calls parsed from transcript (fallback)
 */

import type {
  ComponentType,
  HookResponseCapture,
  ProgrammaticDetection,
  TestScenario,
  ToolCapture,
  Transcript,
} from "../../types/index.js";

/**
 * Skill tool input structure.
 */
interface SkillToolInput {
  skill: string;
  args?: string;
}

/**
 * Task tool input structure.
 */
interface TaskToolInput {
  subagent_type: string;
  prompt?: string;
  description?: string;
}

/**
 * Check if input is a Skill tool input.
 *
 * @param input - Tool input to check
 * @returns True if input matches Skill structure
 */
function isSkillInput(input: unknown): input is SkillToolInput {
  return (
    typeof input === "object" &&
    input !== null &&
    "skill" in input &&
    typeof (input as SkillToolInput).skill === "string"
  );
}

/**
 * Check if input is a Task tool input.
 *
 * @param input - Tool input to check
 * @returns True if input matches Task structure
 */
function isTaskInput(input: unknown): input is TaskToolInput {
  return (
    typeof input === "object" &&
    input !== null &&
    "subagent_type" in input &&
    typeof (input as TaskToolInput).subagent_type === "string"
  );
}

/**
 * Detect components from real-time captures.
 *
 * Uses PreToolUse hook captures for 100% confidence detection.
 * This is the PRIMARY detection method.
 *
 * @param captures - Tool captures from execution
 * @returns Array of programmatic detections
 *
 * @example
 * ```typescript
 * const detections = detectFromCaptures(executionResult.detected_tools);
 * // [{ component_type: 'skill', component_name: 'commit', confidence: 100, ... }]
 * ```
 */
export function detectFromCaptures(
  captures: ToolCapture[],
): ProgrammaticDetection[] {
  const detections: ProgrammaticDetection[] = [];

  for (const capture of captures) {
    if (capture.name === "Skill" && isSkillInput(capture.input)) {
      detections.push({
        component_type: "skill",
        component_name: capture.input.skill,
        confidence: 100,
        tool_name: capture.name,
        evidence: `Skill tool invoked: ${capture.input.skill}`,
        timestamp: capture.timestamp,
      });
    } else if (capture.name === "Task" && isTaskInput(capture.input)) {
      detections.push({
        component_type: "agent",
        component_name: capture.input.subagent_type,
        confidence: 100,
        tool_name: capture.name,
        evidence: `Task tool invoked: ${capture.input.subagent_type}`,
        timestamp: capture.timestamp,
      });
    } else if (capture.name === "SlashCommand" && isSkillInput(capture.input)) {
      // SlashCommand uses same input structure as Skill
      detections.push({
        component_type: "command",
        component_name: capture.input.skill,
        confidence: 100,
        tool_name: capture.name,
        evidence: `SlashCommand invoked: ${capture.input.skill}`,
        timestamp: capture.timestamp,
      });
    }
  }

  return detections;
}

/**
 * Detect components from transcript tool calls.
 *
 * Fallback method when captures are unavailable.
 * Parses assistant message tool_calls from transcript events.
 *
 * @param transcript - Execution transcript
 * @returns Array of programmatic detections
 */
export function detectFromTranscript(
  transcript: Transcript,
): ProgrammaticDetection[] {
  const detections: ProgrammaticDetection[] = [];

  for (const event of transcript.events) {
    // Only assistant events have tool_calls
    if (event.type !== "assistant") {
      continue;
    }

    const toolCalls = event.edit.message.tool_calls ?? [];

    for (const tc of toolCalls) {
      if (tc.name === "Skill" && isSkillInput(tc.input)) {
        detections.push({
          component_type: "skill",
          component_name: tc.input.skill,
          confidence: 100,
          tool_name: tc.name,
          evidence: `Skill tool invoked: ${tc.input.skill}`,
          timestamp: 0, // Timestamp unavailable in transcript
        });
      } else if (tc.name === "Task" && isTaskInput(tc.input)) {
        detections.push({
          component_type: "agent",
          component_name: tc.input.subagent_type,
          confidence: 100,
          tool_name: tc.name,
          evidence: `Task tool invoked: ${tc.input.subagent_type}`,
          timestamp: 0,
        });
      } else if (tc.name === "SlashCommand" && isSkillInput(tc.input)) {
        detections.push({
          component_type: "command",
          component_name: tc.input.skill,
          confidence: 100,
          tool_name: tc.name,
          evidence: `SlashCommand invoked: ${tc.input.skill}`,
          timestamp: 0,
        });
      }
    }
  }

  return detections;
}

/**
 * Detect direct command invocation from user message.
 *
 * Commands invoked with explicit `/command` syntax in user messages
 * may not appear as SlashCommand tool calls. This catches those cases.
 *
 * @param transcript - Execution transcript
 * @param _scenario - Test scenario (used for validation)
 * @returns Detection if command syntax found, null otherwise
 *
 * @example
 * ```typescript
 * // User message: "/plugin-dev:create-plugin"
 * const detection = detectDirectCommandInvocation(transcript, scenario);
 * // { component_type: 'command', component_name: 'create-plugin', ... }
 * ```
 */
export function detectDirectCommandInvocation(
  transcript: Transcript,
  _scenario: TestScenario,
): ProgrammaticDetection | null {
  // Find the first user message in the transcript
  const firstUserEvent = transcript.events.find((e) => e.type === "user");

  if (firstUserEvent?.type !== "user") {
    return null;
  }

  const content = firstUserEvent.edit.message.content;

  // Check if message starts with /command syntax
  if (!content.startsWith("/")) {
    return null;
  }

  // Match patterns like:
  // - /command
  // - /plugin:command
  // - /plugin:namespace/command
  // - /plugin:namespace:command
  const commandMatch = /^\/([a-z0-9-]+:)?([a-z0-9-/:]+)/i.exec(content);

  if (!commandMatch) {
    return null;
  }

  const commandName = commandMatch[2];

  // Handle namespace/command format - extract just the command part
  const normalizedName = commandName?.includes("/")
    ? (commandName.split("/").pop() ?? commandName)
    : commandName;

  const commandPrefix = content.split(" ")[0] ?? content;

  return {
    component_type: "command",
    component_name: normalizedName ?? "",
    confidence: 100,
    tool_name: "DirectInvocation",
    evidence: `Direct command invocation in user message: ${commandPrefix}`,
    timestamp: 0,
  };
}

/**
 * Detect all components using all detection methods.
 *
 * Combines real-time captures, direct command detection, and transcript
 * parsing with priority order for comprehensive detection.
 *
 * Priority order:
 * 1. Real-time captures from PreToolUse hooks (highest confidence)
 * 2. Direct command invocation in user message
 * 3. Tool calls parsed from transcript (fallback)
 *
 * @param captures - Tool captures from execution
 * @param transcript - Execution transcript
 * @param scenario - Test scenario
 * @returns Array of all detected components
 *
 * @example
 * ```typescript
 * const detections = detectAllComponents(
 *   executionResult.detected_tools,
 *   executionResult.transcript,
 *   testScenario
 * );
 * ```
 */
export function detectAllComponents(
  captures: ToolCapture[],
  transcript: Transcript,
  scenario: TestScenario,
): ProgrammaticDetection[] {
  const detections: ProgrammaticDetection[] = [];

  // 1. Primary: Real-time captures (if available)
  if (captures.length > 0) {
    detections.push(...detectFromCaptures(captures));
  }

  // 2. Direct command detection (for /command syntax)
  if (scenario.component_type === "command") {
    const directDetection = detectDirectCommandInvocation(transcript, scenario);
    if (directDetection) {
      // Only add if not already detected via captures
      const alreadyDetected = detections.some(
        (d) =>
          d.component_type === "command" &&
          d.component_name === directDetection.component_name,
      );
      if (!alreadyDetected) {
        detections.push(directDetection);
      }
    }
  }

  // 3. Fallback: Parse transcript for tool calls
  if (detections.length === 0) {
    detections.push(...detectFromTranscript(transcript));
  }

  return detections;
}

/**
 * Check if expected component was triggered.
 *
 * @param detections - All detected components
 * @param expectedComponent - Expected component name
 * @param expectedType - Expected component type
 * @returns True if expected component was detected
 */
export function wasExpectedComponentTriggered(
  detections: ProgrammaticDetection[],
  expectedComponent: string,
  expectedType: ComponentType,
): boolean {
  return detections.some(
    (d) =>
      d.component_name === expectedComponent &&
      d.component_type === expectedType,
  );
}

/**
 * Get unique components from detections.
 *
 * @param detections - All detections (may contain duplicates)
 * @returns Unique detections by component name and type
 */
export function getUniqueDetections(
  detections: ProgrammaticDetection[],
): ProgrammaticDetection[] {
  const seen = new Set<string>();
  return detections.filter((d) => {
    const key = `${d.component_type}:${d.component_name}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Detect hooks from hook response captures.
 *
 * Hook responses are captured via SDKHookResponseMessage during execution.
 * This provides 100% confidence detection for hook activation.
 *
 * @param hookResponses - Hook response captures from execution
 * @returns Array of programmatic detections for hooks
 *
 * @example
 * ```typescript
 * const detections = detectFromHookResponses(executionResult.hook_responses);
 * // [{ component_type: 'hook', component_name: 'PreToolUse:Write', ... }]
 * ```
 */
export function detectFromHookResponses(
  hookResponses: HookResponseCapture[],
): ProgrammaticDetection[] {
  const detections: ProgrammaticDetection[] = [];

  for (const response of hookResponses) {
    // Create unique component name from event type and hook name
    const componentName = response.hookName || `${response.hookEvent}:unknown`;

    detections.push({
      component_type: "hook",
      component_name: componentName,
      confidence: 100,
      tool_name: response.hookEvent,
      evidence: `Hook response: ${response.hookEvent} hook "${response.hookName}" fired${
        response.exitCode !== undefined
          ? ` (exit code: ${String(response.exitCode)})`
          : ""
      }`,
      timestamp: response.timestamp,
    });
  }

  return detections;
}

/**
 * Check if expected hook was triggered.
 *
 * @param hookResponses - Hook response captures from execution
 * @param expectedHookName - Expected hook component name (e.g., "PreToolUse::Write|Edit")
 * @param expectedEventType - Optional expected event type
 * @returns True if expected hook was detected
 *
 * @example
 * ```typescript
 * const triggered = wasExpectedHookTriggered(
 *   executionResult.hook_responses,
 *   "PreToolUse::Write|Edit",
 *   "PreToolUse"
 * );
 * ```
 */
export function wasExpectedHookTriggered(
  hookResponses: HookResponseCapture[],
  expectedHookName: string,
  expectedEventType?: string,
): boolean {
  if (hookResponses.length === 0) {
    return false;
  }

  return hookResponses.some((response) => {
    // Match by event type if provided
    if (expectedEventType && response.hookEvent !== expectedEventType) {
      return false;
    }

    // Match by hook name
    // The expected name format is "EventType::Matcher" (e.g., "PreToolUse::Write|Edit")
    if (expectedHookName.includes("::")) {
      const [eventType, matcher] = expectedHookName.split("::");
      if (eventType && response.hookEvent !== eventType) {
        return false;
      }
      // Check if response hook name contains the matcher pattern
      if (matcher && !response.hookName.includes(matcher)) {
        return false;
      }
      return true;
    }

    // Direct name match
    return response.hookName === expectedHookName;
  });
}

/**
 * Detect all components including hooks.
 *
 * Extended version of detectAllComponents that also handles hook detection.
 *
 * @param captures - Tool captures from execution
 * @param transcript - Execution transcript
 * @param scenario - Test scenario
 * @param hookResponses - Optional hook response captures
 * @returns Array of all detected components including hooks
 */
export function detectAllComponentsWithHooks(
  captures: ToolCapture[],
  transcript: Transcript,
  scenario: TestScenario,
  hookResponses?: HookResponseCapture[],
): ProgrammaticDetection[] {
  // Get standard component detections
  const detections = detectAllComponents(captures, transcript, scenario);

  // Add hook detections if this is a hook scenario and we have responses
  if (scenario.component_type === "hook" && hookResponses) {
    const hookDetections = detectFromHookResponses(hookResponses);

    // Filter to matching hooks based on scenario
    const relevantHookDetections = hookDetections.filter((d) => {
      // Match by component reference (e.g., "PreToolUse::Write|Edit")
      const expectedRef = scenario.component_ref;
      if (!expectedRef) {
        return true;
      }

      // Parse expected reference
      if (expectedRef.includes("::")) {
        const [eventType] = expectedRef.split("::");
        return d.tool_name === eventType;
      }

      return true;
    });

    detections.push(...relevantHookDetections);
  }

  return getUniqueDetections(detections);
}
