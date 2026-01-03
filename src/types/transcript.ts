/**
 * Transcript type definitions.
 * Represents execution transcripts from Agent SDK runs.
 */

/**
 * Tool call captured during execution.
 */
export interface ToolCapture {
  name: string;
  input: unknown;
  toolUseId: string | undefined;
  timestamp: number;
}

/**
 * Hook response captured during execution.
 * Corresponds to SDKHookResponseMessage from Agent SDK.
 */
export interface HookResponseCapture {
  /** Name of the hook that fired */
  hookName: string;
  /** Event type (PreToolUse, PostToolUse, Stop, etc.) */
  hookEvent: string;
  /** Hook stdout output */
  stdout: string;
  /** Hook stderr output */
  stderr: string;
  /** Exit code for command hooks */
  exitCode?: number | undefined;
  /** Capture timestamp */
  timestamp: number;
}

/**
 * Transcript metadata.
 */
export interface TranscriptMetadata {
  version: "v3.0";
  plugin_name: string;
  scenario_id: string;
  timestamp: string;
  model: string;
  total_cost_usd?: number;
  api_duration_ms?: number;
}

/**
 * User message event.
 */
export interface UserEvent {
  id: string;
  type: "user";
  edit: {
    message: {
      role: "user";
      content: string;
    };
  };
}

/**
 * Tool call in assistant message.
 */
export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

/**
 * Assistant message event.
 */
export interface AssistantEvent {
  id: string;
  type: "assistant";
  edit: {
    message: {
      role: "assistant";
      content: string;
      tool_calls?: ToolCall[];
    };
  };
}

/**
 * Tool result event.
 */
export interface ToolResultEvent {
  id: string;
  type: "tool_result";
  tool_use_id: string;
  result: unknown;
}

/**
 * Error event types.
 */
export type TranscriptErrorType =
  | "api_error"
  | "timeout"
  | "permission_denied"
  | "budget_exceeded";

/**
 * Error event in transcript.
 */
export interface TranscriptErrorEvent {
  type: "error";
  error_type: TranscriptErrorType;
  message: string;
  timestamp: number;
  recoverable: boolean;
}

/**
 * Union of all event types.
 */
export type TranscriptEvent = UserEvent | AssistantEvent | ToolResultEvent;

/**
 * Complete transcript of an execution.
 */
export interface Transcript {
  metadata: TranscriptMetadata;
  events: TranscriptEvent[];
  errors?: TranscriptErrorEvent[];
}

/**
 * Result of executing a scenario.
 */
export interface ExecutionResult {
  scenario_id: string;
  transcript: Transcript;
  detected_tools: ToolCapture[];
  cost_usd: number;
  api_duration_ms: number;
  num_turns: number;
  /** Track hook denials */
  permission_denials: string[];
  /** Track errors */
  errors: TranscriptErrorEvent[];
  /** Captured hook responses from SDK messages */
  hook_responses?: HookResponseCapture[];
}
