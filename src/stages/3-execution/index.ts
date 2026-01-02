/**
 * Stage 3: Execution
 *
 * Runs test scenarios through Claude Agent SDK with plugin loaded.
 * Captures tool invocations via PreToolUse hooks for programmatic
 * detection in Stage 4.
 *
 * Key Captures:
 * - Full conversation transcript (v3.0 format)
 * - Real-time tool invocations via PreToolUse hooks
 * - Cost and duration metrics from SDKResultMessage
 * - Model responses
 *
 * Output: results/{plugin-name}/transcripts/
 */

import {
  createRateLimiter,
  parallel,
  type ParallelResult,
} from "../../utils/concurrency.js";
import { ensureDir, getResultsDir, writeJson } from "../../utils/file-io.js";
import { logger } from "../../utils/logging.js";
import {
  createSanitizer,
  sanitizeTranscriptEvent,
} from "../../utils/sanitizer.js";

import {
  executeScenario,
  executeScenarioWithCheckpoint,
  formatExecutionStats,
  wouldExceedBudget,
  type QueryFunction,
} from "./agent-executor.js";
import {
  formatPluginLoadResult,
  isPluginLoaded,
  verifyPluginLoad,
} from "./plugin-loader.js";
import { consoleProgress } from "./progress-reporters.js";

import type {
  AnalysisOutput,
  EvalConfig,
  ExecutionResult,
  ProgressCallbacks,
  TestScenario,
} from "../../types/index.js";

/**
 * Output from Stage 3: Execution.
 */
export interface ExecutionOutput {
  plugin_name: string;
  results: ExecutionResult[];
  total_cost_usd: number;
  total_duration_ms: number;
  success_count: number;
  error_count: number;
  total_tools_captured: number;
}

/**
 * Execution progress callback.
 */
export type ExecutionProgressCallback = (
  completed: number,
  total: number,
  current?: string,
) => void;

/**
 * Run Stage 3: Execution.
 *
 * Executes all test scenarios against the plugin using the
 * Claude Agent SDK. Captures tool invocations for analysis.
 *
 * @param analysis - Output from Stage 1 (plugin analysis)
 * @param scenarios - Output from Stage 2 (test scenarios)
 * @param config - Evaluation configuration
 * @param progress - Optional progress callbacks
 * @param queryFn - Optional query function (for testing)
 * @returns Execution output with results
 *
 * @example
 * ```typescript
 * const executionOutput = await runExecution(
 *   analysisOutput,
 *   generationOutput.scenarios,
 *   config,
 *   {
 *     onScenarioComplete: (result, i, total) => {
 *       console.log(`Completed ${i}/${total}: ${result.scenario_id}`);
 *     }
 *   }
 * );
 * ```
 */
export async function runExecution(
  analysis: AnalysisOutput,
  scenarios: TestScenario[],
  config: EvalConfig,
  progress: ProgressCallbacks = consoleProgress,
  queryFn?: QueryFunction,
): Promise<ExecutionOutput> {
  logger.stageHeader("Stage 3: Execution", scenarios.length);

  const pluginPath = config.plugin.path;
  const pluginName = analysis.plugin_name;
  const startTime = Date.now();

  // Check budget before starting
  if (wouldExceedBudget(scenarios.length, config.execution)) {
    logger.warn(
      `Estimated execution cost may exceed budget of $${String(config.execution.max_budget_usd)}`,
    );
  }

  // Verify plugin loads correctly
  logger.info("Verifying plugin load...");
  const loadResult = await verifyPluginLoad({
    pluginPath,
    config: config.execution,
    queryFn,
  });

  logger.info(formatPluginLoadResult(loadResult));

  if (!isPluginLoaded(loadResult)) {
    logger.error(
      `Plugin failed to load: ${loadResult.error ?? "Unknown error"}`,
    );
    if (loadResult.recovery_hint) {
      logger.info(`Recovery hint: ${loadResult.recovery_hint}`);
    }

    // Return empty results if plugin fails to load
    return {
      plugin_name: pluginName,
      results: [],
      total_cost_usd: 0,
      total_duration_ms: Date.now() - startTime,
      success_count: 0,
      error_count: scenarios.length, // All scenarios failed
      total_tools_captured: 0,
    };
  }

  logger.success(`Plugin loaded: ${pluginName}`);
  progress.onStageStart?.("execution", scenarios.length);

  // Determine if we should use file checkpointing
  const useCheckpointing = config.rewind_file_changes;

  // Execute scenarios in parallel with concurrency control
  const parallelResult = await executeAllScenarios({
    scenarios,
    pluginPath,
    pluginName,
    config,
    useCheckpointing,
    queryFn,
    progress,
  });

  // Filter out any undefined results from failed executions
  // Note: parallel() may return undefined for failed items when continueOnError is true
  const results = parallelResult.results.filter((r): r is ExecutionResult =>
    Boolean(r),
  );

  // Calculate totals
  const totalCost = results.reduce((sum, r) => sum + r.cost_usd, 0);
  const totalDuration = Date.now() - startTime;
  const successCount = results.filter((r) => r.errors.length === 0).length;
  const errorCount = results.filter((r) => r.errors.length > 0).length;
  const totalTools = results.reduce(
    (sum, r) => sum + r.detected_tools.length,
    0,
  );

  // Log execution statistics
  logger.info(formatExecutionStats(results));

  // Save transcripts to disk
  saveTranscripts(pluginName, results, config);

  logger.success(
    `Execution complete: ${String(successCount)} succeeded, ${String(errorCount)} failed`,
  );
  progress.onStageComplete?.("execution", totalDuration, results.length);

  return {
    plugin_name: pluginName,
    results,
    total_cost_usd: totalCost,
    total_duration_ms: totalDuration,
    success_count: successCount,
    error_count: errorCount,
    total_tools_captured: totalTools,
  };
}

