/**
 * State Management
 *
 * Provides checkpoint and resume capability for the evaluation pipeline.
 * State is saved after each stage to enable recovery from interruptions.
 *
 * Features:
 * - Save state after each pipeline stage
 * - Resume from any saved stage
 * - Track partial execution results
 * - Fast mode: only re-run failed scenarios
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { nanoid } from "nanoid";

import { ensureDir, readJson, writeJson } from "../utils/file-io.js";
import { logger } from "../utils/logging.js";

import type {
  AnalysisOutput,
  EvalConfig,
  EvaluationResult,
  ExecutionResult,
  TestScenario,
} from "../types/index.js";

/**
 * Pipeline stage identifiers.
 */
export type PipelineStage =
  | "pending"
  | "analysis"
  | "generation"
  | "execution"
  | "evaluation"
  | "complete";

/**
 * Pipeline state stored between runs.
 *
 * Contains all intermediate outputs needed to resume from any stage.
 */
export interface PipelineState {
  /** Unique identifier for this run */
  run_id: string;

  /** Plugin name being evaluated */
  plugin_name: string;

  /** Current stage (last completed) */
  stage: PipelineStage;

  /** Timestamp of last state update */
  timestamp: string;

  /** Configuration used for this run */
  config: EvalConfig;

  /** Stage 1 output (if completed) */
  analysis?: AnalysisOutput;

  /** Stage 2 output (if completed) */
  scenarios?: TestScenario[];

  /** Stage 3 output (if completed) */
  executions?: ExecutionResult[];

  /** Stage 4 output (if completed) */
  evaluations?: EvaluationResult[];

  /** Partial execution results for resume */
  partial_executions?: ExecutionResult[];

  /** Partial evaluation results for resume */
  partial_evaluations?: EvaluationResult[];

  /** Scenario IDs that failed (for fast mode) */
  failed_scenario_ids?: string[];

  /** Error message if pipeline failed */
  error?: string;
}

/**
 * Options for creating a new pipeline run.
 */
export interface CreateRunOptions {
  pluginName: string;
  config: EvalConfig;
  runId?: string;
}

/**
 * Options for resuming a pipeline run.
 */
export interface ResumeOptions {
  runId: string;
  fromStage?: PipelineStage;
}

/**
 * Generate a unique run ID.
 *
 * Format: YYYYMMDD-HHMMSS-XXXX (timestamp + random suffix)
 *
 * @returns Unique run identifier
 */
export function generateRunId(): string {
  const now = new Date();

  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");

  const timePart = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");

  const randomPart = nanoid(4);

  return `${datePart}-${timePart}-${randomPart}`;
}

/**
 * Get the state file path for a run.
 *
 * @param pluginName - Plugin name
 * @param runId - Run identifier
 * @returns Path to state file
 */
export function getStateFilePath(pluginName: string, runId: string): string {
  return `results/${pluginName}/${runId}/state.json`;
}

/**
 * Get the results directory for a run.
 *
 * @param pluginName - Plugin name
 * @param runId - Run identifier (optional)
 * @returns Path to results directory
 */
export function getRunResultsDir(pluginName: string, runId?: string): string {
  if (runId) {
    return `results/${pluginName}/${runId}`;
  }
  return `results/${pluginName}`;
}

/**
 * Create a new pipeline state.
 *
 * @param options - Creation options
 * @returns Initial pipeline state
 */
export function createPipelineState(options: CreateRunOptions): PipelineState {
  const runId = options.runId ?? generateRunId();

  return {
    run_id: runId,
    plugin_name: options.pluginName,
    stage: "pending",
    timestamp: new Date().toISOString(),
    config: options.config,
  };
}

/**
 * Save pipeline state to disk.
 *
 * @param state - Pipeline state to save
 * @returns Path to saved state file
 */
export function saveState(state: PipelineState): string {
  const dir = getRunResultsDir(state.plugin_name, state.run_id);
  ensureDir(dir);

  const filePath = getStateFilePath(state.plugin_name, state.run_id);

  // Update timestamp before saving
  const updatedState: PipelineState = {
    ...state,
    timestamp: new Date().toISOString(),
  };

  writeJson(filePath, updatedState);
  logger.debug(`State saved to ${filePath}`);

  return filePath;
}

/**
 * Load pipeline state from disk.
 *
 * @param pluginName - Plugin name
 * @param runId - Run identifier
 * @returns Pipeline state or null if not found
 */
export function loadState(
  pluginName: string,
  runId: string,
): PipelineState | null {
  const filePath = getStateFilePath(pluginName, runId);

  try {
    const state = readJson(filePath) as PipelineState;
    logger.debug(`State loaded from ${filePath}`);
    return state;
  } catch {
    logger.warn(`No state found at ${filePath}`);
    return null;
  }
}

/**
 * Find the most recent run for a plugin.
 *
 * @param pluginName - Plugin name
 * @returns Most recent run ID or null
 */
