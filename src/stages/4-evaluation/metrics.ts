/**
 * Metrics - Aggregate evaluation results into summary statistics.
 *
 * Calculates trigger rates, accuracy, quality scores, and conflict
 * metrics across all evaluated scenarios.
 */

import type {
  ComponentMetrics,
  EvalMetrics,
  EvaluationResult,
  ExecutionResult,
  MultiSampleStats,
  RepetitionStats,
  SemanticStats,
  TestScenario,
  TranscriptErrorEvent,
  TranscriptErrorType,
} from "../../types/index.js";

/**
 * Evaluation result with scenario context.
 */
interface ResultWithContext {
  result: EvaluationResult;
  scenario: TestScenario;
  execution: ExecutionResult;
}

/**
 * Calculate trigger rate (% of scenarios where component triggered).
 *
 * @param results - Evaluation results
 * @returns Trigger rate (0-1)
 */
export function calculateTriggerRate(results: EvaluationResult[]): number {
  if (results.length === 0) {
    return 0;
  }

  const triggered = results.filter((r) => r.triggered).length;
  return triggered / results.length;
}

/**
 * Calculate accuracy (correct triggers + correct non-triggers).
 *
 * @param results - Results with scenario context
 * @returns Accuracy (0-1)
 */
export function calculateAccuracy(results: ResultWithContext[]): number {
  if (results.length === 0) {
    return 0;
  }

  let correct = 0;
  for (const { result, scenario } of results) {
    const expectedTrigger = scenario.expected_trigger;
    const actualTrigger = result.triggered;

    // Correct if trigger matches expectation
    if (expectedTrigger === actualTrigger) {
      correct++;
    }
  }

  return correct / results.length;
}

/**
 * Calculate average quality score (only for triggered scenarios).
 *
 * @param results - Evaluation results
 * @returns Average quality (1-10) or 0 if no quality scores
 */
export function calculateAvgQuality(results: EvaluationResult[]): number {
  const withQuality = results.filter(
    (r) => r.quality_score !== null && r.quality_score > 0,
  );

  if (withQuality.length === 0) {
    return 0;
  }

  const sum = withQuality.reduce((acc, r) => acc + (r.quality_score ?? 0), 0);
  return sum / withQuality.length;
}

/**
 * Count false positives (triggered when shouldn't have).
 *
 * @param results - Results with scenario context
 * @returns Count of false positives
 */
export function countFalsePositives(results: ResultWithContext[]): number {
  return results.filter(
    ({ result, scenario }) => !scenario.expected_trigger && result.triggered,
  ).length;
}

/**
 * Count false negatives (didn't trigger when should have).
 *
 * @param results - Results with scenario context
 * @returns Count of false negatives
 */
export function countFalseNegatives(results: ResultWithContext[]): number {
  return results.filter(
    ({ result, scenario }) => scenario.expected_trigger && !result.triggered,
  ).length;
}

/**
 * Calculate per-component metrics.
 *
 * @param results - Results with scenario context
 * @returns Metrics grouped by component name
 */
export function calculateComponentMetrics(
  results: ResultWithContext[],
): Record<string, ComponentMetrics> {
  const byComponent = new Map<string, ResultWithContext[]>();

  // Group by component
  for (const ctx of results) {
    const key = ctx.scenario.expected_component;
    const existing = byComponent.get(key) ?? [];
    existing.push(ctx);
    byComponent.set(key, existing);
  }

  // Calculate metrics for each
  const metrics: Record<string, ComponentMetrics> = {};

  for (const [component, componentResults] of byComponent) {
    const evalResults = componentResults.map((c) => c.result);

    metrics[component] = {
      trigger_rate: calculateTriggerRate(evalResults),
      accuracy: calculateAccuracy(componentResults),
      avg_quality: calculateAvgQuality(evalResults),
      scenarios_count: componentResults.length,
      false_positives: countFalsePositives(componentResults),
      false_negatives: countFalseNegatives(componentResults),
    };
  }

  return metrics;
}

/**
 * Count errors by type from execution results.
 *
 * @param executions - Execution results
 * @returns Error counts by type
 */
export function countErrorsByType(
  executions: ExecutionResult[],
): Record<TranscriptErrorType, number> {
  const counts: Record<TranscriptErrorType, number> = {
    api_error: 0,
    timeout: 0,
    permission_denied: 0,
    budget_exceeded: 0,
  };

  for (const exec of executions) {
    for (const error of exec.errors) {
      counts[error.error_type]++;
    }
  }

  return counts;
}

/**
 * Calculate multi-sampling statistics.
 *
 * @param sampleData - Per-scenario sample data including consensus info
 * @returns Multi-sample statistics or undefined if no sampling
 */
