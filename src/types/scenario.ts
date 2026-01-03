/**
 * Test scenario type definitions.
 */

/**
 * Types of test scenarios.
 *
 * - direct: Uses exact trigger phrases from component description
 * - paraphrased: Same intent, different wording
 * - edge_case: Unusual but valid triggering patterns
 * - negative: Should NOT trigger this component
 * - proactive: For agents that trigger based on CONTEXT, not explicit request
 * - semantic: Tests that SIMILAR phrases trigger (skills use semantic matching)
 */
export type ScenarioType =
  | "direct"
  | "paraphrased"
  | "edge_case"
  | "negative"
  | "proactive"
  | "semantic";

/**
 * Component type being tested.
 */
export type ComponentType = "skill" | "agent" | "command" | "hook";

/**
 * Setup message for proactive scenarios.
 */
export interface SetupMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * A test scenario for evaluating plugin triggering.
 */
export interface TestScenario {
  id: string;
  component_ref: string;
  component_type: ComponentType;
  scenario_type: ScenarioType;
  user_prompt: string;
  expected_trigger: boolean;
  expected_component: string;

  /** For proactive scenarios: full message history to simulate prior context */
  setup_messages?: SetupMessage[];

  /** Legacy: simple context description (still supported) */
  setup_context?: string;

  /** For semantic scenarios: original trigger phrase being tested */
  original_trigger_phrase?: string;
  semantic_variation_type?:
    | "synonym"
    | "related_concept"
    | "structure"
    | "informal";

  /** For command scenarios: expected file references */
  expected_file_reference?: string;
  expected_file_references?: string[];

  /** Reasoning/explanation */
  reasoning?: string;
}

/**
 * Diversity configuration for scenario generation.
 */
export interface DiversityConfig {
  /** 0.1 - 1.0 */
  diversity: number;
  total_scenarios: number;
}

/**
 * Distribution of base vs variation scenarios.
 */
export interface ScenarioDistribution {
  base_count: number;
  variations_per_base: number;
}

/**
 * Base scenario before variations are applied.
 */
export interface BaseScenario {
  id: string;
  component_ref: string;
  component_type: ComponentType;
  /** The triggering mechanism to preserve */
  core_intent: string;
  /** Original prompt */
  base_prompt: string;
}

/**
 * Scenario variation extending base scenario.
 */
export interface ScenarioVariation extends TestScenario {
  /** Reference to parent */
  base_scenario_id: string;
  variation_index: number;
  variation_type: "entity" | "domain" | "tone" | "specificity";
  /** What was changed */
  changes_made: string;
}
