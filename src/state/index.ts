/**
 * State management module exports.
 */

export {
  // Types
  type PipelineStage,
  type PipelineState,
  type CreateRunOptions,
  type ResumeOptions,

  // Run ID management
  generateRunId,
  getStateFilePath,
  getRunResultsDir,

  // State lifecycle
  createPipelineState,
  saveState,
  loadState,
  findLatestRun,

  // Stage updates
  updateStateAfterAnalysis,
  updateStateAfterGeneration,
  updateStateAfterExecution,
  updateStateAfterEvaluation,
  updateStateComplete,
  updateStateWithPartialExecutions,
  updateStateWithError,

  // Resume helpers
  canResumeFrom,
  getNextStage,
  getFailedScenarios,
  getIncompleteScenarios,

  // Display
  formatState,
  listRuns,
} from "./state-manager.js";