export function calculateMultiSampleStats(
  sampleData: {
    scenarioId: string;
    variance: number;
    numSamples: number;
    /** Whether all samples agreed on trigger_accuracy */
    hasConsensus: boolean;
  }[],
): MultiSampleStats | undefined {
  if (sampleData.length === 0 || sampleData[0]?.numSamples === 1) {
    return undefined;
  }

  const samplesPerScenario = sampleData[0]?.numSamples ?? 1;
  const variances = sampleData.map((s) => s.variance);
  const avgVariance = variances.reduce((a, b) => a + b, 0) / variances.length;

  // High variance threshold (score variance > 1.0 is concerning)
  const highVarianceThreshold = 1.0;
  const highVarianceScenarios = sampleData
    .filter((s) => s.variance > highVarianceThreshold)
    .map((s) => s.scenarioId);

  // Consensus rate: % of scenarios where all samples agreed on trigger_accuracy
  const consensusCount = sampleData.filter((s) => s.hasConsensus).length;
  const consensusRate = consensusCount / sampleData.length;

  return {
    samples_per_scenario: samplesPerScenario,
    avg_score_variance: avgVariance,
    high_variance_scenarios: highVarianceScenarios,
    consensus_rate: consensusRate,
  };
}

/**
 * Calculate semantic testing statistics.
 *
 * @param results - Results with scenario context
 * @returns Semantic stats or undefined if no semantic scenarios
 */
export function calculateSemanticStats(
  results: ResultWithContext[],
): SemanticStats | undefined {
  const semanticResults = results.filter(
    ({ scenario }) => scenario.scenario_type === "semantic",
  );

  if (semanticResults.length === 0) {
    return undefined;
  }

  const evalResults = semanticResults.map((c) => c.result);
  const triggerRate = calculateTriggerRate(evalResults);

  // Group by variation type
  const byType = new Map<string, { count: number; triggered: number }>();

  for (const { result, scenario } of semanticResults) {
    const type = scenario.semantic_variation_type ?? "unknown";
    const existing = byType.get(type) ?? { count: 0, triggered: 0 };
    existing.count++;
    if (result.triggered) {
      existing.triggered++;
    }
    byType.set(type, existing);
  }

  const variationsByType: Record<
    string,
    { count: number; trigger_rate: number }
  > = {};

  for (const [type, data] of byType) {
    variationsByType[type] = {
      count: data.count,
      trigger_rate: data.count > 0 ? data.triggered / data.count : 0,
    };
  }

  return {
    total_semantic_scenarios: semanticResults.length,
    semantic_trigger_rate: triggerRate,
    variations_by_type: variationsByType,
  };
}

/**
 * Calculate repetition statistics.
 *
 * @param repsPerScenario - Repetitions per scenario
 * @param flakyScenarios - List of scenarios with inconsistent results
 * @param totalScenarios - Total unique scenarios
 * @returns Repetition stats or undefined if num_reps = 1
 */
export function calculateRepetitionStats(
  repsPerScenario: number,
  flakyScenarios: string[],
  totalScenarios: number,
): RepetitionStats | undefined {
  if (repsPerScenario <= 1) {
    return undefined;
  }

  const consistentCount = totalScenarios - flakyScenarios.length;
  const consistencyRate =
    totalScenarios > 0 ? consistentCount / totalScenarios : 1;

  return {
    reps_per_scenario: repsPerScenario,
    consistency_rate: consistencyRate,
    flaky_scenarios: flakyScenarios,
  };
}

/**
 * Calculate all evaluation metrics.
 *
 * @param results - Results with scenario context
 * @param executions - Execution results (for cost and duration)
 * @param options - Additional metric options
 * @returns Complete evaluation metrics
 *
 * @example
 * ```typescript
 * const metrics = calculateEvalMetrics(
 *   resultsWithContext,
 *   executionResults,
 *   { numSamples: 3 }
 * );
 *
 * console.log(`Accuracy: ${(metrics.accuracy * 100).toFixed(1)}%`);
 * ```
 */
