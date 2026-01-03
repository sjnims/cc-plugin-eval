/**
 * Skill Scenario Generator - LLM-based scenario generation for skills.
 *
 * Skills use SEMANTIC matching, not exact phrase matching.
 * "build a hook" should trigger skill with trigger phrase "create a hook".
 *
 * Scenario types generated:
 * 1. Direct trigger (exact phrase)
 * 2. Paraphrased trigger (same intent, different words)
 * 3. Edge case trigger (unusual but valid)
 * 4. Negative control (should NOT trigger)
 * 5. Semantic similarity (synonyms/related phrases)
 */

import { logger } from "../../utils/logging.js";
import { withRetry } from "../../utils/retry.js";

import { resolveModelId } from "./cost-estimator.js";
import { distributeScenarioTypes } from "./diversity-manager.js";

import type {
  SkillComponent,
  TestScenario,
  ScenarioType,
  GenerationConfig,
} from "../../types/index.js";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * Schema for LLM-generated scenario.
 */
interface GeneratedScenario {
  user_prompt: string;
  scenario_type: ScenarioType;
  expected_trigger: boolean;
  reasoning: string;
  original_trigger_phrase?: string;
  semantic_variation_type?:
    | "synonym"
    | "related_concept"
    | "structure"
    | "informal";
}

/**
 * Skill scenario prompt template.
 */
const SKILL_SCENARIO_PROMPT = `Generate test scenarios for this Claude Code skill:

Name: {{skill_name}}
Description: {{description}}
Trigger phrases: {{trigger_phrases}}

Generate exactly {{scenario_count}} test scenarios distributed as follows:
{{type_distribution}}

For each scenario, provide a JSON object with:
- user_prompt: What the user would type
- scenario_type: "direct" | "paraphrased" | "edge_case" | "negative" | "semantic"
- expected_trigger: true if this should trigger the skill, false otherwise
- reasoning: Brief explanation of why this tests the skill
- original_trigger_phrase: (for semantic only) which trigger phrase this is based on
- semantic_variation_type: (for semantic only) "synonym" | "related_concept" | "structure" | "informal"

IMPORTANT:
- Direct scenarios use exact or very close trigger phrases
- Paraphrased scenarios express the same intent with different words
- Edge case scenarios are unusual but valid triggering patterns
- Negative scenarios should NOT trigger this skill (test specificity)
- Semantic scenarios test synonym/related concept matching

Output ONLY a JSON array of scenario objects. No markdown, no explanation.`;

/**
 * Build prompt for skill scenario generation.
 *
 * @param skill - Skill component
 * @param scenarioCount - Total scenarios to generate
 * @param includeSemantic - Whether to include semantic scenarios
 * @returns Prompt string
 */
export function buildSkillPrompt(
  skill: SkillComponent,
  scenarioCount: number,
  includeSemantic: boolean,
): string {
  const distribution = distributeScenarioTypes(
    scenarioCount,
    true,
    includeSemantic,
  );
  const typeDistribution = Array.from(distribution.entries())
    .map(([type, count]) => `- ${String(count)} ${type} scenarios`)
    .join("\n");

  return SKILL_SCENARIO_PROMPT.replace("{{skill_name}}", skill.name)
    .replace("{{description}}", skill.description)
    .replace("{{trigger_phrases}}", skill.trigger_phrases.join(", "))
    .replace("{{scenario_count}}", scenarioCount.toString())
    .replace("{{type_distribution}}", typeDistribution);
}

/**
 * Parse LLM response to extract scenarios.
 *
 * @param response - Raw LLM response text
 * @param skill - Skill component for reference
 * @returns Array of test scenarios
 */
