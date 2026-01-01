/**
 * Model pricing configuration.
 * Externalized for easy updates without code changes.
 * Last updated: 2026-01-01
 */

import type { ModelPricing } from "../types/index.js";

/**
 * Model pricing per 1M tokens.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Opus 4.5 (flagship)
  "claude-opus-4-5-20251101": { input: 15.0, output: 75.0 },

  // Sonnet 4.5 (balanced)
  "claude-sonnet-4-5-20250929": { input: 3.0, output: 15.0 },

  // Sonnet 4 (previous gen)
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },

  // Haiku 3.5 (fast/cheap)
  "claude-haiku-3-5-20250929": { input: 0.8, output: 4.0 },
};

/**
 * Default pricing fallback.
 */
const DEFAULT_PRICING: ModelPricing = { input: 3.0, output: 15.0 };

/**
 * Get pricing for a model, with fallback to default.
 *
 * @param modelId - Full model identifier
 * @returns Model pricing
 */
export function getModelPricing(modelId: string): ModelPricing {
  return MODEL_PRICING[modelId] ?? DEFAULT_PRICING;
}

/**
 * Calculate cost for a given usage.
 *
 * @param modelId - Full model identifier
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Cost in USD
 */
export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = getModelPricing(modelId);
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );
}

/**
 * Format cost for display.
 *
 * @param costUsd - Cost in USD
 * @returns Formatted string
 */
export function formatCost(costUsd: number): string {
  if (costUsd < 0.01) {
    return `$${costUsd.toFixed(4)}`;
  }
  return `$${costUsd.toFixed(2)}`;
}