export function calculateEvalMetrics(
  results: ResultWithContext[],
  executions: ExecutionResult[],
  options: {
    numSamples?: number;
    numReps?: number;
    sampleData?: {
      scenarioId: string;
      variance: number;
      numSamples: number;
      /** Whether all samples agreed on trigger_accuracy */
      hasConsensus: boolean;
    }[];
    flakyScenarios?: string[];
  } = {},
): EvalMetrics {
  const evalResults = results.map((c) => c.result);

  // Basic metrics
  const triggerRate = calculateTriggerRate(evalResults);
  const accuracy = calculateAccuracy(results);
  const avgQuality = calculateAvgQuality(evalResults);

  // Component breakdown
  const byComponent = calculateComponentMetrics(results);

  // Conflict metrics
  const conflicts = evalResults.filter((r) => r.has_conflict);
  const majorConflicts = evalResults.filter(
    (r) => r.conflict_severity === "major",
  ).length;
  const minorConflicts = evalResults.filter(
    (r) => r.conflict_severity === "minor",
  ).length;

  // Cost and duration from executions
  const totalCost = executions.reduce((sum, e) => sum + e.cost_usd, 0);
  const totalDuration = executions.reduce(
    (sum, e) => sum + e.api_duration_ms,
    0,
  );
  const avgCostPerScenario =
    executions.length > 0 ? totalCost / executions.length : 0;

  // Error tracking
  const allErrors: TranscriptErrorEvent[] = executions.flatMap((e) => e.errors);
  const errorsByType = countErrorsByType(executions);

  // Optional stats
  const multiSampleStats = options.sampleData
    ? calculateMultiSampleStats(options.sampleData)
    : undefined;

  const semanticStats = calculateSemanticStats(results);

  const repetitionStats =
    options.numReps && options.flakyScenarios
      ? calculateRepetitionStats(
          options.numReps,
          options.flakyScenarios,
          new Set(results.map((r) => r.scenario.id)).size,
        )
      : undefined;

  const result: EvalMetrics = {
    total_scenarios: evalResults.length,
    triggered_count: evalResults.filter((r) => r.triggered).length,
    trigger_rate: triggerRate,
    accuracy,
    avg_quality: avgQuality,
    by_component: byComponent,

    conflict_count: conflicts.length,
    major_conflicts: majorConflicts,
    minor_conflicts: minorConflicts,

    total_cost_usd: totalCost,
    avg_cost_per_scenario: avgCostPerScenario,
    total_api_duration_ms: totalDuration,

    error_count: allErrors.length,
    errors_by_type: errorsByType,
  };

  // Only add optional stats if defined
  if (multiSampleStats !== undefined) {
    result.multi_sample_stats = multiSampleStats;
  }
  if (semanticStats !== undefined) {
    result.semantic_stats = semanticStats;
  }
  if (repetitionStats !== undefined) {
    result.repetition_stats = repetitionStats;
  }

  return result;
}

/**
 * Format metrics for display.
 *
 * @param metrics - Evaluation metrics
 * @returns Formatted string
 */
export function formatMetrics(metrics: EvalMetrics): string {
  const lines: string[] = [
    "Evaluation Metrics:",
    "─".repeat(40),
    "",
    `Total Scenarios:    ${String(metrics.total_scenarios)}`,
    `Triggered:          ${String(metrics.triggered_count)} (${(metrics.trigger_rate * 100).toFixed(1)}%)`,
    `Accuracy:           ${(metrics.accuracy * 100).toFixed(1)}%`,
    `Avg Quality:        ${metrics.avg_quality.toFixed(1)}/10`,
    "",
    `Conflicts:          ${String(metrics.conflict_count)} (${String(metrics.major_conflicts)} major, ${String(metrics.minor_conflicts)} minor)`,
    "",
    `Total Cost:         $${metrics.total_cost_usd.toFixed(4)}`,
    `Avg Cost/Scenario:  $${metrics.avg_cost_per_scenario.toFixed(6)}`,
    `Total Duration:     ${String(Math.round(metrics.total_api_duration_ms / 1000))}s`,
    "",
    `Errors:             ${String(metrics.error_count)}`,
  ];

  if (metrics.error_count > 0) {
    lines.push(
      `  - API errors:     ${String(metrics.errors_by_type["api_error"])}`,
    );
    lines.push(
      `  - Timeouts:       ${String(metrics.errors_by_type["timeout"])}`,
    );
    lines.push(
      `  - Permission:     ${String(metrics.errors_by_type["permission_denied"])}`,
    );
    lines.push(
      `  - Budget:         ${String(metrics.errors_by_type["budget_exceeded"])}`,
    );
  }

  if (metrics.semantic_stats) {
    lines.push("");
    lines.push("Semantic Testing:");
    lines.push(
      `  Total:            ${String(metrics.semantic_stats.total_semantic_scenarios)}`,
    );
    lines.push(
      `  Trigger Rate:     ${(metrics.semantic_stats.semantic_trigger_rate * 100).toFixed(1)}%`,
    );
  }

  if (metrics.multi_sample_stats) {
    lines.push("");
    lines.push("Multi-Sampling:");
    lines.push(
      `  Samples/Scenario: ${String(metrics.multi_sample_stats.samples_per_scenario)}`,
    );
    lines.push(
      `  Avg Variance:     ${metrics.multi_sample_stats.avg_score_variance.toFixed(2)}`,
    );
    lines.push(
      `  Consensus Rate:   ${(metrics.multi_sample_stats.consensus_rate * 100).toFixed(1)}%`,
    );
  }

  lines.push("");
  lines.push("─".repeat(40));

  return lines.join("\n");
}

/**
 * Create empty metrics for edge cases.
 *
 * @returns Empty evaluation metrics
 */
export function createEmptyMetrics(): EvalMetrics {
  return {
    total_scenarios: 0,
    triggered_count: 0,
    trigger_rate: 0,
    accuracy: 0,
    avg_quality: 0,
    by_component: {},

    conflict_count: 0,
    major_conflicts: 0,
    minor_conflicts: 0,

    total_cost_usd: 0,
    avg_cost_per_scenario: 0,
    total_api_duration_ms: 0,

    error_count: 0,
    errors_by_type: {
      api_error: 0,
      timeout: 0,
      permission_denied: 0,
      budget_exceeded: 0,
    },
  };
}
