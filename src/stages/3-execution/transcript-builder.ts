/**
 * Transcript builder for Stage 3: Execution.
 *
 * Converts Claude Agent SDK messages into the Transcript format
 * for storage and later evaluation in Stage 4.
 */

import {
  isUserMessage,
  isAssistantMessage,
  isToolResultMessage,
  isResultMessage,
  isSystemMessage,
  type SDKMessage,
  type SDKUserMessage,
  type SDKAssistantMessage,
  type SDKToolResultMessage,
  type SDKSystemMessage,
} from "./sdk-client.js";

import type {
  TestScenario,
  Transcript,
  TranscriptMetadata,
  TranscriptEvent,
  TranscriptErrorEvent,
  UserEvent,
  AssistantEvent,
  ToolResultEvent,
  ToolCall,
} from "../../types/index.js";

// Import SDK types from our SDK client (only what's used in this file)

// Re-export SDK types and guards for use by other modules
export {
  isUserMessage,
  isAssistantMessage,
  isToolResultMessage,
  isResultMessage,
  isSystemMessage,
  isErrorMessage,
  type SDKMessage,
  type SDKUserMessage,
  type SDKAssistantMessage,
  type SDKToolResultMessage,
  type SDKResultMessage,
  type SDKSystemMessage,
} from "./sdk-client.js";

/**
 * Generate a unique event ID.
 */
function generateEventId(): string {
  return `evt_${String(Date.now())}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Convert SDK user message to UserEvent.
 */
function convertUserMessage(msg: SDKUserMessage): UserEvent {
  return {
    id: generateEventId(),
    type: "user",
    edit: {
      message: {
        role: "user",
        content:
          typeof msg.message.content === "string"
            ? msg.message.content
            : JSON.stringify(msg.message.content),
      },
    },
  };
}

/**
 * Convert SDK assistant message to AssistantEvent.
 */
function convertAssistantMessage(msg: SDKAssistantMessage): AssistantEvent {
  // Extract text content
  const textParts = msg.message.content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "");
  const content = textParts.join("\n");

  // Extract tool calls
  const toolCalls: ToolCall[] = msg.message.content
    .filter((c) => c.type === "tool_use")
    .map((c) => ({
      id: c.id ?? generateEventId(),
      name: c.name ?? "",
      input: c.input,
    }));

  return {
    id: generateEventId(),
    type: "assistant",
    edit: {
      message: {
        role: "assistant",
        content,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
    },
  };
}

/**
 * Convert SDK tool result message to ToolResultEvent.
 */
function convertToolResultMessage(msg: SDKToolResultMessage): ToolResultEvent {
  return {
    id: generateEventId(),
    type: "tool_result",
    tool_use_id: msg.tool_use_id,
    result: msg.content ?? (msg.is_error ? "Error" : "Success"),
  };
}

/**
 * Builder context for constructing transcripts.
 */
export interface TranscriptBuilderContext {
  scenario: TestScenario;
  pluginName: string;
  model: string;
}

/**
 * Build a Transcript from SDK messages.
 *
 * @param context - Builder context with scenario info
 * @param messages - SDK messages from execution
 * @param errors - Error events that occurred
 * @returns Complete transcript
 *
 * @example
 * ```typescript
 * const transcript = buildTranscript(
 *   { scenario, pluginName: 'my-plugin', model: 'claude-sonnet-4-5-20250929' },
 *   messages,
 *   errors
 * );
 * ```
 */
export function buildTranscript(
  context: TranscriptBuilderContext,
  messages: SDKMessage[],
  errors: TranscriptErrorEvent[],
): Transcript {
  // Find result message for metrics
  const resultMsg = messages.find(isResultMessage);

  // Build metadata - only include optional properties if they have values
  const metadata: TranscriptMetadata = {
    version: "v3.0",
    plugin_name: context.pluginName,
    scenario_id: context.scenario.id,
    timestamp: new Date().toISOString(),
    model: context.model,
    ...(resultMsg?.total_cost_usd !== undefined
      ? { total_cost_usd: resultMsg.total_cost_usd }
      : {}),
    ...(resultMsg?.duration_ms !== undefined
      ? { api_duration_ms: resultMsg.duration_ms }
      : {}),
  };

  // Convert messages to events
  const events: TranscriptEvent[] = [];

  for (const msg of messages) {
    if (isUserMessage(msg)) {
      events.push(convertUserMessage(msg));
    } else if (isAssistantMessage(msg)) {
      events.push(convertAssistantMessage(msg));
    } else if (isToolResultMessage(msg)) {
      events.push(convertToolResultMessage(msg));
    }
    // Skip system, result, and other message types
  }

  return {
    metadata,
    events,
    ...(errors.length > 0 ? { errors } : {}),
  };
}

/**
 * Extract metrics from SDK result message.
 *
 * @param messages - SDK messages from execution
 * @returns Metrics from result message
 */
export function extractMetrics(messages: SDKMessage[]): {
  costUsd: number;
  durationMs: number;
  numTurns: number;
  permissionDenials: string[];
} {
  const resultMsg = messages.find(isResultMessage);

  return {
    costUsd: resultMsg?.total_cost_usd ?? 0,
    durationMs: resultMsg?.duration_ms ?? 0,
    numTurns: resultMsg?.num_turns ?? 0,
    permissionDenials: resultMsg?.permission_denials ?? [],
  };
}

/**
 * Create error event from exception.
 *
 * @param error - The error that occurred
 * @param isTimeout - Whether this is a timeout error
 * @returns Error event for transcript
 */
export function createErrorEvent(
  error: unknown,
  isTimeout = false,
): TranscriptErrorEvent {
  const message = error instanceof Error ? error.message : String(error);

  return {
    type: "error",
    error_type: isTimeout ? "timeout" : "api_error",
    message,
    timestamp: Date.now(),
    recoverable: false,
  };
}

/**
 * Extract session ID from system init message.
 *
 * @param messages - SDK messages
 * @returns Session ID or undefined
 */
export function extractSessionId(messages: SDKMessage[]): string | undefined {
  const initMsg = messages.find(
    (m): m is SDKSystemMessage => isSystemMessage(m) && m.subtype === "init",
  );

  return initMsg?.session_id;
}

/**
 * Check if execution completed successfully.
 *
 * @param messages - SDK messages
 * @param errors - Error events
 * @returns True if execution succeeded
 */
export function isSuccessfulExecution(
  messages: SDKMessage[],
  errors: TranscriptErrorEvent[],
): boolean {
  // Check for errors
  if (errors.length > 0) {
    return false;
  }

  // Check for result message (indicates normal completion)
  const hasResult = messages.some(isResultMessage);

  return hasResult;
}

/**
 * Count assistant turns in messages.
 *
 * @param messages - SDK messages
 * @returns Number of assistant turns
 */
export function countAssistantTurns(messages: SDKMessage[]): number {
  return messages.filter(isAssistantMessage).length;
}
