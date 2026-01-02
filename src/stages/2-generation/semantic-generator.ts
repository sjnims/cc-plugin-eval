/**
 * Semantic Generator - Generate semantic variations for skills.
 *
 * Skills use SEMANTIC matching, not exact phrase matching.
 * "build a hook" should trigger skill with trigger phrase "create a hook".
 *
 * This generator creates semantic variations to test this behavior:
 * 1. Synonyms: "create" → "build", "make", "generate", "add"
 * 2. Related concepts: "hook" → "event handler", "callback", "interceptor"
 * 3. Different sentence structures: "create a hook" → "I need a hook created"
 * 4. Informal variations: "create a hook" → "hook me up with a hook", "need a hook"
 */

import { DEFAULT_TUNING } from "../../config/defaults.js";
import { withRetry } from "../../utils/retry.js";

import { resolveModelId } from "./cost-estimator.js";

import type {
  SkillComponent,
  SemanticVariation,
  TestScenario,
  AnalysisOutput,
} from "../../types/index.js";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * Semantic variation prompt template.
 */
const SEMANTIC_VARIATION_PROMPT = `Given this trigger phrase: "{{trigger_phrase}}"

Generate 3 semantically equivalent phrases that should trigger the same behavior.
Focus on:
1. Synonyms: "create" → "build", "make", "generate", "add"
2. Related concepts: "hook" → "event handler", "callback", "interceptor"
3. Different sentence structures: "create a hook" → "I need a hook created"
4. Informal variations: "create a hook" → "hook me up with a hook", "need a hook"

Return ONLY a JSON array (no markdown):
[
  {
    "original": "{{trigger_phrase}}",
    "variation": "semantically equivalent phrase",
    "variation_type": "synonym" | "related_concept" | "structure" | "informal",
    "explanation": "why this should trigger the same behavior"
  }
]`;

/**
 * Component keywords that indicate a specific component type.
 */
const COMPONENT_TYPES = [
  "hook",
  "skill",
  "agent",
  "command",
  "mcp",
  "plugin",
  "marketplace",
];

/**
 * Generate semantic variations for a trigger phrase.
 *
 * @param client - Anthropic client
 * @param triggerPhrase - Original trigger phrase
 * @param model - Model to use
 * @returns Array of semantic variations
 */
