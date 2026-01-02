/**
 * Batch Calculator - Calculate optimal batch size for scenario generation.
 *
 * Formula:
 *   available_tokens = (max_output_tokens - thinking_budget) × safety_margin
 *   batch_size = available_tokens / tokens_per_scenario
 *
 * Model-specific limits:
 *   - Claude 3.x: 8K observed max (even if higher advertised)
 *   - Claude 4.x with thinking: subtract thinking_budget from max
 */

import { DEFAULT_TUNING } from "../../config/defaults.js";

import type { ComponentType, ReasoningEffort } from "../../types/index.js";

/**
 * Batch configuration.
 */
export interface BatchConfig {
  model: string;
  maxOutputTokens: number;
  thinkingBudget: number;
  safetyMargin: number;
}

/**
 * Batch calculation result.
 */
export interface BatchCalculation {
  batchSize: number;
  tokensPerScenario: number;
  availableTokens: number;
  estimatedBatches: number;
}

/**
 * Estimated tokens per generated scenario by component type.
 * Values are sourced from DEFAULT_TUNING for centralized configuration.
 */
export const TOKENS_PER_SCENARIO: Record<ComponentType, number> = {
  skill: DEFAULT_TUNING.token_estimates.per_skill,
  agent: DEFAULT_TUNING.token_estimates.per_agent,
  command: DEFAULT_TUNING.token_estimates.per_command,
};

/**
 * Thinking budget by reasoning effort level.
 */
export const THINKING_BUDGET: Record<ReasoningEffort, number> = {
  none: 0,
  low: 1024,
  medium: 2048,
  high: 4096,
};

/**
 * Default max output tokens by model family.
 */
export const MODEL_MAX_TOKENS: Record<string, number> = {
  // Opus 4.5
  "claude-opus-4-5-20251101": 16000,

  // Sonnet 4.5
  "claude-sonnet-4-5-20250929": 16000,

  // Sonnet 4
  "claude-sonnet-4-20250514": 16000,

  // Haiku 3.5
  "claude-haiku-3-5-20250929": 8000,
};

/**
 * Default safety margin for token calculations.
 * Value is sourced from DEFAULT_TUNING for centralized configuration.
 */
export const DEFAULT_SAFETY_MARGIN = DEFAULT_TUNING.batching.safety_margin;

/**
 * Get max output tokens for a model.
 *
 * @param model - Model identifier
 * @returns Max output tokens
 */
export function getModelMaxTokens(model: string): number {
  return MODEL_MAX_TOKENS[model] ?? 8000;
}

/**
 * Calculate optimal batch size for scenario generation.
 *
 * @param config - Batch configuration
 * @param componentType - Type of component being generated
 * @returns Batch calculation result
 */
export function calculateOptimalBatchSize(
  config: BatchConfig,
  componentType: ComponentType,
): BatchCalculation {
  const tokensPerScenario = TOKENS_PER_SCENARIO[componentType];
  const availableTokens =
    (config.maxOutputTokens - config.thinkingBudget) * config.safetyMargin;
  const batchSize = Math.max(
    1,
    Math.floor(availableTokens / tokensPerScenario),
  );

  return {
    batchSize,
    tokensPerScenario,
    availableTokens,
    estimatedBatches: 1, // Updated when we know total count
  };
}

/**
 * Create batch configuration from generation config.
 *
 * @param model - Model identifier
 * @param maxTokens - Max tokens from config
 * @param reasoningEffort - Reasoning effort level
 * @param safetyMargin - Safety margin (default 0.75)
 * @returns Batch configuration
 */
export function createBatchConfig(
  model: string,
  maxTokens: number,
  reasoningEffort: ReasoningEffort,
  safetyMargin: number = DEFAULT_SAFETY_MARGIN,
): BatchConfig {
  return {
    model,
    maxOutputTokens: maxTokens || getModelMaxTokens(model),
    thinkingBudget: THINKING_BUDGET[reasoningEffort],
    safetyMargin,
  };
}

/**
 * Calculate batch distribution for a component count.
 *
 * @param totalComponents - Number of components to process
 * @param batchSize - Maximum components per batch
 * @returns Array of batch sizes
 */
export function calculateBatches(
  totalComponents: number,
  batchSize: number,
): number[] {
  const batches: number[] = [];
  let remaining = totalComponents;

  while (remaining > 0) {
    const currentBatch = Math.min(remaining, batchSize);
    batches.push(currentBatch);
    remaining -= currentBatch;
  }

  return batches;
}

/**
 * Estimate tokens for a batch of scenarios.
 *
 * @param scenarioCount - Number of scenarios in batch
 * @param componentType - Type of component
 * @returns Estimated token count
 */
export function estimateBatchTokens(
  scenarioCount: number,
  componentType: ComponentType,
): number {
  return scenarioCount * TOKENS_PER_SCENARIO[componentType];
}

/**
 * Check if a batch would exceed available tokens.
 *
 * @param scenarioCount - Number of scenarios
 * @param componentType - Type of component
 * @param availableTokens - Available output tokens
 * @returns Whether batch exceeds limit
 */
export function wouldExceedTokenLimit(
  scenarioCount: number,
  componentType: ComponentType,
  availableTokens: number,
): boolean {
  return estimateBatchTokens(scenarioCount, componentType) > availableTokens;
}