/**
 * Options for parallel scenario execution.
 */
interface ExecuteAllOptions {
  scenarios: TestScenario[];
  pluginPath: string;
  pluginName: string;
  config: EvalConfig;
  useCheckpointing: boolean;
  queryFn?: QueryFunction | undefined;
  progress?: ProgressCallbacks | undefined;
}

/**
 * Execute all scenarios in parallel.
 */
async function executeAllScenarios(
  options: ExecuteAllOptions,
): Promise<ParallelResult<ExecutionResult>> {
  const {
    scenarios,
    pluginPath,
    pluginName,
    config,
    useCheckpointing,
    queryFn,
    progress,
  } = options;

  const executeFn = useCheckpointing
    ? executeScenarioWithCheckpoint
    : executeScenario;

  // Create rate limiter if configured (proactive rate limit protection)
  const rps = config.execution.requests_per_second;
  const rateLimiter =
    rps !== null && rps !== undefined ? createRateLimiter(rps) : null;

  if (rateLimiter) {
    logger.info(`Rate limiting enabled: ${String(rps)} requests/second`);
  }

  return parallel({
    items: scenarios,
    concurrency: config.max_concurrent,
    fn: async (scenario, index) => {
      progress?.onScenarioStart?.(scenario, index, scenarios.length);

      // Apply rate limiting if configured
      const executeWithOptions = async (): Promise<ExecutionResult> =>
        executeFn({
          scenario,
          pluginPath,
          pluginName,
          config: config.execution,
          additionalPlugins: config.execution.additional_plugins,
          queryFn,
        });

      const result = rateLimiter
        ? await rateLimiter(executeWithOptions)
        : await executeWithOptions();

      progress?.onScenarioComplete?.(result, index + 1, scenarios.length);
      logger.progress(
        index + 1,
        scenarios.length,
        `${scenario.id}: ${result.errors.length === 0 ? "passed" : "failed"}`,
      );

      return result;
    },
    onError: (error, scenario) => {
      progress?.onError?.(error, scenario);
      logger.error(`Execution failed for ${scenario.id}: ${error.message}`);
    },
    continueOnError: true,
  });
}

/**
 * Save transcripts to disk.
 *
 * Optionally sanitizes PII from transcripts before saving when
 * config.output.sanitize_transcripts is enabled.
 *
 * @param pluginName - Plugin name for directory
 * @param results - Execution results
 * @param config - Evaluation configuration
 */
function saveTranscripts(
  pluginName: string,
  results: ExecutionResult[],
  config: EvalConfig,
): void {
  const transcriptsDir = getResultsDir(pluginName) + "/transcripts";
  ensureDir(transcriptsDir);

  // Create sanitizer if transcript sanitization is enabled
  const shouldSanitize = config.output.sanitize_transcripts;
  let sanitizer: ReturnType<typeof createSanitizer> | undefined;

  if (shouldSanitize) {
    const customPatterns = config.output.sanitization?.custom_patterns?.map(
      (p) => ({
        name: "custom",
        pattern: new RegExp(p.pattern, "g"),
        replacement: p.replacement,
      }),
    );

    // Only pass patterns if they exist to satisfy exactOptionalPropertyTypes
    sanitizer =
      customPatterns && customPatterns.length > 0
        ? createSanitizer({
            enabled: true,
            patterns: customPatterns,
            mergeWithDefaults: true,
          })
        : createSanitizer({ enabled: true });
  }

  for (const result of results) {
    // Sanitize transcript events if configured
    const transcript =
      shouldSanitize && sanitizer
        ? {
            ...result.transcript,
            events: result.transcript.events.map((event) =>
              sanitizeTranscriptEvent(event, sanitizer),
            ),
          }
        : result.transcript;

    // Sanitize permission denial messages (may contain user input)
    const permissionDenials =
      shouldSanitize && sanitizer
        ? result.permission_denials.map((d) => sanitizer(d))
        : result.permission_denials;

    const filename = `${transcriptsDir}/${result.scenario_id}.json`;
    writeJson(filename, {
      scenario_id: result.scenario_id,
      transcript,
      detected_tools: result.detected_tools,
      cost_usd: result.cost_usd,
      api_duration_ms: result.api_duration_ms,
      num_turns: result.num_turns,
      permission_denials: permissionDenials,
      errors: result.errors,
    });
  }

  const sanitizeNote = shouldSanitize ? " (sanitized)" : "";
  logger.info(
    `Saved ${String(results.length)} transcripts${sanitizeNote} to ${transcriptsDir}`,
  );
}

