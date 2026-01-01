/**
 * Stage 2: Scenario Generation
 *
 * Generates diverse test scenarios for each plugin component.
 *
 * For Skills/Agents (LLM-based):
 * - Direct trigger (exact phrase)
 * - Paraphrased trigger (same intent, different words)
 * - Edge case trigger (unusual but valid)
 * - Negative control (should NOT trigger)
 * - Semantic similarity (synonyms/related phrases)
 *
 * For Commands (Deterministic - NO LLM):
 * - Basic invocation (/plugin:command)
 * - With arguments (/plugin:command arg1 arg2)
 * - With file references (/plugin:command @file.md)
 * - Negative (natural language should NOT trigger)
 */

import { logger } from "../../utils/logging.js";

// Internal generators
import {
  generateAllAgentScenarios,
  createFallbackAgentScenarios,
} from "./agent-scenario-generator.js";
import { generateAllCommandScenarios } from "./command-scenario-generator.js";
import {
  estimatePipelineCost,
  createAnthropicClient,
  formatPipelineCostEstimate,
} from "./cost-estimator.js";
import { calculateDiversityMetrics } from "./diversity-manager.js";
import {
  generateAllSkillScenarios,
  createFallbackSkillScenarios,
} from "./skill-scenario-generator.js";

import type {
  AnalysisOutput,
  EvalConfig,
  TestScenario,
  PipelineCostEstimate,
  ScenarioType,
} from "../../types/index.js";

/**
 * Output from Stage 2: Scenario Generation.
 */
export interface GenerationOutput {
  plugin_name: string;
  scenarios: TestScenario[];
  scenario_count_by_type: Record<ScenarioType, number>;
  scenario_count_by_component: Record<string, number>;
  cost_estimate: PipelineCostEstimate;
  diversity_metrics: {
    base_scenarios: number;
    total_with_variations: number;
    diversity_ratio: number;
  };
}

/**
 * Generation progress callback.
 */
export type GenerationProgressCallback = (
  stage: "skills" | "agents" | "commands" | "semantic",
  completed: number,
  total: number,
  current?: string,
) => void;

/**
 * Run Stage 2: Scenario Generation.
 *
 * @param analysis - Output from Stage 1
 * @param config - Evaluation configuration
 * @param onProgress - Optional progress callback
 * @returns Generation output with scenarios
 */
