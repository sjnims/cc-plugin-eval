/**
 * Cost Estimator - Estimate token usage and cost BEFORE running the full pipeline.
 *
 * Uses Anthropic SDK's countTokens() for accurate estimates.
 */

import Anthropic from "@anthropic-ai/sdk";

import { DEFAULT_TUNING, getResolvedTuning } from "../../config/defaults.js";
import { calculateCost, formatCost } from "../../config/pricing.js";

import { TOKENS_PER_SCENARIO } from "./batch-calculator.js";

import type {
  AnalysisOutput,
  EvalConfig,
  TokenEstimate,
  PipelineCostEstimate,
} from "../../types/index.js";

/**
 * Model name resolution map.
 * Maps short names to full model IDs.
 */
const MODEL_MAP: Record<string, string> = {
  // Opus 4.5 (latest flagship model)
  "claude-opus-4.5": "claude-opus-4-5-20251101",
  "opus-4.5": "claude-opus-4-5-20251101",
  opus: "claude-opus-4-5-20251101",

  // Sonnet 4.5 (balanced performance)
  "claude-sonnet-4.5": "claude-sonnet-4-5-20250929",
  "sonnet-4.5": "claude-sonnet-4-5-20250929",

  // Sonnet 4 (previous generation)
  "claude-sonnet-4": "claude-sonnet-4-20250514",
  "sonnet-4": "claude-sonnet-4-20250514",
  sonnet: "claude-sonnet-4-5-20250929", // Default to latest Sonnet

  // Haiku 3.5 (fast and cost-effective)
  "claude-haiku-3.5": "claude-haiku-3-5-20250929",
  "haiku-3.5": "claude-haiku-3-5-20250929",
  haiku: "claude-haiku-3-5-20250929",
};

/**
 * Resolve short model names to full model IDs.
 *
 * @param shortName - Short or full model name
 * @returns Full model ID
 */
export function resolveModelId(shortName: string): string {
  return MODEL_MAP[shortName] ?? shortName;
}

/**
 * Create Anthropic client.
 *
 * @returns Anthropic client instance
 */
export function createAnthropicClient(): Anthropic {
  return new Anthropic();
}

/**
 * Count tokens for a prompt using SDK.
 *
 * @param client - Anthropic client
 * @param model - Model to use
 * @param prompt - Prompt text
 * @returns Token count
 */
export async function countPromptTokens(
  client: Anthropic,
  model: string,
  prompt: string,
): Promise<number> {
  const result = await client.messages.countTokens({
    model: resolveModelId(model),
    messages: [{ role: "user", content: prompt }],
  });
  return result.input_tokens;
}

/**
 * Estimate generation cost for a set of prompts.
 *
 * @param client - Anthropic client
 * @param prompts - Prompts to estimate
 * @param model - Model to use
 * @returns Token estimate
 */
export async function estimateGenerationCost(
  client: Anthropic,
  prompts: string[],
  model: string,
): Promise<TokenEstimate> {
  let totalInputTokens = 0;

  for (const prompt of prompts) {
    const count = await countPromptTokens(client, model, prompt);
    totalInputTokens += count;
  }

  // Estimate output based on tokens per scenario from tuning config
  const estimatedOutputTokens =
    prompts.length * DEFAULT_TUNING.token_estimates.output_per_scenario;

  const resolvedModel = resolveModelId(model);
  const estimatedCost = calculateCost(
    resolvedModel,
    totalInputTokens,
    estimatedOutputTokens,
  );

  return {
    stage: "generation",
    input_tokens: totalInputTokens,
    estimated_output_tokens: estimatedOutputTokens,
    estimated_cost_usd: estimatedCost,
  };
}

/**
 * Estimate execution cost based on scenario count.
 *
 * @param scenarioCount - Number of scenarios
 * @param model - Execution model
 * @param numReps - Repetitions per scenario
 * @returns Token estimate
 */
export function estimateExecutionCost(
  scenarioCount: number,
  model: string,
  numReps = 1,
): TokenEstimate {
  const totalExecutions = scenarioCount * numReps;

  // Token estimates from tuning config
  const inputTokens =
    totalExecutions * DEFAULT_TUNING.token_estimates.input_per_turn;
  const outputTokens =
    totalExecutions * DEFAULT_TUNING.token_estimates.output_per_turn;

  const resolvedModel = resolveModelId(model);
  const estimatedCost = calculateCost(resolvedModel, inputTokens, outputTokens);

  return {
    stage: "execution",
    input_tokens: inputTokens,
    estimated_output_tokens: outputTokens,
    estimated_cost_usd: estimatedCost,
  };
}

/**
 * Estimate evaluation cost based on scenario count.
 *
 * @param scenarioCount - Number of scenarios
 * @param model - Evaluation model
 * @param numSamples - Samples per evaluation
 * @returns Token estimate
 */
export function estimateEvaluationCost(
  scenarioCount: number,
  model: string,
  numSamples = 1,
): TokenEstimate {
  const totalEvaluations = scenarioCount * numSamples;

  // Token estimates from tuning config
  const inputTokens =
    totalEvaluations * DEFAULT_TUNING.token_estimates.transcript_prompt;
  const outputTokens =
    totalEvaluations * DEFAULT_TUNING.token_estimates.judge_output;

  const resolvedModel = resolveModelId(model);
  const estimatedCost = calculateCost(resolvedModel, inputTokens, outputTokens);

  return {
    stage: "evaluation",
    input_tokens: inputTokens,
    estimated_output_tokens: outputTokens,
    estimated_cost_usd: estimatedCost,
  };
}

