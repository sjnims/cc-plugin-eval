/**
 * Progress reporters for Stage 3: Execution.
 *
 * Provides pre-built progress callback implementations for
 * real-time progress reporting during long-running evaluations.
 */

import { DEFAULT_TUNING } from "../../config/defaults.js";

import type { ProgressCallbacks } from "../../types/index.js";

/**
 * Default console progress reporter.
 *
 * Provides minimal but informative progress output to the console.
 * Uses carriage return for in-place updates during scenario execution.
 *
 * @example
 * ```typescript
 * const output = await runExecution(
 *   analysis,
 *   scenarios,
 *   config,
 *   consoleProgress
 * );
 * ```
 */
export const consoleProgress: ProgressCallbacks = {
  onStageStart: (stage, total) => {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`STAGE: ${stage.toUpperCase()} (${String(total)} items)`);
    console.log("=".repeat(60));
  },

  onScenarioComplete: (result, index, total) => {
    const pct = Math.round((index / total) * 100);
    const status = result.errors.length > 0 ? "❌" : "✅";
    process.stdout.write(
      `\r${status} Progress: ${String(index)}/${String(total)} (${String(pct)}%) - ${result.scenario_id}`,
    );
  },

  onStageComplete: (stage, durationMs, count) => {
    const durationSec = (durationMs / 1000).toFixed(1);
    console.log(
      `\n✅ ${stage} complete: ${String(count)} items in ${durationSec}s`,
    );
  },

  onError: (error, scenario) => {
    const scenarioInfo = scenario ? ` in ${scenario.id}` : "";
    console.error(`\n❌ Error${scenarioInfo}: ${error.message}`);
  },
};

/**
 * Verbose progress reporter.
 *
 * Provides detailed progress output including scenario details,
 * costs, and tool detection information. Suitable for debugging
 * or when using the --verbose flag.
 *
 * @example
 * ```typescript
 * const output = await runExecution(
 *   analysis,
 *   scenarios,
 *   config,
 *   verboseProgress
 * );
 * ```
 */
export const verboseProgress: ProgressCallbacks = {
  // Inherit stage start/complete from console progress
  onStageStart: (stage, total): void => {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`STAGE: ${stage.toUpperCase()} (${String(total)} items)`);
    console.log("=".repeat(60));
  },

  onStageComplete: (stage, durationMs, count): void => {
    const durationSec = (durationMs / 1000).toFixed(1);
    console.log(
      `\n✅ ${stage} complete: ${String(count)} items in ${durationSec}s`,
    );
  },

  onError: (error, scenario): void => {
    const scenarioInfo = scenario ? ` in ${scenario.id}` : "";
    console.error(`\n❌ Error${scenarioInfo}: ${error.message}`);
  },

  onScenarioStart: (scenario, index, total) => {
    console.log(
      `\n[${String(index + 1)}/${String(total)}] Starting: ${scenario.id}`,
    );
    console.log(
      `  Type: ${scenario.component_type} | Expected: ${scenario.expected_trigger ? "trigger" : "no trigger"}`,
    );

    // Truncate prompt if too long (limit from tuning config)
    const maxPromptLen = DEFAULT_TUNING.limits.prompt_display_length;
    const promptDisplay =
      scenario.user_prompt.length > maxPromptLen
        ? `${scenario.user_prompt.slice(0, maxPromptLen)}...`
        : scenario.user_prompt;
    console.log(`  Prompt: ${promptDisplay}`);
  },

  onScenarioComplete: (result, _index, _total) => {
    const status = result.errors.length > 0 ? "❌ FAILED" : "✅ PASSED";
    console.log(
      `  Result: ${status} | Cost: $${result.cost_usd.toFixed(4)} | Duration: ${String(result.api_duration_ms)}ms`,
    );

    if (result.detected_tools.length > 0) {
      const toolNames = result.detected_tools.map((t) => t.name).join(", ");
      console.log(`  Detected: ${toolNames}`);
    }

    if (result.permission_denials.length > 0) {
      console.log(`  Denials: ${result.permission_denials.join(", ")}`);
    }
  },
};

