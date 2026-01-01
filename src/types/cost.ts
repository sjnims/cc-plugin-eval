/**
 * Token and cost estimation type definitions.
 */

/**
 * Model pricing per 1M tokens.
 */
export interface ModelPricing {
  /** $ per 1M input tokens */
  input: number;
  /** $ per 1M output tokens */
  output: number;
}

/**
 * Token estimate for a pipeline stage.
 */
export interface TokenEstimate {
  stage: "generation" | "execution" | "evaluation";
  input_tokens: number;
  estimated_output_tokens: number;
  estimated_cost_usd: number;
}

/**
 * Complete pipeline cost estimate.
 */
export interface PipelineCostEstimate {
  stages: TokenEstimate[];
  total_estimated_cost_usd: number;
  within_budget: boolean;
  budget_remaining_usd: number;
}