export function parseSkillScenarioResponse(
  response: string,
  skill: SkillComponent,
): TestScenario[] {
  try {
    // Try to extract JSON array from response
    let jsonText = response.trim();

    // Handle markdown code blocks
    const jsonMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(jsonText);
    if (jsonMatch?.[1]) {
      jsonText = jsonMatch[1].trim();
    }

    const generated = JSON.parse(jsonText) as GeneratedScenario[];

    return generated.map((g, i) => {
      const scenario: TestScenario = {
        id: `${skill.name}-${g.scenario_type}-${String(i)}`,
        component_ref: skill.name,
        component_type: "skill",
        scenario_type: g.scenario_type,
        user_prompt: g.user_prompt,
        expected_trigger: g.expected_trigger,
        expected_component: skill.name,
        reasoning: g.reasoning,
      };

      // Add semantic fields if present
      if (g.scenario_type === "semantic" && g.original_trigger_phrase) {
        scenario.original_trigger_phrase = g.original_trigger_phrase;
        if (g.semantic_variation_type) {
          scenario.semantic_variation_type = g.semantic_variation_type;
        }
      }

      return scenario;
    });
  } catch (error) {
    // Return empty array on parse failure - caller should handle
    logger.error(`Failed to parse skill scenarios for ${skill.name}:`, error);
    return [];
  }
}

/**
 * Generate scenarios for a single skill using LLM.
 *
 * @param client - Anthropic client
 * @param skill - Skill component
 * @param config - Generation config
 * @returns Array of test scenarios
 */
export async function generateSkillScenarios(
  client: Anthropic,
  skill: SkillComponent,
  config: GenerationConfig,
): Promise<TestScenario[]> {
  const prompt = buildSkillPrompt(
    skill,
    config.scenarios_per_component,
    config.semantic_variations,
  );

  const response = await withRetry(async () => {
    const result = await client.messages.create({
      model: resolveModelId(config.model),
      max_tokens: config.max_tokens,
      messages: [{ role: "user", content: prompt }],
    });

    // Extract text content
    const textBlock = result.content.find((block) => block.type === "text");
    if (textBlock?.type !== "text") {
      throw new Error("No text content in response");
    }
    return textBlock.text;
  });

  return parseSkillScenarioResponse(response, skill);
}

/**
 * Generate scenarios for all skills.
 *
 * @param client - Anthropic client
 * @param skills - Array of skill components
 * @param config - Generation config
 * @param onProgress - Optional progress callback
 * @returns Array of all test scenarios
 */
export async function generateAllSkillScenarios(
  client: Anthropic,
  skills: SkillComponent[],
  config: GenerationConfig,
  onProgress?: (completed: number, total: number, skill: string) => void,
): Promise<TestScenario[]> {
  const allScenarios: TestScenario[] = [];

  for (const [i, skill] of skills.entries()) {
    onProgress?.(i, skills.length, skill.name);

    const scenarios = await generateSkillScenarios(client, skill, config);
    allScenarios.push(...scenarios);

    onProgress?.(i + 1, skills.length, skill.name);
  }

  return allScenarios;
}

/**
 * Create fallback scenarios when LLM generation fails.
 * Uses trigger phrases directly for deterministic fallback.
 *
 * @param skill - Skill component
 * @returns Array of fallback test scenarios
 */
export function createFallbackSkillScenarios(
  skill: SkillComponent,
): TestScenario[] {
  const scenarios: TestScenario[] = [];

  // Create direct scenarios from trigger phrases
  for (const [i, phrase] of skill.trigger_phrases.entries()) {
    scenarios.push({
      id: `${skill.name}-fallback-direct-${String(i)}`,
      component_ref: skill.name,
      component_type: "skill",
      scenario_type: "direct",
      user_prompt: phrase,
      expected_trigger: true,
      expected_component: skill.name,
      reasoning: "Fallback: direct use of trigger phrase",
    });
  }

  // Add one negative scenario
  scenarios.push({
    id: `${skill.name}-fallback-negative-0`,
    component_ref: skill.name,
    component_type: "skill",
    scenario_type: "negative",
    user_prompt: `What is the weather today?`,
    expected_trigger: false,
    expected_component: skill.name,
    reasoning: "Fallback: unrelated query should not trigger",
  });

  return scenarios;
}