/**
 * Silent progress reporter.
 *
 * No output - useful for testing or when output should be suppressed.
 *
 * @example
 * ```typescript
 * const output = await runExecution(
 *   analysis,
 *   scenarios,
 *   config,
 *   silentProgress
 * );
 * ```
 */
export const silentProgress: ProgressCallbacks = {
  // All callbacks are undefined - no output
};

/**
 * JSON progress reporter.
 *
 * Outputs progress as JSON lines for machine parsing.
 * Useful for CI/CD integration or log aggregation.
 *
 * @example
 * ```typescript
 * const output = await runExecution(
 *   analysis,
 *   scenarios,
 *   config,
 *   jsonProgress
 * );
 * ```
 */
export const jsonProgress: ProgressCallbacks = {
  onStageStart: (stage, total) => {
    console.log(
      JSON.stringify({
        event: "stage_start",
        stage,
        total,
        timestamp: new Date().toISOString(),
      }),
    );
  },

  onScenarioStart: (scenario, index, total) => {
    console.log(
      JSON.stringify({
        event: "scenario_start",
        scenario_id: scenario.id,
        index,
        total,
        component_type: scenario.component_type,
        expected_trigger: scenario.expected_trigger,
        timestamp: new Date().toISOString(),
      }),
    );
  },

  onScenarioComplete: (result, index, total) => {
    console.log(
      JSON.stringify({
        event: "scenario_complete",
        scenario_id: result.scenario_id,
        index,
        total,
        success: result.errors.length === 0,
        cost_usd: result.cost_usd,
        duration_ms: result.api_duration_ms,
        tools_detected: result.detected_tools.length,
        errors: result.errors.length,
        timestamp: new Date().toISOString(),
      }),
    );
  },

  onStageComplete: (stage, durationMs, count) => {
    console.log(
      JSON.stringify({
        event: "stage_complete",
        stage,
        duration_ms: durationMs,
        count,
        timestamp: new Date().toISOString(),
      }),
    );
  },

  onError: (error, scenario) => {
    console.log(
      JSON.stringify({
        event: "error",
        scenario_id: scenario?.id,
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
    );
  },
};

/**
 * Create a custom progress reporter by merging with defaults.
 *
 * @param overrides - Callbacks to override
 * @param base - Base callbacks to extend (defaults to consoleProgress)
 * @returns Merged progress callbacks
 *
 * @example
 * ```typescript
 * const customProgress = createProgressReporter({
 *   onScenarioComplete: (result, index, total) => {
 *     // Custom completion logic
 *     sendToMonitoringService(result);
 *   }
 * });
 * ```
 */
export function createProgressReporter(
  overrides: Partial<ProgressCallbacks>,
  base: ProgressCallbacks = consoleProgress,
): ProgressCallbacks {
  return {
    ...base,
    ...overrides,
  };
}

/**
 * Create a progress reporter that writes to a callback stream.
 *
 * Useful for custom integrations or streaming progress to a UI.
 *
 * @param callback - Callback for each progress event
 * @returns Progress callbacks
 */
export function createStreamingReporter(
  callback: (event: { type: string; data: Record<string, unknown> }) => void,
): ProgressCallbacks {
  return {
    onStageStart: (stage, total): void => {
      callback({ type: "stage_start", data: { stage, total } });
    },

    onScenarioStart: (scenario, index, total): void => {
      callback({
        type: "scenario_start",
        data: {
          scenario_id: scenario.id,
          index,
          total,
          component_type: scenario.component_type,
        },
      });
    },

    onScenarioComplete: (result, index, total): void => {
      callback({
        type: "scenario_complete",
        data: {
          scenario_id: result.scenario_id,
          index,
          total,
          success: result.errors.length === 0,
          cost_usd: result.cost_usd,
          tools_detected: result.detected_tools.length,
        },
      });
    },

    onStageComplete: (stage, durationMs, count): void => {
      callback({
        type: "stage_complete",
        data: { stage, duration_ms: durationMs, count },
      });
    },

    onError: (error, scenario): void => {
      callback({
        type: "error",
        data: { scenario_id: scenario?.id, error: error.message },
      });
    },
  };
}