export function findLatestRun(pluginName: string): string | null {
  const pluginDir = `results/${pluginName}`;

  if (!existsSync(pluginDir)) {
    return null;
  }

  const entries = readdirSync(pluginDir, { withFileTypes: true });
  const runDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => /^\d{8}-\d{6}-/.test(name))
    .sort()
    .reverse();

  if (runDirs.length === 0) {
    return null;
  }

  // Return the most recent run that has a state file
  for (const runId of runDirs) {
    const statePath = join(pluginDir, runId, "state.json");
    if (existsSync(statePath)) {
      return runId;
    }
  }

  return null;
}

/**
 * Update state after completing analysis stage.
 *
 * @param state - Current state
 * @param analysis - Analysis output
 * @returns Updated state
 */
export function updateStateAfterAnalysis(
  state: PipelineState,
  analysis: AnalysisOutput,
): PipelineState {
  const updated: PipelineState = {
    ...state,
    stage: "analysis",
    analysis,
    timestamp: new Date().toISOString(),
  };

  saveState(updated);
  return updated;
}

/**
 * Update state after completing generation stage.
 *
 * @param state - Current state
 * @param scenarios - Generated scenarios
 * @returns Updated state
 */
export function updateStateAfterGeneration(
  state: PipelineState,
  scenarios: TestScenario[],
): PipelineState {
  const updated: PipelineState = {
    ...state,
    stage: "generation",
    scenarios,
    timestamp: new Date().toISOString(),
  };

  saveState(updated);
  return updated;
}

/**
 * Update state after completing execution stage.
 *
 * @param state - Current state
 * @param executions - Execution results
 * @returns Updated state
 */
export function updateStateAfterExecution(
  state: PipelineState,
  executions: ExecutionResult[],
): PipelineState {
  // Identify failed scenarios for fast mode
  const failedIds = executions
    .filter((e) => e.errors.length > 0)
    .map((e) => e.scenario_id);

  // Create base update without optional properties set to undefined
  const base = {
    ...state,
    stage: "execution" as const,
    executions,
    timestamp: new Date().toISOString(),
  };

  // Only add failed_scenario_ids if there are failures
  const updated: PipelineState =
    failedIds.length > 0 ? { ...base, failed_scenario_ids: failedIds } : base;

  // Remove partial_executions by creating clean object
  delete (updated as Partial<PipelineState>).partial_executions;

  saveState(updated);
  return updated;
}

/**
 * Update state after completing evaluation stage.
 *
 * @param state - Current state
 * @param evaluations - Evaluation results
 * @returns Updated state
 */
export function updateStateAfterEvaluation(
  state: PipelineState,
  evaluations: EvaluationResult[],
): PipelineState {
  const updated: PipelineState = {
    ...state,
    stage: "evaluation",
    evaluations,
    timestamp: new Date().toISOString(),
  };

  // Remove partial_evaluations by creating clean object
  delete (updated as Partial<PipelineState>).partial_evaluations;

  saveState(updated);
  return updated;
}

/**
 * Mark pipeline as complete.
 *
 * @param state - Current state
 * @returns Updated state
 */
export function updateStateComplete(state: PipelineState): PipelineState {
  const updated: PipelineState = {
    ...state,
    stage: "complete",
    timestamp: new Date().toISOString(),
  };

  saveState(updated);
  return updated;
}

/**
 * Update state with partial execution results.
 *
 * Used for checkpointing during long execution runs.
 *
 * @param state - Current state
 * @param partials - Partial execution results
 * @returns Updated state
 */
export function updateStateWithPartialExecutions(
  state: PipelineState,
  partials: ExecutionResult[],
): PipelineState {
  const updated: PipelineState = {
    ...state,
    partial_executions: partials,
    timestamp: new Date().toISOString(),
  };

  saveState(updated);
  return updated;
}

/**
 * Update state with error.
 *
 * @param state - Current state
 * @param error - Error message
 * @returns Updated state
 */
export function updateStateWithError(
  state: PipelineState,
  error: string,
): PipelineState {
  const updated: PipelineState = {
    ...state,
    error,
    timestamp: new Date().toISOString(),
  };

  saveState(updated);
  return updated;
}

/**
 * Check if a stage can be resumed from.
 *
 * @param state - Pipeline state
 * @param targetStage - Stage to resume from
 * @returns True if resumable
 */
export function canResumeFrom(
  state: PipelineState,
  targetStage: PipelineStage,
): boolean {
  const stageOrder: PipelineStage[] = [
    "pending",
    "analysis",
    "generation",
    "execution",
    "evaluation",
    "complete",
  ];

  const currentIndex = stageOrder.indexOf(state.stage);
  const targetIndex = stageOrder.indexOf(targetStage);

  // Can resume if current stage is at or after target stage
  // (i.e., we have the data needed to start from target stage)
  if (targetIndex <= currentIndex) {
    // Verify required data exists
    switch (targetStage) {
      case "pending":
        return true;
      case "analysis":
        return true; // Can always re-run analysis
      case "generation":
        return state.analysis !== undefined;
      case "execution":
        return state.analysis !== undefined && state.scenarios !== undefined;
      case "evaluation":
        return (
          state.analysis !== undefined &&
          state.scenarios !== undefined &&
          state.executions !== undefined
        );
      case "complete":
        return state.stage === "complete";
    }
  }

  return false;
}