/**
 * Calculate component counts from analysis.
 *
 * @param analysis - Analysis output
 * @param config - Eval config for scope
 * @returns Component counts
 */
export function calculateComponentCounts(
  analysis: AnalysisOutput,
  config: EvalConfig,
): { skills: number; agents: number; commands: number; total: number } {
  const skills = config.scope.skills ? analysis.components.skills.length : 0;
  const agents = config.scope.agents ? analysis.components.agents.length : 0;
  const commands = config.scope.commands
    ? analysis.components.commands.length
    : 0;

  return {
    skills,
    agents,
    commands,
    total: skills + agents + commands,
  };
}

/**
 * Estimate scenario count from analysis and config.
 *
 * @param analysis - Analysis output
 * @param config - Eval config
 * @returns Estimated scenario count
 */
export function estimateScenarioCount(
  analysis: AnalysisOutput,
  config: EvalConfig,
): number {
  const counts = calculateComponentCounts(analysis, config);
  const scenariosPerComponent = config.generation.scenarios_per_component;

  // Skills and agents use LLM generation with scenarios_per_component
  // Commands use deterministic generation with ~5 scenarios each
  const skillScenarios = counts.skills * scenariosPerComponent;
  const agentScenarios = counts.agents * scenariosPerComponent;
  const commandScenarios = counts.commands * 5; // Fixed scenarios per command

  return skillScenarios + agentScenarios + commandScenarios;
}

/**
 * Estimate full pipeline cost.
 *
 * @param analysis - Analysis output
 * @param config - Eval config
 * @returns Pipeline cost estimate
 */
export function estimatePipelineCost(
  analysis: AnalysisOutput,
  config: EvalConfig,
): PipelineCostEstimate {
  const scenarioCount = estimateScenarioCount(analysis, config);
  const stages: TokenEstimate[] = [];

  // Stage 2: Generation (estimated, not using countTokens for speed)
  const counts = calculateComponentCounts(analysis, config);
  const tuning = getResolvedTuning(config.tuning);
  const genInputTokens =
    counts.skills * tuning.token_estimates.per_skill +
    counts.agents * tuning.token_estimates.per_agent +
    counts.commands * tuning.token_estimates.per_command;
  const genOutputTokens =
    counts.skills *
      TOKENS_PER_SCENARIO.skill *
      config.generation.scenarios_per_component +
    counts.agents *
      TOKENS_PER_SCENARIO.agent *
      config.generation.scenarios_per_component +
    counts.commands * TOKENS_PER_SCENARIO.command * 5;

  stages.push({
    stage: "generation",
    input_tokens: genInputTokens,
    estimated_output_tokens: genOutputTokens,
    estimated_cost_usd: calculateCost(
      resolveModelId(config.generation.model),
      genInputTokens,
      genOutputTokens,
    ),
  });

  // Stage 3: Execution
  stages.push(
    estimateExecutionCost(
      scenarioCount,
      config.execution.model,
      config.execution.num_reps,
    ),
  );

  // Stage 4: Evaluation
  stages.push(
    estimateEvaluationCost(
      scenarioCount,
      config.evaluation.model,
      config.evaluation.num_samples,
    ),
  );

  const totalCost = stages.reduce((sum, s) => sum + s.estimated_cost_usd, 0);

  return {
    stages,
    total_estimated_cost_usd: totalCost,
    within_budget: totalCost <= config.execution.max_budget_usd,
    budget_remaining_usd: config.execution.max_budget_usd - totalCost,
  };
}

/**
 * Format pipeline cost estimate for display.
 *
 * @param estimate - Pipeline cost estimate
 * @returns Formatted string
 */
export function formatPipelineCostEstimate(
  estimate: PipelineCostEstimate,
): string {
  const lines: string[] = ["Pipeline Cost Estimate:", "─".repeat(40)];

  for (const stage of estimate.stages) {
    lines.push(
      `  ${stage.stage.padEnd(12)} Input: ${stage.input_tokens.toLocaleString().padStart(8)} tokens`,
    );
    lines.push(
      `  ${"".padEnd(12)} Output: ${stage.estimated_output_tokens.toLocaleString().padStart(7)} tokens`,
    );
    lines.push(
      `  ${"".padEnd(12)} Cost: ${formatCost(stage.estimated_cost_usd).padStart(10)}`,
    );
    lines.push("");
  }

  lines.push("─".repeat(40));
  lines.push(
    `Total Estimated Cost: ${formatCost(estimate.total_estimated_cost_usd)}`,
  );
  lines.push(
    `Budget: ${formatCost(estimate.budget_remaining_usd + estimate.total_estimated_cost_usd)}`,
  );
  lines.push(
    `Status: ${estimate.within_budget ? "✓ Within budget" : "⚠ Exceeds budget"}`,
  );

  if (!estimate.within_budget) {
    lines.push(
      `Over budget by: ${formatCost(Math.abs(estimate.budget_remaining_usd))}`,
    );
  }

  return lines.join("\n");
}
