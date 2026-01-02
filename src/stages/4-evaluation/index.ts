/**
 * Stage 4: Evaluation
 *
 * Detect component activation and assess quality.
 * Combines programmatic detection (PRIMARY) with LLM judgment (SECONDARY).
 *
 * Detection Strategy:
 * 1. Programmatic detection parses tool captures for 100% confidence
 * 2. LLM judge assesses quality and handles edge cases
 * 3. Conflict analysis detects multiple component triggers
 *
 * Output: results/{plugin-name}/evaluation.json
 */

import Anthropic from "@anthropic-ai/sdk";

import { parallel } from "../../utils/concurrency.js";
import { ensureDir, getResultsDir, writeJson } from "../../utils/file-io.js";
import { logger } from "../../utils/logging.js";

import { calculateConflictSeverity } from "./conflict-tracker.js";
import { createErrorJudgeResponse } from "./llm-judge.js";
import {
  calculateEvalMetrics,
  createEmptyMetrics,
  formatMetrics,
} from "./metrics.js";
import { runJudgment } from "./multi-sampler.js";
import {
  detectAllComponents,
  getUniqueDetections,
  wasExpectedComponentTriggered,
} from "./programmatic-detector.js";

import type {
  DetectionSource,
  EvalConfig,
  EvalMetrics,
  EvaluationResult,
  ExecutionResult,
  MultiSampleResult,
  ProgressCallbacks,
  TestScenario,
  TriggeredComponent,
} from "../../types/index.js";

/**
 * Output from Stage 4: Evaluation.
 */
export interface EvaluationOutput {
  plugin_name: string;
  results: EvaluationResult[];
  metrics: EvalMetrics;
  total_cost_usd: number;
  total_duration_ms: number;
}

/**
 * Scenario evaluation context.
 */
interface EvaluationContext {
  scenario: TestScenario;
  execution: ExecutionResult;
}

/**
 * Result of judge strategy determination.
 */
interface JudgeStrategy {
  needsLLMJudge: boolean;
  detectionSource: DetectionSource;
}

/**
 * Result from evaluating a single scenario.
 * Includes both the evaluation result and variance/consensus for metrics.
 */
interface ScenarioEvaluationResult {
  result: EvaluationResult;
  variance: number;
  /** Whether all samples agreed on trigger_accuracy */
  isUnanimous: boolean;
}

/**
 * Determine whether LLM judge should be used.
 *
 * @param scenario - Test scenario
 * @param triggered - Whether component was triggered
 * @param detectionMode - Detection mode from config
 * @returns Judge strategy
 */
function determineJudgeStrategy(
  scenario: TestScenario,
  triggered: boolean,
  detectionMode: "programmatic_first" | "llm_only",
): JudgeStrategy {
  // llm_only mode always uses LLM
  if (detectionMode === "llm_only") {
    return { needsLLMJudge: true, detectionSource: "llm" };
  }

  // programmatic_first mode decision tree
  const triggeredAsExpected = triggered && scenario.expected_trigger;
  const falseNegative = !triggered && scenario.expected_trigger;
  const isNonDirectScenario = scenario.scenario_type !== "direct";

  // Use LLM for quality assessment, false negatives, or non-direct scenarios
  if (triggeredAsExpected || falseNegative || isNonDirectScenario) {
    return { needsLLMJudge: true, detectionSource: "both" };
  }

  // True negatives with direct scenarios - programmatic is sufficient
  return { needsLLMJudge: false, detectionSource: "programmatic" };
}

/**
 * Build the evaluation result object.
 */
function buildEvaluationResult(
  scenario: TestScenario,
  triggered: boolean,
  uniqueDetections: ReturnType<typeof getUniqueDetections>,
  conflictAnalysis: ReturnType<typeof calculateConflictSeverity>,
  judgment: MultiSampleResult | null,
  detectionSource: DetectionSource,
): EvaluationResult {
  const allTriggeredComponents: TriggeredComponent[] = uniqueDetections.map(
    (d) => ({
      component_type: d.component_type,
      component_name: d.component_name,
      confidence: d.confidence,
    }),
  );

  const evidence = uniqueDetections.map((d) => d.evidence);

  // Use LLM quality score if available, otherwise infer from trigger correctness
  let qualityScore: number | null = null;
  if (judgment) {
    qualityScore = judgment.aggregated_score;
  } else if (triggered === scenario.expected_trigger) {
    qualityScore = triggered ? 7 : null;
  }

  const isCorrect = triggered === scenario.expected_trigger;

  return {
    scenario_id: scenario.id,
    triggered,
    confidence: uniqueDetections.length > 0 ? 100 : 0,
    quality_score: qualityScore,
    evidence,
    issues: judgment?.all_issues ?? [],
    summary:
      judgment?.representative_response.summary ??
      (isCorrect
        ? `Correctly ${triggered ? "triggered" : "did not trigger"} component`
        : `Incorrectly ${triggered ? "triggered" : "did not trigger"} component`),
    detection_source: detectionSource,
    all_triggered_components: allTriggeredComponents,
    has_conflict: conflictAnalysis.has_conflict,
    conflict_severity: conflictAnalysis.conflict_severity,
  };
}

