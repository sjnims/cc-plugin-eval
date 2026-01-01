/**
 * Default configuration values.
 */

import type { EvalConfig } from "../types/index.js";

/**
 * Default scope configuration.
 */
export const DEFAULT_SCOPE = {
  skills: true,
  agents: true,
  commands: true,
  hooks: false,
  mcp_servers: false,
} as const;

/**
 * Default generation configuration.
 */
export const DEFAULT_GENERATION = {
  model: "claude-sonnet-4-5-20250929",
  scenarios_per_component: 5,
  diversity: 0.7,
  max_tokens: 8000,
  reasoning_effort: "medium" as const,
  semantic_variations: true,
};

/**
 * Default execution configuration.
 */
export const DEFAULT_EXECUTION = {
  model: "claude-sonnet-4-20250514",
  max_turns: 5,
  timeout_ms: 60000,
  max_budget_usd: 10.0,
  session_isolation: true,
  permission_bypass: true,
  num_reps: 1,
  additional_plugins: [] as string[],
};

/**
 * Default evaluation configuration.
 */
export const DEFAULT_EVALUATION = {
  model: "claude-sonnet-4-5-20250929",
  max_tokens: 4000,
  detection_mode: "programmatic_first" as const,
  reasoning_effort: "low" as const,
  num_samples: 1,
  aggregate_method: "average" as const,
  include_citations: true,
};

/**
 * Default output configuration.
 */
export const DEFAULT_OUTPUT = {
  format: "json" as const,
  include_cli_summary: true,
  junit_test_suite_name: "cc-plugin-eval",
};

/**
 * Create default configuration with plugin path.
 *
 * @param pluginPath - Path to the plugin
 * @returns Complete configuration with defaults
 */
export function createDefaultConfig(pluginPath: string): EvalConfig {
  return {
    plugin: { path: pluginPath },
    scope: { ...DEFAULT_SCOPE },
    generation: { ...DEFAULT_GENERATION },
    execution: { ...DEFAULT_EXECUTION },
    evaluation: { ...DEFAULT_EVALUATION },
    output: { ...DEFAULT_OUTPUT },
    dry_run: false,
    estimate_costs: true,
    batch_threshold: 50,
    force_synchronous: false,
    poll_interval_ms: 30000,
    rewind_file_changes: false,
    debug: false,
    verbose: false,
    max_concurrent: 10,
  };
}
