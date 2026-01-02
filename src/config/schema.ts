/**
 * Zod validation schemas for configuration.
 */

import { z } from "zod";

/**
 * Timeouts configuration schema.
 */
export const TimeoutsConfigSchema = z.object({
  plugin_load_ms: z.number().int().min(5000).max(120000).default(30000),
  retry_initial_ms: z.number().int().min(100).max(10000).default(1000),
  retry_max_ms: z.number().int().min(1000).max(120000).default(30000),
});

/**
 * Retry configuration schema.
 */
export const RetryConfigSchema = z.object({
  max_retries: z.number().int().min(0).max(10).default(3),
  backoff_multiplier: z.number().min(1).max(5).default(2),
  jitter_factor: z.number().min(0).max(1).default(0.1),
});

/**
 * Token estimates configuration schema.
 */
export const TokenEstimatesConfigSchema = z.object({
  output_per_scenario: z.number().int().min(100).max(5000).default(800),
  transcript_prompt: z.number().int().min(500).max(10000).default(3000),
  judge_output: z.number().int().min(100).max(2000).default(500),
  input_per_turn: z.number().int().min(100).max(5000).default(500),
  output_per_turn: z.number().int().min(500).max(10000).default(2000),
  per_skill: z.number().int().min(100).max(2000).default(600),
  per_agent: z.number().int().min(100).max(3000).default(800),
  per_command: z.number().int().min(50).max(1000).default(300),
  semantic_gen_max_tokens: z.number().int().min(500).max(4000).default(1000),
});

/**
 * Display limits configuration schema.
 */
export const LimitsConfigSchema = z.object({
  transcript_content_length: z.number().int().min(100).max(2000).default(500),
  prompt_display_length: z.number().int().min(20).max(500).default(80),
  progress_bar_width: z.number().int().min(5).max(100).default(20),
  conflict_domain_part_min: z.number().int().min(1).max(10).default(4),
});

/**
 * Batching configuration schema.
 */
export const BatchingConfigSchema = z.object({
  safety_margin: z.number().min(0.5).max(1).default(0.75),
});

/**
 * Complete tuning configuration schema.
 */
export const TuningConfigSchema = z.object({
  timeouts: TimeoutsConfigSchema.default({}),
  retry: RetryConfigSchema.default({}),
  token_estimates: TokenEstimatesConfigSchema.default({}),
  limits: LimitsConfigSchema.default({}),
  batching: BatchingConfigSchema.default({}),
});

/**
 * Plugin configuration schema.
 */
export const PluginConfigSchema = z.object({
  path: z.string().min(1, "Plugin path is required"),
  name: z.string().optional(),
});

/**
 * Marketplace configuration schema.
 */
export const MarketplaceConfigSchema = z.object({
  path: z.string().optional(),
  evaluate_all: z.boolean().default(false),
});

/**
 * Scope configuration schema.
 */
export const ScopeConfigSchema = z.object({
  skills: z.boolean().default(true),
  agents: z.boolean().default(true),
  commands: z.boolean().default(true),
  hooks: z.boolean().default(false),
  mcp_servers: z.boolean().default(false),
});

/**
 * Reasoning effort level schema.
 */
export const ReasoningEffortSchema = z.enum(["none", "low", "medium", "high"]);

/**
 * Generation configuration schema.
 */
export const GenerationConfigSchema = z.object({
  model: z.string().default("claude-sonnet-4-5-20250929"),
  scenarios_per_component: z.number().int().min(1).max(20).default(5),
  diversity: z.number().min(0).max(1).default(0.7),
  max_tokens: z.number().int().min(1000).max(32000).default(8000),
  reasoning_effort: ReasoningEffortSchema.default("medium"),
  semantic_variations: z.boolean().default(true),
});

/**
 * Execution configuration schema.
 */
