/**
 * Progress reporting type definitions.
 */

import type { TestScenario } from "./scenario.js";
import type { ExecutionResult } from "./transcript.js";

/**
 * Progress callbacks for long-running evaluations.
 */
export interface ProgressCallbacks {
  onStageStart?: (stage: string, totalItems: number) => void;
  onScenarioStart?: (
    scenario: TestScenario,
    index: number,
    total: number,
  ) => void;
  onScenarioComplete?: (
    result: ExecutionResult,
    index: number,
    total: number,
  ) => void;
  onStageComplete?: (
    stage: string,
    durationMs: number,
    itemCount: number,
  ) => void;
  onError?: (error: Error, scenario?: TestScenario) => void;
}