/**
 * Run a single scenario for quick testing.
 *
 * @param scenario - Scenario to run
 * @param pluginPath - Plugin path
 * @param config - Execution configuration
 * @param queryFn - Optional query function
 * @returns Execution result
 */
export async function runSingleScenario(
  scenario: TestScenario,
  pluginPath: string,
  config: EvalConfig,
  queryFn?: QueryFunction,
): Promise<ExecutionResult> {
  const pluginName = config.plugin.name ?? "unknown";

  return executeScenario({
    scenario,
    pluginPath,
    pluginName,
    config: config.execution,
    queryFn,
  });
}

/**
 * Resume execution from partial results.
 *
 * @param previousResults - Results from interrupted run
 * @param allScenarios - All scenarios to execute
 * @param analysis - Plugin analysis
 * @param config - Configuration
 * @param progress - Progress callbacks
 * @param queryFn - Query function
 * @returns Combined results
 */
export async function resumeExecution(
  previousResults: ExecutionResult[],
  allScenarios: TestScenario[],
  analysis: AnalysisOutput,
  config: EvalConfig,
  progress?: ProgressCallbacks,
  queryFn?: QueryFunction,
): Promise<ExecutionOutput> {
  // Find scenarios that weren't executed
  const completedIds = new Set(previousResults.map((r) => r.scenario_id));
  const remainingScenarios = allScenarios.filter(
    (s) => !completedIds.has(s.id),
  );

  logger.info(
    `Resuming execution: ${String(completedIds.size)} completed, ${String(remainingScenarios.length)} remaining`,
  );

  // Run remaining scenarios
  const newOutput = await runExecution(
    analysis,
    remainingScenarios,
    config,
    progress,
    queryFn,
  );

  // Combine results
  const combinedResults = [...previousResults, ...newOutput.results];

  return {
    ...newOutput,
    results: combinedResults,
    success_count:
      previousResults.filter((r) => r.errors.length === 0).length +
      newOutput.success_count,
    error_count:
      previousResults.filter((r) => r.errors.length > 0).length +
      newOutput.error_count,
    total_tools_captured:
      previousResults.reduce((sum, r) => sum + r.detected_tools.length, 0) +
      newOutput.total_tools_captured,
  };
}

// Re-export key types and functions from submodules

// SDK client exports
export {
  query,
  executeQuery,
  collectQueryMessages,
  type SDKMessage,
  type SDKUserMessage,
  type SDKAssistantMessage,
  type SDKToolResultMessage,
  type SDKResultMessage,
  type SDKSystemMessage,
  type SDKErrorMessage,
  type QueryObject,
  type QueryInput,
  type QueryOptions,
  type PreToolUseHookInput,
  type HookCallback,
  type HookJSONOutput,
} from "./sdk-client.js";

// Agent executor exports
export {
  executeScenario,
  executeScenarioWithCheckpoint,
  estimateExecutionCost,
  wouldExceedBudget,
  formatExecutionStats,
  type QueryFunction,
  type ScenarioExecutionOptions,
} from "./agent-executor.js";

// Plugin loader exports
export {
  verifyPluginLoad,
  isPluginLoaded,
  areMcpServersHealthy,
  getFailedMcpServers,
  formatPluginLoadResult,
  getRecoveryHint,
  inspectQueryCapabilities,
  type PluginLoaderOptions,
  type QueryInspectionResult,
} from "./plugin-loader.js";

// Hook capture exports
export {
  createToolCaptureCollector,
  analyzeCaptures,
  extractCommandName,
  extractSkillName,
  extractTaskInfo,
  filterTriggerCaptures,
  isMcpTool,
  isTriggerTool,
  parseMcpToolName,
  TRIGGER_TOOL_NAMES,
  type ToolCaptureCollector,
} from "./hook-capture.js";

// Transcript builder exports
export {
  buildTranscript,
  countAssistantTurns,
  createErrorEvent,
  extractMetrics,
  extractSessionId,
  isSuccessfulExecution,
  isUserMessage,
  isAssistantMessage,
  isToolResultMessage,
  isResultMessage,
  isSystemMessage,
  isErrorMessage,
  type TranscriptBuilderContext,
} from "./transcript-builder.js";

// Progress reporter exports
export {
  consoleProgress,
  verboseProgress,
  silentProgress,
  jsonProgress,
  createProgressReporter,
  createStreamingReporter,
  createSanitizedVerboseProgress,
} from "./progress-reporters.js";