export const ExecutionConfigSchema = z.object({
  model: z.string().default("claude-sonnet-4-20250514"),
  max_turns: z.number().int().min(1).max(20).default(5),
  timeout_ms: z.number().int().min(5000).max(300000).default(60000),
  max_budget_usd: z.number().min(0.1).max(1000).default(10.0),
  session_isolation: z.boolean().default(true),
  permission_bypass: z.boolean().default(true),
  allowed_tools: z.array(z.string()).optional(),
  disallowed_tools: z.array(z.string()).optional(),
  num_reps: z.number().int().min(1).max(10).default(1),
  additional_plugins: z.array(z.string()).default([]),
});

/**
 * Detection mode schema.
 */
export const DetectionModeSchema = z.enum(["programmatic_first", "llm_only"]);

/**
 * Aggregate method schema.
 */
export const AggregateMethodSchema = z.enum(["average", "median", "consensus"]);

/**
 * Evaluation configuration schema.
 */
export const EvaluationConfigSchema = z.object({
  model: z.string().default("claude-sonnet-4-5-20250929"),
  max_tokens: z.number().int().min(1000).max(16000).default(4000),
  detection_mode: DetectionModeSchema.default("programmatic_first"),
  reasoning_effort: ReasoningEffortSchema.default("low"),
  num_samples: z.number().int().min(1).max(5).default(1),
  aggregate_method: AggregateMethodSchema.default("average"),
  include_citations: z.boolean().default(true),
});

/**
 * Output format schema.
 */
export const OutputFormatSchema = z.enum(["json", "yaml", "junit-xml", "tap"]);

/**
 * Output configuration schema.
 */
export const OutputConfigSchema = z.object({
  format: OutputFormatSchema.default("json"),
  include_cli_summary: z.boolean().default(true),
  junit_test_suite_name: z.string().default("cc-plugin-eval"),
});

/**
 * Pipeline stage schema.
 */
export const PipelineStageSchema = z.enum([
  "analysis",
  "generation",
  "execution",
  "evaluation",
]);

/**
 * Resume configuration schema.
 */
export const ResumeConfigSchema = z.object({
  run_id: z.string().optional(),
  from_stage: PipelineStageSchema.optional(),
});

/**
 * Fast mode configuration schema.
 */
export const FastModeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  failed_run_id: z.string().optional(),
});

/**
 * MCP servers configuration schema.
 */
export const McpServersConfigSchema = z.object({
  skip_auth_required: z.boolean().default(true),
  connection_timeout_ms: z.number().int().min(1000).max(60000).default(10000),
});

/**
 * Conflict detection configuration schema.
 */
export const ConflictDetectionConfigSchema = z.object({
  enabled: z.boolean().default(true),
  cross_plugin: z.boolean().default(false),
});

/**
 * Complete evaluation configuration schema.
 */
export const EvalConfigSchema = z.object({
  plugin: PluginConfigSchema,
  marketplace: MarketplaceConfigSchema.optional(),
  scope: ScopeConfigSchema.default({}),
  generation: GenerationConfigSchema.default({}),
  execution: ExecutionConfigSchema.default({}),
  evaluation: EvaluationConfigSchema.default({}),
  output: OutputConfigSchema.default({}),
  resume: ResumeConfigSchema.optional(),
  fast_mode: FastModeConfigSchema.optional(),
  tuning: TuningConfigSchema.optional(),
  dry_run: z.boolean().default(false),
  estimate_costs: z.boolean().default(true),
  batch_threshold: z.number().int().min(1).default(50),
  force_synchronous: z.boolean().default(false),
  poll_interval_ms: z.number().int().min(1000).default(30000),
  rewind_file_changes: z.boolean().default(false),
  mcp_servers: McpServersConfigSchema.optional(),
  conflict_detection: ConflictDetectionConfigSchema.optional(),
  debug: z.boolean().default(false),
  verbose: z.boolean().default(false),
  max_concurrent: z.number().int().min(1).max(50).default(10),
});

/**
 * Type inference from schema.
 */
export type ValidatedEvalConfig = z.infer<typeof EvalConfigSchema>;
