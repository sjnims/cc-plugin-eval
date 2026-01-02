/**
 * Agent executor for Stage 3: Execution.
 *
 * Executes test scenarios through the Claude Agent SDK with
 * plugin loaded. Captures tool invocations via PreToolUse hooks
 * for programmatic detection in Stage 4.
 */

import { DEFAULT_TUNING } from "../../config/defaults.js";
import { logger } from "../../utils/logging.js";
import { withRetry } from "../../utils/retry.js";

import {
  executeQuery,
  isErrorMessage,
  isResultMessage,
  isUserMessage,
  type SDKMessage,
  type QueryInput,
  type QueryObject,
  type PluginReference,
  type PreToolUseHookConfig,
  type HookCallback,
} from "./sdk-client.js";
import {
  buildTranscript,
  type TranscriptBuilderContext,
} from "./transcript-builder.js";

import type {
  ExecutionConfig,
  ExecutionResult,
  TestScenario,
  TranscriptErrorEvent,
  ToolCapture,
} from "../../types/index.js";

/**
 * Query function type for dependency injection in tests.
 */
export type QueryFunction = (input: QueryInput) => QueryObject;

/**
 * Scenario execution options.
 */
export interface ScenarioExecutionOptions {
  /** Scenario to execute */
  scenario: TestScenario;
  /** Path to plugin */
  pluginPath: string;
  /** Plugin name for transcript */
  pluginName: string;
  /** Execution configuration */
  config: ExecutionConfig;
  /** Additional plugins for conflict testing */
  additionalPlugins?: string[] | undefined;
  /** Query function (for testing/dependency injection) */
  queryFn?: QueryFunction | undefined;
}

/**
 * Create a tool capture hook.
 *
 * Returns a hook callback that captures all tool invocations
 * for later analysis.
 *
 * @param captures - Array to push captured tools into
 * @returns Hook callback
 */
function createCaptureHook(captures: ToolCapture[]): HookCallback {
  return async (input, toolUseId, _context) => {
    // PreToolUse hooks receive PreToolUseHookInput which has tool_name and tool_input
    if ("tool_name" in input && "tool_input" in input) {
      captures.push({
        name: input.tool_name,
        input: input.tool_input,
        toolUseId,
        timestamp: Date.now(),
      });
    }
    // Return empty object to allow operation to proceed
    return Promise.resolve({});
  };
}

/**
 * Build query input for scenario execution.
 */
function buildQueryInput(
  scenario: TestScenario,
  plugins: PluginReference[],
  config: ExecutionConfig,
  hooks: PreToolUseHookConfig[],
  abortSignal: AbortSignal,
): QueryInput {
  // Build allowed tools list - ensure trigger tools are always included
  const allowedTools = [
    ...(config.allowed_tools ?? []),
    "Skill",
    "SlashCommand",
    "Task",
    "Read",
    "Glob",
    "Grep",
  ];

  return {
    prompt: scenario.user_prompt,
    options: {
      plugins,
      settingSources: ["project"], // REQUIRED for skills to work
      allowedTools,
      ...(config.disallowed_tools
        ? { disallowedTools: config.disallowed_tools }
        : {}),
      model: config.model,
      maxTurns: config.max_turns,
      persistSession: false, // Session isolation
      maxBudgetUsd: config.max_budget_usd,
      abortSignal,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      hooks: {
        PreToolUse: hooks,
      },
    },
  };
}

/**
 * Extract metrics from SDK result message.
 */
