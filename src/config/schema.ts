/**
 * Zod validation schemas for configuration.
 */

import { z } from "zod";

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