/**
 * Evaluate a single scenario.
 *
 * @param client - Anthropic client
 * @param context - Evaluation context
 * @param config - Evaluation configuration
 * @returns Evaluation result with variance for metrics
 */
async function evaluateScenario(
  client: Anthropic,
  context: EvaluationContext,
  config: EvalConfig,
): Promise<ScenarioEvaluationResult> {
  const { scenario, execution } = context;
  const evalConfig = config.evaluation;

  // 1. Programmatic detection (PRIMARY)
  const detections = detectAllComponents(
    execution.detected_tools,
    execution.transcript,
    scenario,
  );

  const uniqueDetections = getUniqueDetections(detections);

  // Check if expected component triggered
  const triggered = wasExpectedComponentTriggered(
    uniqueDetections,
    scenario.expected_component,
    scenario.component_type,
  );

  // 2. Conflict analysis
  const conflictAnalysis = calculateConflictSeverity(
    scenario.expected_component,
    scenario.component_type,
    uniqueDetections,
  );

  // 3. Determine if LLM judge is needed
  const { needsLLMJudge, detectionSource } = determineJudgeStrategy(
    scenario,
    triggered,
    evalConfig.detection_mode,
  );

  // 4. Run LLM judge if needed
  let judgment: MultiSampleResult | null = null;

  if (needsLLMJudge) {
    try {
      judgment = await runJudgment(
        client,
        scenario,
        execution.transcript,
        uniqueDetections,
        evalConfig,
      );
    } catch (err) {
      const errorResponse = createErrorJudgeResponse(
        err instanceof Error ? err.message : String(err),
      );
      judgment = {
        individual_scores: [0],
        aggregated_score: 0,
        score_variance: 0,
        consensus_trigger_accuracy: "incorrect",
        is_unanimous: true, // Error case has single fallback value
        all_issues: errorResponse.issues,
        representative_response: errorResponse,
      };
    }
  }

  // 5. Build and return evaluation result with variance and consensus
  const result = buildEvaluationResult(
    scenario,
    triggered,
    uniqueDetections,
    conflictAnalysis,
    judgment,
    detectionSource,
  );

  // Extract variance and unanimity from judgment
  // (defaults: 0 variance for no judgment, true unanimity for single/no sample)
  const variance = judgment?.score_variance ?? 0;
  const isUnanimous = judgment?.is_unanimous ?? true;

  return { result, variance, isUnanimous };
}

/**
 * Run Stage 4: Evaluation.
 *
 * Evaluates all execution results to determine component triggering
 * accuracy and quality.
 *
 * @param pluginName - Plugin name
 * @param scenarios - Test scenarios
 * @param executions - Execution results from Stage 3
 * @param config - Evaluation configuration
 * @param progress - Optional progress callbacks
 * @returns Evaluation output with results and metrics
 *
 * @example
 * ```typescript
 * const evaluationOutput = await runEvaluation(
 *   'my-plugin',
 *   scenarios,
 *   executionResults,
 *   config,
 *   {
 *     onScenarioComplete: (result, i, total) => {
 *       console.log(`Evaluated ${i}/${total}: ${result.scenario_id}`);
 *     }
 *   }
 * );
 *
 * console.log(`Accuracy: ${evaluationOutput.metrics.accuracy * 100}%`);
 * ```
 */