function extractResultMetrics(messages: SDKMessage[]): {
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
 */
function createErrorEvent(
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
 * Execute a single test scenario.
 *
 * Runs the scenario through the Agent SDK with the plugin loaded,
 * capturing all tool invocations via PreToolUse hooks.
 *
 * @param options - Scenario execution options
 * @returns Execution result with transcript and captured tools
 *
 * @example
 * ```typescript
 * const result = await executeScenario({
 *   scenario: testScenario,
 *   pluginPath: './my-plugin',
 *   pluginName: 'my-plugin',
 *   config: executionConfig,
 * });
 *
 * console.log(`Detected ${result.detected_tools.length} tool calls`);
 * ```
 */
export async function executeScenario(
  options: ScenarioExecutionOptions,
): Promise<ExecutionResult> {
  const {
    scenario,
    pluginPath,
    pluginName,
    config,
    additionalPlugins = [],
    queryFn,
  } = options;

  const messages: SDKMessage[] = [];
  const detectedTools: ToolCapture[] = [];
  const errors: TranscriptErrorEvent[] = [];

  // Abort controller for timeout handling
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeout_ms);

  try {
    // Build plugin list
    const plugins: PluginReference[] = [{ type: "local", path: pluginPath }];
    for (const additionalPath of additionalPlugins) {
      plugins.push({ type: "local", path: additionalPath });
    }

    // Create capture hook
    const captureHook = createCaptureHook(detectedTools);
    const hooks: PreToolUseHookConfig[] = [
      {
        matcher: ".*", // Capture all tools
        hooks: [captureHook],
      },
    ];

    // Build query input
    const queryInput = buildQueryInput(
      scenario,
      plugins,
      config,
      hooks,
      controller.signal,
    );

    // Execute with retry for transient errors
    await withRetry(async () => {
      // Use provided query function or real SDK
      const q = queryFn ? queryFn(queryInput) : executeQuery(queryInput);

      for await (const message of q) {
        messages.push(message);

        // Capture errors for transcript
        if (isErrorMessage(message)) {
          errors.push({
            type: "error",
            error_type: "api_error",
            message: message.error ?? "Unknown error",
            timestamp: Date.now(),
            recoverable: false,
          });
        }
      }
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    errors.push(createErrorEvent(err, isTimeout));
  } finally {
    clearTimeout(timeout);
  }

  // Extract metrics from result message
  const metrics = extractResultMetrics(messages);

  // Build transcript context
  const context: TranscriptBuilderContext = {
    scenario,
    pluginName,
    model: config.model,
  };

  return {
    scenario_id: scenario.id,
    transcript: buildTranscript(context, messages, errors),
    detected_tools: detectedTools,
    cost_usd: metrics.costUsd,
    api_duration_ms: metrics.durationMs,
    num_turns: metrics.numTurns,
    permission_denials: metrics.permissionDenials,
    errors,
  };
}

/**
 * Execute a scenario with file checkpointing.
 *
 * For scenarios that test commands/skills that modify files,
 * this enables file checkpointing to undo changes between tests.
 *
 * @param options - Scenario execution options
 * @returns Execution result
 */
export async function executeScenarioWithCheckpoint(
  options: ScenarioExecutionOptions,
): Promise<ExecutionResult> {
  const {
    scenario,
    pluginPath,
    pluginName,
    config,
    additionalPlugins = [],
    queryFn,
  } = options;

  const messages: SDKMessage[] = [];
  const detectedTools: ToolCapture[] = [];
  const errors: TranscriptErrorEvent[] = [];
  let userMessageId: string | undefined;

  // Abort controller for timeout handling
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeout_ms);

  try {
    // Build plugin list
    const plugins: PluginReference[] = [{ type: "local", path: pluginPath }];
    for (const additionalPath of additionalPlugins) {
      plugins.push({ type: "local", path: additionalPath });
    }

    // Create capture hook
    const captureHook = createCaptureHook(detectedTools);

    // Build query input with file checkpointing enabled
    const queryInput: QueryInput = {
      prompt: scenario.user_prompt,
      options: {
        plugins,
        settingSources: ["project"],
        allowedTools: [
          ...(config.allowed_tools ?? []),
          "Skill",
          "SlashCommand",
          "Task",
          "Read",
          "Glob",
          "Grep",
        ],
        ...(config.disallowed_tools
          ? { disallowedTools: config.disallowed_tools }
          : {}),
        model: config.model,
        maxTurns: config.max_turns,
        persistSession: false,
        maxBudgetUsd: config.max_budget_usd,
        abortSignal: controller.signal,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        enableFileCheckpointing: true, // Enable for rewind
        hooks: {
          PreToolUse: [
            {
              matcher: ".*",
              hooks: [captureHook],
            },
          ],
        },
      },
    };

    // Execute with retry
    await withRetry(async () => {
      const q = queryFn ? queryFn(queryInput) : executeQuery(queryInput);

      for await (const message of q) {
        messages.push(message);

        // Capture user message ID for potential rewind
        if (isUserMessage(message) && message.id) {
          userMessageId = message.id;
        }

        // Capture errors
        if (isErrorMessage(message)) {
          errors.push({
            type: "error",
            error_type: "api_error",
            message: message.error ?? "Unknown error",
            timestamp: Date.now(),
            recoverable: false,
          });
        }
      }

      // Rewind file changes after execution if we have the Query object
      // The SDK's query() returns an object with rewindFiles method
      if (userMessageId && typeof q.rewindFiles === "function") {
        try {
          await q.rewindFiles(userMessageId);
          logger.debug(`Reverted file changes for scenario: ${scenario.id}`);
        } catch (rewindErr) {
          logger.warn(
            `Failed to rewind files for ${scenario.id}: ${rewindErr instanceof Error ? rewindErr.message : String(rewindErr)}`,
          );
        }
      }
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    errors.push(createErrorEvent(err, isTimeout));
  } finally {
    clearTimeout(timeout);
  }

  // Extract metrics
  const metrics = extractResultMetrics(messages);

  // Build transcript
  const context: TranscriptBuilderContext = {
    scenario,
    pluginName,
    model: config.model,
  };

  return {
    scenario_id: scenario.id,
    transcript: buildTranscript(context, messages, errors),
    detected_tools: detectedTools,
    cost_usd: metrics.costUsd,
    api_duration_ms: metrics.durationMs,
    num_turns: metrics.numTurns,
    permission_denials: metrics.permissionDenials,
    errors,
  };
}

/**
 * Calculate estimated cost for scenario execution.
 *
 * @param scenarioCount - Number of scenarios
 * @param config - Execution configuration
 * @returns Estimated cost in USD
 */
export function estimateExecutionCost(
  scenarioCount: number,
  config: ExecutionConfig,
): number {
  // Token estimates from tuning config
  const inputTokensPerScenario =
    DEFAULT_TUNING.token_estimates.input_per_turn * config.max_turns;
  const outputTokensPerScenario =
    DEFAULT_TUNING.token_estimates.output_per_turn * config.max_turns;

  // Price per 1M tokens (Sonnet 4)
  const inputPrice = 3.0; // $3 per 1M input tokens
  const outputPrice = 15.0; // $15 per 1M output tokens

  const totalInputTokens = inputTokensPerScenario * scenarioCount;
  const totalOutputTokens = outputTokensPerScenario * scenarioCount;

  const inputCost = (totalInputTokens / 1_000_000) * inputPrice;
  const outputCost = (totalOutputTokens / 1_000_000) * outputPrice;

  return inputCost + outputCost;
}

/**
 * Check if execution would exceed budget.
 *
 * @param scenarioCount - Number of scenarios
 * @param config - Execution configuration
 * @returns True if estimated cost exceeds budget
 */
export function wouldExceedBudget(
  scenarioCount: number,
  config: ExecutionConfig,
): boolean {
  const estimatedCost = estimateExecutionCost(scenarioCount, config);
  return estimatedCost > config.max_budget_usd;
}

/**
 * Format execution statistics for logging.
 *
 * @param results - Execution results
 * @returns Formatted statistics string
 */
export function formatExecutionStats(results: ExecutionResult[]): string {
  const totalCost = results.reduce((sum, r) => sum + r.cost_usd, 0);
  const totalDuration = results.reduce((sum, r) => sum + r.api_duration_ms, 0);
  const totalTurns = results.reduce((sum, r) => sum + r.num_turns, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const totalTools = results.reduce(
    (sum, r) => sum + r.detected_tools.length,
    0,
  );

  const lines = [
    `Execution Statistics:`,
    `  Scenarios: ${String(results.length)}`,
    `  Total cost: $${totalCost.toFixed(4)}`,
    `  Total duration: ${String(Math.round(totalDuration / 1000))}s`,
    `  Total turns: ${String(totalTurns)}`,
    `  Total tools captured: ${String(totalTools)}`,
    `  Errors: ${String(totalErrors)}`,
  ];

  if (totalErrors > 0) {
    const errorScenarios = results.filter((r) => r.errors.length > 0);
    lines.push(
      `  Failed scenarios: ${errorScenarios.map((r) => r.scenario_id).join(", ")}`,
    );
  }

  return lines.join("\n");
}