/**
 * Get the next stage to run.
 *
 * @param currentStage - Current pipeline stage
 * @returns Next stage or null if complete
 */
export function getNextStage(
  currentStage: PipelineStage,
): PipelineStage | null {
  const stageOrder: PipelineStage[] = [
    "pending",
    "analysis",
    "generation",
    "execution",
    "evaluation",
    "complete",
  ];

  const currentIndex = stageOrder.indexOf(currentStage);
  if (currentIndex === -1 || currentIndex >= stageOrder.length - 1) {
    return null;
  }

  return stageOrder[currentIndex + 1] ?? null;
}

/**
 * Get scenarios to run for fast mode.
 *
 * Returns only scenarios that failed in the previous run.
 *
 * @param state - Pipeline state from failed run
 * @param allScenarios - All scenarios
 * @returns Failed scenarios to re-run
 */
export function getFailedScenarios(
  state: PipelineState,
  allScenarios: TestScenario[],
): TestScenario[] {
  if (!state.failed_scenario_ids || state.failed_scenario_ids.length === 0) {
    return [];
  }

  const failedIds = new Set(state.failed_scenario_ids);
  return allScenarios.filter((s) => failedIds.has(s.id));
}

/**
 * Get incomplete scenarios for resume.
 *
 * Returns scenarios that weren't executed in partial run.
 *
 * @param state - Pipeline state
 * @param allScenarios - All scenarios
 * @returns Incomplete scenarios
 */
export function getIncompleteScenarios(
  state: PipelineState,
  allScenarios: TestScenario[],
): TestScenario[] {
  const completedIds = new Set<string>();

  // Check both full and partial executions
  if (state.executions) {
    for (const e of state.executions) {
      completedIds.add(e.scenario_id);
    }
  }
  if (state.partial_executions) {
    for (const e of state.partial_executions) {
      completedIds.add(e.scenario_id);
    }
  }

  return allScenarios.filter((s) => !completedIds.has(s.id));
}

/**
 * Format state for display.
 *
 * @param state - Pipeline state
 * @returns Formatted state summary
 */
export function formatState(state: PipelineState): string {
  const lines: string[] = [
    `Run ID: ${state.run_id}`,
    `Plugin: ${state.plugin_name}`,
    `Stage: ${state.stage}`,
    `Last Updated: ${state.timestamp}`,
  ];

  if (state.analysis) {
    const componentCount =
      state.analysis.components.skills.length +
      state.analysis.components.agents.length +
      state.analysis.components.commands.length;
    lines.push(`Components: ${String(componentCount)}`);
  }

  if (state.scenarios) {
    lines.push(`Scenarios: ${String(state.scenarios.length)}`);
  }

  if (state.executions) {
    const passed = state.executions.filter((e) => e.errors.length === 0).length;
    lines.push(
      `Executions: ${String(passed)}/${String(state.executions.length)} passed`,
    );
  }

  if (state.evaluations) {
    const triggered = state.evaluations.filter((e) => e.triggered).length;
    lines.push(
      `Evaluations: ${String(triggered)}/${String(state.evaluations.length)} triggered`,
    );
  }

  if (state.failed_scenario_ids && state.failed_scenario_ids.length > 0) {
    lines.push(`Failed Scenarios: ${String(state.failed_scenario_ids.length)}`);
  }

  if (state.error) {
    lines.push(`Error: ${state.error}`);
  }

  return lines.join("\n");
}

/**
 * Run summary entry.
 */
interface RunSummary {
  runId: string;
  stage: PipelineStage;
  timestamp: string;
}

/**
 * List all runs for a plugin.
 *
 * @param pluginName - Plugin name
 * @returns Array of run summaries
 */
export function listRuns(pluginName: string): RunSummary[] {
  const pluginDir = `results/${pluginName}`;

  if (!existsSync(pluginDir)) {
    return [];
  }

  const entries = readdirSync(pluginDir, { withFileTypes: true });
  const runs: RunSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (!/^\d{8}-\d{6}-/.test(entry.name)) {
      continue;
    }

    const statePath = join(pluginDir, entry.name, "state.json");
    if (!existsSync(statePath)) {
      continue;
    }

    try {
      const content = readFileSync(statePath, "utf-8");
      const state = JSON.parse(content) as {
        stage?: PipelineStage;
        timestamp?: string;
      };
      runs.push({
        runId: entry.name,
        stage: state.stage ?? "pending",
        timestamp: state.timestamp ?? "",
      });
    } catch {
      // Skip invalid state files
    }
  }

  return runs.sort((a, b) => b.runId.localeCompare(a.runId));
}