export async function runGeneration(
  analysis: AnalysisOutput,
  config: EvalConfig,
  onProgress?: GenerationProgressCallback,
): Promise<GenerationOutput> {
  logger.stageHeader("Stage 2: Scenario Generation");

  // Estimate costs first
  const costEstimate = estimatePipelineCost(analysis, config);
  logger.info("Cost estimate:");
  console.log(formatPipelineCostEstimate(costEstimate));

  if (!costEstimate.within_budget && !config.dry_run) {
    logger.warn(
      `Estimated cost ($${costEstimate.total_estimated_cost_usd.toFixed(2)}) exceeds budget ($${config.execution.max_budget_usd.toFixed(2)})`,
    );
  }

  // If dry_run, just return estimate without generating
  if (config.dry_run) {
    logger.info("Dry-run mode: skipping scenario generation");
    return {
      plugin_name: analysis.plugin_name,
      scenarios: [],
      scenario_count_by_type: {
        direct: 0,
        paraphrased: 0,
        edge_case: 0,
        negative: 0,
        proactive: 0,
        semantic: 0,
      },
      scenario_count_by_component: {},
      cost_estimate: costEstimate,
      diversity_metrics: {
        base_scenarios: 0,
        total_with_variations: 0,
        diversity_ratio: 0,
      },
    };
  }

  const allScenarios: TestScenario[] = [];
  const client = createAnthropicClient();

  // Generate skill scenarios (LLM-based)
  if (config.scope.skills && analysis.components.skills.length > 0) {
    logger.info(
      `Generating scenarios for ${String(analysis.components.skills.length)} skills...`,
    );

    try {
      const skillScenarios = await generateAllSkillScenarios(
        client,
        analysis.components.skills,
        config.generation,
        (completed, total, skill) => {
          onProgress?.("skills", completed, total, skill);
        },
      );

      if (skillScenarios.length > 0) {
        allScenarios.push(...skillScenarios);
        logger.success(
          `Generated ${String(skillScenarios.length)} skill scenarios`,
        );
      } else {
        // Fall back to deterministic scenarios
        logger.warn("LLM generation failed, using fallback scenarios");
        for (const skill of analysis.components.skills) {
          allScenarios.push(...createFallbackSkillScenarios(skill));
        }
      }
    } catch (error) {
      logger.error(`Skill generation failed: ${String(error)}`);
      // Fall back to deterministic scenarios
      for (const skill of analysis.components.skills) {
        allScenarios.push(...createFallbackSkillScenarios(skill));
      }
    }
  }

  // Generate agent scenarios (LLM-based)
  if (config.scope.agents && analysis.components.agents.length > 0) {
    logger.info(
      `Generating scenarios for ${String(analysis.components.agents.length)} agents...`,
    );

    try {
      const agentScenarios = await generateAllAgentScenarios(
        client,
        analysis.components.agents,
        config.generation,
        (completed, total, agent) => {
          onProgress?.("agents", completed, total, agent);
        },
      );

      if (agentScenarios.length > 0) {
        allScenarios.push(...agentScenarios);
        logger.success(
          `Generated ${String(agentScenarios.length)} agent scenarios`,
        );
      } else {
        // Fall back to deterministic scenarios
        logger.warn("LLM generation failed, using fallback scenarios");
        for (const agent of analysis.components.agents) {
          allScenarios.push(...createFallbackAgentScenarios(agent));
        }
      }
    } catch (error) {
      logger.error(`Agent generation failed: ${String(error)}`);
      // Fall back to deterministic scenarios
      for (const agent of analysis.components.agents) {
        allScenarios.push(...createFallbackAgentScenarios(agent));
      }
    }
  }

  // Generate command scenarios (deterministic - no LLM)
  if (config.scope.commands && analysis.components.commands.length > 0) {
    logger.info(
      `Generating scenarios for ${String(analysis.components.commands.length)} commands...`,
    );

    const commandScenarios = generateAllCommandScenarios(
      analysis.components.commands,
    );
    allScenarios.push(...commandScenarios);

    onProgress?.("commands", 1, 1);
    logger.success(
      `Generated ${String(commandScenarios.length)} command scenarios`,
    );
  }

  // Calculate diversity metrics
  const metrics = calculateDiversityMetrics(allScenarios);

  logger.success(`\nTotal scenarios generated: ${String(allScenarios.length)}`);
  logger.info(`  Direct: ${String(metrics.by_type.direct)}`);
  logger.info(`  Paraphrased: ${String(metrics.by_type.paraphrased)}`);
  logger.info(`  Edge case: ${String(metrics.by_type.edge_case)}`);
  logger.info(`  Negative: ${String(metrics.by_type.negative)}`);
  logger.info(`  Proactive: ${String(metrics.by_type.proactive)}`);
  logger.info(`  Semantic: ${String(metrics.by_type.semantic)}`);

  return {
    plugin_name: analysis.plugin_name,
    scenarios: allScenarios,
    scenario_count_by_type: metrics.by_type,
    scenario_count_by_component: metrics.by_component,
    cost_estimate: costEstimate,
    diversity_metrics: {
      base_scenarios: metrics.base_scenarios,
      total_with_variations: metrics.variations,
      diversity_ratio: metrics.diversity_ratio,
    },
  };
}

// Re-export for convenience
export { generateAllCommandScenarios } from "./command-scenario-generator.js";

export {
  generateAllSkillScenarios,
  createFallbackSkillScenarios,
} from "./skill-scenario-generator.js";

export {
  generateAllAgentScenarios,
  createFallbackAgentScenarios,
} from "./agent-scenario-generator.js";

export {
  calculateScenarioDistribution,
  distributeScenarioTypes,
  calculateDiversityMetrics,
} from "./diversity-manager.js";

export {
  calculateOptimalBatchSize,
  createBatchConfig,
  TOKENS_PER_SCENARIO,
  THINKING_BUDGET,
} from "./batch-calculator.js";

export {
  estimatePipelineCost,
  estimateGenerationCost,
  estimateExecutionCost,
  estimateEvaluationCost,
  resolveModelId,
  createAnthropicClient,
  formatPipelineCostEstimate,
} from "./cost-estimator.js";

export {
  generateSemanticVariations,
  generateSemanticScenarios,
  generateSkillSemanticScenarios,
  extractAllComponentKeywords,
  wouldTriggerDifferentComponent,
} from "./semantic-generator.js";