export async function generateSemanticVariations(
  client: Anthropic,
  triggerPhrase: string,
  model: string,
): Promise<SemanticVariation[]> {
  const prompt = SEMANTIC_VARIATION_PROMPT.replace(
    /{{trigger_phrase}}/g,
    triggerPhrase,
  );

  try {
    const response = await withRetry(async () => {
      const result = await client.messages.create({
        model: resolveModelId(model),
        max_tokens: DEFAULT_TUNING.token_estimates.semantic_gen_max_tokens,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = result.content.find((block) => block.type === "text");
      if (textBlock?.type !== "text") {
        throw new Error("No text content in response");
      }
      return textBlock.text;
    });

    return parseSemanticVariations(response, triggerPhrase);
  } catch (error) {
    console.error(
      `Failed to generate semantic variations for "${triggerPhrase}":`,
      error,
    );
    return [];
  }
}

/**
 * Parse LLM response to extract semantic variations.
 *
 * @param response - Raw LLM response text
 * @param originalTrigger - Original trigger phrase
 * @returns Array of semantic variations
 */
export function parseSemanticVariations(
  response: string,
  originalTrigger: string,
): SemanticVariation[] {
  try {
    let jsonText = response.trim();

    // Handle markdown code blocks
    const jsonMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(jsonText);
    if (jsonMatch?.[1]) {
      jsonText = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonText) as {
      original: string;
      variation: string;
      variation_type: "synonym" | "related_concept" | "structure" | "informal";
      explanation: string;
    }[];

    return parsed.map((v) => ({
      original_trigger: originalTrigger,
      variation: v.variation,
      variation_type: v.variation_type,
      explanation: v.explanation,
    }));
  } catch {
    return [];
  }
}

/**
 * Check if a variation would trigger a DIFFERENT component.
 *
 * @param original - Original trigger phrase
 * @param variation - Variation phrase
 * @param allComponentKeywords - Keywords from all components
 * @returns Whether variation would trigger different component
 */
export function wouldTriggerDifferentComponent(
  original: string,
  variation: string,
  allComponentKeywords: string[],
): boolean {
  const originalWords = original.toLowerCase().split(/\s+/);
  const variationWords = variation.toLowerCase().split(/\s+/);

  // Find component type in original
  const originalComponent = originalWords.find((w) =>
    COMPONENT_TYPES.includes(w),
  );

  // If original doesn't have a component type, allow variation
  if (!originalComponent) {
    return false;
  }

  // Check if variation has a DIFFERENT component type
  const variationComponent = variationWords.find((w) =>
    COMPONENT_TYPES.includes(w),
  );

  if (variationComponent && variationComponent !== originalComponent) {
    // Variation changes the component type - filter it out
    return true;
  }

  // Also check against all known component keywords (plugin-specific)
  for (const keyword of allComponentKeywords) {
    const keywordLower = keyword.toLowerCase();
    // If variation mentions a different component by name, filter it
    if (
      variation.toLowerCase().includes(keywordLower) &&
      !original.toLowerCase().includes(keywordLower)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Extract all component keywords from analysis.
 *
 * @param analysis - Analysis output
 * @returns Array of component keywords
 */
export function extractAllComponentKeywords(
  analysis: AnalysisOutput,
): string[] {
  const keywords: string[] = [];

  // Add skill names and key terms from descriptions
  for (const skill of analysis.components.skills) {
    keywords.push(skill.name);
    // Extract key terms from name (e.g., "hook-development" → "hook", "development")
    keywords.push(...skill.name.split("-").filter((w) => w.length > 3));
  }

  // Add agent names
  for (const agent of analysis.components.agents) {
    keywords.push(agent.name);
    keywords.push(...agent.name.split("-").filter((w) => w.length > 3));
  }

  // Add command names
  for (const command of analysis.components.commands) {
    keywords.push(command.name);
    keywords.push(...command.name.split("-").filter((w) => w.length > 3));
  }

  return [...new Set(keywords)]; // Deduplicate
}

/**
 * Generate semantic test scenarios from variations.
 *
 * @param skill - Skill component
 * @param variations - Semantic variations
 * @returns Array of test scenarios
 */
export function generateSemanticScenarios(
  skill: SkillComponent,
  variations: SemanticVariation[],
): TestScenario[] {
  return variations.map((v, i) => ({
    id: `${skill.name}-semantic-${String(i)}`,
    component_ref: skill.name,
    component_type: "skill" as const,
    scenario_type: "semantic" as const,
    user_prompt: v.variation,
    expected_trigger: true,
    expected_component: skill.name,
    original_trigger_phrase: v.original_trigger,
    semantic_variation_type: v.variation_type,
    reasoning: v.explanation,
  }));
}

/**
 * Generate all semantic variations for a skill.
 *
 * @param client - Anthropic client
 * @param skill - Skill component
 * @param model - Model to use
 * @param allComponentKeywords - Keywords for filtering
 * @returns Array of test scenarios
 */
export async function generateSkillSemanticScenarios(
  client: Anthropic,
  skill: SkillComponent,
  model: string,
  allComponentKeywords: string[],
): Promise<TestScenario[]> {
  const allVariations: SemanticVariation[] = [];

  for (const phrase of skill.trigger_phrases) {
    const variations = await generateSemanticVariations(client, phrase, model);

    // Filter out variations that might trigger different components
    const filtered = variations.filter(
      (v) =>
        !wouldTriggerDifferentComponent(
          phrase,
          v.variation,
          allComponentKeywords,
        ),
    );

    allVariations.push(...filtered);
  }

  return generateSemanticScenarios(skill, allVariations);
}

/**
 * Generate semantic scenarios for all skills.
 *
 * @param client - Anthropic client
 * @param skills - Array of skill components
 * @param model - Model to use
 * @param analysis - Full analysis output for keyword extraction
 * @param onProgress - Optional progress callback
 * @returns Array of all semantic test scenarios
 */
export async function generateAllSemanticScenarios(
  client: Anthropic,
  skills: SkillComponent[],
  model: string,
  analysis: AnalysisOutput,
  onProgress?: (completed: number, total: number, skill: string) => void,
): Promise<TestScenario[]> {
  const allComponentKeywords = extractAllComponentKeywords(analysis);
  const allScenarios: TestScenario[] = [];

  for (const [i, skill] of skills.entries()) {
    onProgress?.(i, skills.length, skill.name);

    const scenarios = await generateSkillSemanticScenarios(
      client,
      skill,
      model,
      allComponentKeywords,
    );
    allScenarios.push(...scenarios);

    onProgress?.(i + 1, skills.length, skill.name);
  }

  return allScenarios;
}
