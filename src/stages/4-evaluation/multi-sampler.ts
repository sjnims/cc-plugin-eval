/**
 * Multi-Sampling Judgment - Statistical robustness through multiple judge runs.
 *
 * Runs the LLM judge N times and aggregates results to reduce variance
 * and increase reliability of quality assessments.
 *
 * Aggregation methods:
 * - average: Mean of all scores
 * - median: Middle value when sorted
 * - consensus: Most common value (mode)
 */

import { evaluateWithFallback } from "./llm-judge.js";

import type {
  AggregateMethod,
  EvaluationConfig,
  JudgeResponse,
  MultiSampleResult,
  ProgrammaticDetection,
  TestScenario,
  Transcript,
} from "../../types/index.js";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * Aggregate scores using the specified method.
 *
 * @param scores - Array of scores to aggregate
 * @param method - Aggregation method
 * @returns Aggregated score
 *
 * @example
 * ```typescript
 * aggregateScores([7, 8, 7, 9, 8], 'average') // 7.8
 * aggregateScores([7, 8, 7, 9, 8], 'median')  // 8
 * aggregateScores([7, 8, 7, 9, 8], 'consensus') // 7 or 8
 * ```
 */
export function aggregateScores(
  scores: number[],
  method: AggregateMethod,
): number {
  if (scores.length === 0) {
    return 0;
  }

  switch (method) {
    case "average":
      return scores.reduce((a, b) => a + b, 0) / scores.length;

    case "median": {
      const sorted = [...scores].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0
        ? (sorted[mid] ?? 0)
        : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
    }

    case "consensus": {
      // Most common score (mode), fall back to first value
      const counts = new Map<number, number>();
      for (const score of scores) {
        counts.set(score, (counts.get(score) ?? 0) + 1);
      }

      let maxCount = 0;
      let mode = scores[0] ?? 0;
      counts.forEach((count, score) => {
        if (count > maxCount) {
          maxCount = count;
          mode = score;
        }
      });

      return mode;
    }

    default:
      // TypeScript exhaustiveness check
      return scores[0] ?? 0;
  }
}

/**
 * Calculate variance of scores.
 *
 * @param scores - Array of scores
 * @returns Variance
 */
export function calculateVariance(scores: number[]): number {
  if (scores.length === 0) {
    return 0;
  }

  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  return (
    scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length
  );
}

/**
 * Calculate standard deviation of scores.
 *
 * @param scores - Array of scores
 * @returns Standard deviation
 */
export function calculateStdDev(scores: number[]): number {
  return Math.sqrt(calculateVariance(scores));
}

/**
 * Get majority vote for trigger accuracy.
 *
 * @param votes - Array of trigger accuracy values
 * @returns Most common value
 */
export function getMajorityVote(
  votes: ("correct" | "incorrect" | "partial")[],
): "correct" | "incorrect" | "partial" {
  if (votes.length === 0) {
    return "incorrect";
  }

  const counts = { correct: 0, incorrect: 0, partial: 0 };
  for (const v of votes) {
    counts[v]++;
  }

  // Find the highest count
  let maxKey: "correct" | "incorrect" | "partial" = "incorrect";
  let maxCount = 0;
  (Object.entries(counts) as [keyof typeof counts, number][]).forEach(
    ([key, count]) => {
      if (count > maxCount) {
        maxCount = count;
        maxKey = key;
      }
    },
  );

  return maxKey;
}

/**
 * Check if all votes are unanimous (all samples agree on trigger_accuracy).
 *
 * @param votes - Array of trigger accuracy values
 * @returns True if all votes are the same
 *
 * @example
 * ```typescript
 * isUnanimousVote(['correct', 'correct', 'correct']) // true
 * isUnanimousVote(['correct', 'incorrect', 'correct']) // false
 * isUnanimousVote([]) // true (vacuously true)
 * isUnanimousVote(['correct']) // true
 * ```
 */
export function isUnanimousVote(
  votes: ("correct" | "incorrect" | "partial")[],
): boolean {
  if (votes.length <= 1) {
    return true;
  }
  const first = votes[0];
  return votes.every((v) => v === first);
}

/**
 * Evaluate with multi-sampling for statistical robustness.
 *
 * Runs the judge N times and aggregates results.
 *
 * @param client - Anthropic client
 * @param scenario - Test scenario
 * @param transcript - Execution transcript
 * @param programmaticResult - Programmatic detection results
 * @param config - Evaluation configuration
 * @returns Multi-sample result with aggregated scores
 *
 * @example
 * ```typescript
 * const result = await evaluateWithMultiSampling(
 *   client,
 *   scenario,
 *   transcript,
 *   detections,
 *   { ...config, num_samples: 3 }
 * );
 *
 * console.log(`Score: ${result.aggregated_score} (variance: ${result.score_variance})`);
 * ```
 */
