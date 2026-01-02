/**
 * Configuration type definitions.
 * Represents the config.yaml configuration structure.
 */

/**
 * Plugin configuration.
 */
export interface PluginConfig {
  path: string;
  /** Optional name override */
  name?: string;
}

/**
 * Marketplace configuration.
 */
export interface MarketplaceConfig {
  /** Path to marketplace directory */
  path?: string;
  /** Evaluate all plugins in marketplace */
  evaluate_all: boolean;
}

/**
 * Scope configuration - which components to evaluate.
 */
export interface ScopeConfig {
  skills: boolean;
  agents: boolean;
  commands: boolean;
  hooks: boolean;
  mcp_servers: boolean;
}

/**
 * Reasoning effort level.
 */
export type ReasoningEffort = "none" | "low" | "medium" | "high";

/**
 * Generation stage configuration.
 */
export interface GenerationConfig {
  model: string;
  scenarios_per_component: number;
  /** Base:variation ratio (0-1) */
  diversity: number;
  max_tokens: number;
  reasoning_effort: ReasoningEffort;
  /** Generate semantic synonym variations for skills */
  semantic_variations: boolean;
}

/**
 * Execution stage configuration.
 */
export interface ExecutionConfig {
  model: string;
  max_turns: number;
  timeout_ms: number;
  /** Stop if cost exceeds */
  max_budget_usd: number;
  /** Prevent cross-contamination */
  session_isolation: boolean;
  /** Automate without prompts */
  permission_bypass: boolean;
  /** null = all tools, or list for restrictions */
  allowed_tools?: string[];
  /** Block certain tools during eval */
  disallowed_tools?: string[];
  /** Repetitions per scenario */
  num_reps: number;
  /** Load alongside target plugin for conflict testing */
  additional_plugins: string[];
}

/**
 * Detection mode for evaluation.
 */
export type DetectionMode = "programmatic_first" | "llm_only";

/**
 * Aggregation method for multi-sample judgment.
 */
export type AggregateMethod = "average" | "median" | "consensus";

/**
 * Evaluation stage configuration.
 */
export interface EvaluationConfig {
  model: string;
  max_tokens: number;
  detection_mode: DetectionMode;
  reasoning_effort: ReasoningEffort;
  /** Multi-sample judgment for robustness */
  num_samples: number;
  aggregate_method: AggregateMethod;
  /** Link highlights to message IDs */
  include_citations: boolean;
}

/**
 * Output format options.
 */
export type OutputFormat = "json" | "yaml" | "junit-xml" | "tap";

/**
 * Output configuration.
 */
export interface OutputConfig {
  format: OutputFormat;
  include_cli_summary: boolean;
  /** Suite name for JUnit XML output */
  junit_test_suite_name: string;
}

/**
 * Resume configuration.
 */
export interface ResumeConfig {
  /** Previous run to resume from */
  run_id?: string;
  /** Stage to resume: analysis|generation|execution|evaluation */
  from_stage?: "analysis" | "generation" | "execution" | "evaluation";
}

/**
 * Fast/regression mode configuration.
 */
export interface FastModeConfig {
  /** Only run previously failed scenarios */
  enabled: boolean;
  /** Run ID to get failed scenarios from */
  failed_run_id?: string | undefined;
}

/**
 * MCP server testing configuration.
 */
export interface McpServersConfig {
  /** Skip servers needing OAuth */
  skip_auth_required: boolean;
  /** Timeout for server connection */
  connection_timeout_ms: number;
}

/**
 * Cross-plugin conflict detection configuration.
 */
export interface ConflictDetectionConfig {
  enabled: boolean;
  /** Detect conflicts with additional_plugins */
  cross_plugin: boolean;
}

/**
 * Timeouts configuration.
 */
export interface TimeoutsConfig {
  plugin_load_ms: number;
  retry_initial_ms: number;
  retry_max_ms: number;
}

/**
 * Retry configuration.
 */
export interface RetryTuningConfig {
  max_retries: number;
  backoff_multiplier: number;
  jitter_factor: number;
}

/**
 * Token estimates configuration.
 */
export interface TokenEstimatesConfig {
  output_per_scenario: number;
  transcript_prompt: number;
  judge_output: number;
  input_per_turn: number;
  output_per_turn: number;
  per_skill: number;
  per_agent: number;
  per_command: number;
  semantic_gen_max_tokens: number;
}

/**
 * Display limits configuration.
 */
export interface LimitsConfig {
  transcript_content_length: number;
  prompt_display_length: number;
  progress_bar_width: number;
  conflict_domain_part_min: number;
}

/**
 * Batching configuration.
 */
export interface BatchingConfig {
  safety_margin: number;
}

/**
 * Tuning configuration for runtime-adjustable parameters.
 */
export interface TuningConfig {
  timeouts: TimeoutsConfig;
  retry: RetryTuningConfig;
  token_estimates: TokenEstimatesConfig;
  limits: LimitsConfig;
  batching: BatchingConfig;
}

/**
 * Complete evaluation configuration.
 */
export interface EvalConfig {
  plugin: PluginConfig;
  marketplace?: MarketplaceConfig;
  scope: ScopeConfig;
  generation: GenerationConfig;
  execution: ExecutionConfig;
  evaluation: EvaluationConfig;
  output: OutputConfig;
  resume?: ResumeConfig;
  fast_mode?: FastModeConfig;
  /** Runtime-adjustable tuning parameters */
  tuning?: TuningConfig;
  /** Generate scenarios without execution */
  dry_run: boolean;
  /** Show cost estimate before execution */
  estimate_costs: boolean;
  /** Use Batches API when >= this many scenarios */
  batch_threshold: number;
  /** Force individual API calls */
  force_synchronous: boolean;
  /** Batch status polling interval */
  poll_interval_ms: number;
  /** Undo file changes after each scenario */
  rewind_file_changes: boolean;
  mcp_servers?: McpServersConfig;
  conflict_detection?: ConflictDetectionConfig;
  debug: boolean;
  verbose: boolean;
  max_concurrent: number;
}
