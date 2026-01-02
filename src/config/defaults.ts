/**
 * Default configuration values.
 */

import type { EvalConfig, TuningConfig } from "../types/index.js";

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
 * Default tuning configuration.
 * These values can be overridden in config.yaml under the `tuning` section.
 */
export const DEFAULT_TUNING: TuningConfig = {
  timeouts: {
    plugin_load_ms: 30000,
    retry_initial_ms: 1000,
    retry_max_ms: 30000,
  },
  retry: {
    max_retries: 3,
    backoff_multiplier: 2,
    jitter_factor: 0.1,
  },
  token_estimates: {
    output_per_scenario: 800,
    transcript_prompt: 3000,
    judge_output: 500,
    input_per_turn: 500,
    output_per_turn: 2000,
    per_skill: 600,
    per_agent: 800,
    per_command: 300,
    semantic_gen_max_tokens: 1000,
  },
  limits: {
    transcript_content_length: 500,
    prompt_display_length: 80,
    progress_bar_width: 20,
    conflict_domain_part_min: 4,
  },
  batching: {
    safety_margin: 0.75,
  },
};

/**
 * Get resolved tuning configuration with defaults.
 *
 * Merges user-provided tuning config with defaults, ensuring all values
 * are present even if the user only overrides a subset.
 *
 * @param tuning - User-provided tuning config (optional)
 * @returns Complete tuning configuration with defaults applied
 */
export function getResolvedTuning(
  tuning?: Partial<TuningConfig>,
): TuningConfig {
  if (!tuning) {
    return DEFAULT_TUNING;
  }

  return {
    timeouts: { ...DEFAULT_TUNING.timeouts, ...tuning.timeouts },
    retry: { ...DEFAULT_TUNING.retry, ...tuning.retry },
    token_estimates: {
      ...DEFAULT_TUNING.token_estimates,
      ...tuning.token_estimates,
    },
    limits: { ...DEFAULT_TUNING.limits, ...tuning.limits },
    batching: { ...DEFAULT_TUNING.batching, ...tuning.batching },
  };
}

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
    tuning: { ...DEFAULT_TUNING },
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