export async function evaluateWithMultiSampling(
  client: Anthropic,
  scenario: TestScenario,
  transcript: Transcript,
  programmaticResult: ProgrammaticDetection[],
  config: EvaluationConfig,
): Promise<MultiSampleResult> {
  const numSamples = config.num_samples || 1;
  const responses: JudgeResponse[] = [];

  // Run judge multiple times
  for (let i = 0; i < numSamples; i++) {
    const response = await evaluateWithFallback(
      client,
      scenario,
      transcript,
      programmaticResult,
      config,
    );
    responses.push(response);
  }

  // Aggregate results
  const qualityScores = responses.map((r) => r.quality_score);
  const relevanceScores = responses.map((r) => r.response_relevance);
  const aggregatedQuality = aggregateScores(
    qualityScores,
    config.aggregate_method,
  );
  const aggregatedRelevance = aggregateScores(
    relevanceScores,
    config.aggregate_method,
  );
  const variance = calculateVariance(qualityScores);

  // Consensus on trigger accuracy (majority vote)
  const accuracyVotes = responses.map((r) => r.trigger_accuracy);
  const consensus = getMajorityVote(accuracyVotes);
  const isUnanimous = isUnanimousVote(accuracyVotes);

  // Collect all unique issues
  const allIssues = [...new Set(responses.flatMap((r) => r.issues))];

  // Use first response as representative (it has the full structure)
  const representative: JudgeResponse = {
    ...(responses[0] ?? {
      quality_score: 0,
      response_relevance: 0,
      trigger_accuracy: "incorrect",
      issues: [],
      summary: "No responses",
    }),
    // Override with aggregated values
    quality_score: aggregatedQuality,
    response_relevance: aggregatedRelevance,
    trigger_accuracy: consensus,
    issues: allIssues,
  };

  return {
    individual_scores: qualityScores,
    aggregated_score: aggregatedQuality,
    score_variance: variance,
    consensus_trigger_accuracy: consensus,
    is_unanimous: isUnanimous,
    all_issues: allIssues,
    representative_response: representative,
  };
}

/**
 * Check if variance is below threshold.
 *
 * Low variance indicates consistent judgment across samples.
 *
 * @param variance - Score variance
 * @param threshold - Maximum acceptable variance
 * @returns True if variance is acceptable
 */
export function isLowVariance(variance: number, threshold = 1.0): boolean {
  return variance < threshold;
}

/**
 * Get confidence level based on agreement.
 *
 * @param responses - Array of judge responses
 * @returns Confidence level string
 */
export function getConfidenceLevel(
  responses: JudgeResponse[],
): "high" | "medium" | "low" {
  if (responses.length === 0) {
    return "low";
  }

  const scores = responses.map((r) => r.quality_score);
  const variance = calculateVariance(scores);

  // All samples agree on trigger accuracy
  const accuracies = responses.map((r) => r.trigger_accuracy);
  const allAgree = accuracies.every((a) => a === accuracies[0]);

  if (allAgree && variance < 0.5) {
    return "high";
  }

  if (variance < 1.5) {
    return "medium";
  }

  return "low";
}

/**
 * Single sample evaluation (no multi-sampling).
 *
 * Wrapper for cases where num_samples = 1.
 *
 * @param client - Anthropic client
 * @param scenario - Test scenario
 * @param transcript - Execution transcript
 * @param programmaticResult - Programmatic detection results
 * @param config - Evaluation configuration
 * @returns Multi-sample result with single sample
 */
export async function evaluateSingleSample(
  client: Anthropic,
  scenario: TestScenario,
  transcript: Transcript,
  programmaticResult: ProgrammaticDetection[],
  config: EvaluationConfig,
): Promise<MultiSampleResult> {
  const response = await evaluateWithFallback(
    client,
    scenario,
    transcript,
    programmaticResult,
    config,
  );

  return {
    individual_scores: [response.quality_score],
    aggregated_score: response.quality_score,
    score_variance: 0,
    consensus_trigger_accuracy: response.trigger_accuracy,
    is_unanimous: true, // Single sample is trivially unanimous
    all_issues: response.issues,
    representative_response: response,
  };
}

/**
 * Run multi-sampling or single sample based on config.
 *
 * @param client - Anthropic client
 * @param scenario - Test scenario
 * @param transcript - Execution transcript
 * @param programmaticResult - Programmatic detection results
 * @param config - Evaluation configuration
 * @returns Multi-sample result
 */
export async function runJudgment(
  client: Anthropic,
  scenario: TestScenario,
  transcript: Transcript,
  programmaticResult: ProgrammaticDetection[],
  config: EvaluationConfig,
): Promise<MultiSampleResult> {
  if (config.num_samples <= 1) {
    return evaluateSingleSample(
      client,
      scenario,
      transcript,
      programmaticResult,
      config,
    );
  }

  return evaluateWithMultiSampling(
    client,
    scenario,
    transcript,
    programmaticResult,
    config,
  );
}