export async function runEvaluation(
  pluginName: string,
  scenarios: TestScenario[],
  executions: ExecutionResult[],
  config: EvalConfig,
  progress: ProgressCallbacks = {},
): Promise<EvaluationOutput> {
  logger.stageHeader("Stage 4: Evaluation", executions.length);

  const startTime = Date.now();

  // Handle empty executions
  if (executions.length === 0) {
    logger.warn("No executions to evaluate");
    return {
      plugin_name: pluginName,
      results: [],
      metrics: createEmptyMetrics(),
      total_cost_usd: 0,
      total_duration_ms: Date.now() - startTime,
    };
  }

  // Create Anthropic client for LLM judge
  const client = new Anthropic();

  // Build scenario map for quick lookup
  const scenarioMap = new Map<string, TestScenario>();
  for (const scenario of scenarios) {
    scenarioMap.set(scenario.id, scenario);
  }

  // Build evaluation contexts
  const contexts: EvaluationContext[] = [];
  for (const execution of executions) {
    const scenario = scenarioMap.get(execution.scenario_id);
    if (scenario) {
      contexts.push({ scenario, execution });
    } else {
      logger.warn(`No scenario found for execution: ${execution.scenario_id}`);
    }
  }

  progress.onStageStart?.("evaluation", contexts.length);

  // Track sample data for metrics (including trigger_accuracy consensus)
  const sampleData: {
    scenarioId: string;
    variance: number;
    numSamples: number;
    /** Whether all samples agreed on trigger_accuracy */
    hasConsensus: boolean;
  }[] = [];

  // Evaluate all scenarios in parallel
  const parallelResult = await parallel<
    EvaluationContext,
    ScenarioEvaluationResult
  >({
    items: contexts,
    concurrency: config.max_concurrent,
    fn: async (context: EvaluationContext, index: number) => {
      const { result, variance, isUnanimous } = await evaluateScenario(
        client,
        context,
        config,
      );

      // Track sample data if using multi-sampling
      if (config.evaluation.num_samples > 1) {
        sampleData.push({
          scenarioId: result.scenario_id,
          variance,
          numSamples: config.evaluation.num_samples,
          hasConsensus: isUnanimous,
        });
      }

      // Note: onScenarioComplete expects ExecutionResult, not EvaluationResult
      // Use logging instead for evaluation progress
      logger.progress(
        index + 1,
        contexts.length,
        `${result.scenario_id}: ${result.triggered ? "triggered" : "not triggered"}`,
      );
      return { result, variance, isUnanimous };
    },
    onError: (error: Error, context: EvaluationContext) => {
      progress.onError?.(error, context.scenario);
      logger.error(
        `Evaluation failed for ${context.scenario.id}: ${error.message}`,
      );
    },
    continueOnError: true,
  });

  // Filter valid results (parallel may return undefined for failed items)
  const results = (
    parallelResult.results as (ScenarioEvaluationResult | undefined)[]
  )
    .filter((r): r is ScenarioEvaluationResult => r !== undefined)
    .map((r) => r.result);

  // Build results with context for metrics
  const resultsWithContext = results.map((result) => {
    const context = contexts.find((c) => c.scenario.id === result.scenario_id);
    return {
      result,
      scenario: context?.scenario ?? ({} as TestScenario),
      execution: context?.execution ?? ({} as ExecutionResult),
    };
  });

  // Calculate metrics
  const metricsOptions: {
    numSamples?: number;
    numReps?: number;
    sampleData?: {
      scenarioId: string;
      variance: number;
      numSamples: number;
      hasConsensus: boolean;
    }[];
    flakyScenarios?: string[];
  } = {
    numSamples: config.evaluation.num_samples,
    numReps: config.execution.num_reps,
    flakyScenarios: [], // Would need to track from repetition analysis
  };

  // Only add sampleData if we have data
  if (sampleData.length > 0) {
    metricsOptions.sampleData = sampleData;
  }

  const metrics = calculateEvalMetrics(
    resultsWithContext,
    executions,
    metricsOptions,
  );

  const totalDuration = Date.now() - startTime;

  // Log metrics summary
  logger.info(formatMetrics(metrics));

  // Save evaluation results
  saveEvaluationResults(pluginName, results, metrics, config);

  logger.success(
    `Evaluation complete: ${String(results.length)} scenarios evaluated`,
  );
  progress.onStageComplete?.("evaluation", totalDuration, results.length);

  return {
    plugin_name: pluginName,
    results,
    metrics,
    total_cost_usd: metrics.total_cost_usd,
    total_duration_ms: totalDuration,
  };
}

/**
 * Save evaluation results to disk.
 *
 * @param pluginName - Plugin name
 * @param results - Evaluation results
 * @param metrics - Evaluation metrics
 * @param config - Configuration
 */
function saveEvaluationResults(
  pluginName: string,
  results: EvaluationResult[],
  metrics: EvalMetrics,
  config: EvalConfig,
): void {
  const resultsDir = getResultsDir(pluginName);
  ensureDir(resultsDir);

  const evaluationPath = `${resultsDir}/evaluation.json`;

  const output = {
    plugin_name: pluginName,
    timestamp: new Date().toISOString(),
    config: {
      detection_mode: config.evaluation.detection_mode,
      num_samples: config.evaluation.num_samples,
      aggregate_method: config.evaluation.aggregate_method,
      model: config.evaluation.model,
    },
    metrics,
    results,
  };

  writeJson(evaluationPath, output);
  logger.info(`Saved evaluation results to ${evaluationPath}`);
}

// Re-export components for direct use
export {
  detectAllComponents,
  detectFromCaptures,
  detectFromTranscript,
  detectDirectCommandInvocation,
  wasExpectedComponentTriggered,
  getUniqueDetections,
} from "./programmatic-detector.js";

export {
  calculateConflictSeverity,
  sharesDomain,
  countConflicts,
  getConflictSummary,
} from "./conflict-tracker.js";

export {
  evaluateWithLLMJudge,
  evaluateWithFallback,
  buildJudgePrompt,
  formatTranscriptWithIds,
  createErrorJudgeResponse,
} from "./llm-judge.js";

export {
  evaluateWithMultiSampling,
  evaluateSingleSample,
  runJudgment,
  aggregateScores,
  calculateVariance,
  getMajorityVote,
  isUnanimousVote,
} from "./multi-sampler.js";

export {
  calculateEvalMetrics,
  calculateTriggerRate,
  calculateAccuracy,
  calculateAvgQuality,
  calculateComponentMetrics,
  formatMetrics,
  createEmptyMetrics,
} from "./metrics.js";
