/**
 * Agent Scenario Generator - LLM-based scenario generation for agents.
 *
 * Agents can be triggered by:
 * 1. Direct request matching their description
 * 2. Task context that requires their specialized capability
 * 3. Proactive triggering based on prior conversation context
 *
 * Scenario types generated:
 * 1. Direct trigger (task matching agent's purpose)
 * 2. Paraphrased trigger (same need, different wording)
 * 3. Edge case trigger (unusual but valid use case)
 * 4. Negative control (should NOT trigger this agent)
 * 5. Proactive scenarios (context-based triggering)
 */

import { withRetry } from "../../utils/retry.js";

import { resolveModelId } from "./cost-estimator.js";
import { distributeScenarioTypes } from "./diversity-manager.js";

import type {
  AgentComponent,
  TestScenario,
  ScenarioType,
  SetupMessage,
  GenerationConfig,
} from "../../types/index.js";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * Schema for LLM-generated agent scenario.
 */
interface GeneratedAgentScenario {
  user_prompt: string;
  scenario_type: ScenarioType;
  expected_trigger: boolean;
  reasoning: string;
  setup_messages?: SetupMessage[];
}

/**
 * Agent scenario prompt template.
 */
const AGENT_SCENARIO_PROMPT = `Generate test scenarios for this Claude Code agent:

Name: {{agent_name}}
Description: {{description}}
Model: {{model}}
{{#if tools}}Available Tools: {{tools}}{{/if}}
{{#if examples}}
Example triggers:
{{examples}}
{{/if}}

Generate exactly {{scenario_count}} test scenarios distributed as follows:
{{type_distribution}}

For each scenario, provide a JSON object with:
- user_prompt: What the user would type to trigger this agent
- scenario_type: "direct" | "paraphrased" | "edge_case" | "negative" | "proactive"
- expected_trigger: true if this should trigger the agent, false otherwise
- reasoning: Brief explanation of why this tests the agent
- setup_messages: (for proactive only) array of prior messages to establish context
  Each setup message has: { "role": "user" | "assistant", "content": "..." }

IMPORTANT:
- Direct scenarios clearly match the agent's described purpose
- Paraphrased scenarios express the same need differently
- Edge case scenarios are unusual but valid use cases
- Negative scenarios should NOT trigger this agent (they might trigger a different one)
- Proactive scenarios include setup_messages to establish prior context

Output ONLY a JSON array of scenario objects. No markdown, no explanation.`;

/**
 * Build prompt for agent scenario generation.
 *
 * @param agent - Agent component
 * @param scenarioCount - Total scenarios to generate
 * @returns Prompt string
 */
export function buildAgentPrompt(
  agent: AgentComponent,
  scenarioCount: number,
): string {
  // Distribute with proactive scenarios (agents can be proactively triggered)
  const distribution = distributeScenarioTypes(scenarioCount, true, false);

  // Replace one edge_case with proactive if available
  const edgeCaseCount = distribution.get("edge_case") ?? 0;
  if (edgeCaseCount > 0) {
    distribution.set("edge_case", edgeCaseCount - 1);
    distribution.set("proactive", 1);
  }

  const typeDistribution = Array.from(distribution.entries())
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `- ${String(count)} ${type} scenarios`)
    .join("\n");

  // Format examples
  const examples = agent.example_triggers
    .map((ex) => `  - Context: ${ex.context}\n    User: "${ex.user_message}"`)
    .join("\n");

  let prompt = AGENT_SCENARIO_PROMPT.replace("{{agent_name}}", agent.name)
    .replace("{{description}}", agent.description)
    .replace("{{model}}", agent.model)
    .replace("{{scenario_count}}", scenarioCount.toString())
    .replace("{{type_distribution}}", typeDistribution);

  // Handle optional fields
  if (agent.tools && agent.tools.length > 0) {
    prompt = prompt.replace("{{#if tools}}", "").replace("{{/if}}", "");
    prompt = prompt.replace("{{tools}}", agent.tools.join(", "));
  } else {
    prompt = prompt.replace(/{{#if tools}}[\s\S]*?{{\/if}}/g, "");
  }

  if (agent.example_triggers.length > 0) {
    prompt = prompt.replace("{{#if examples}}", "").replace("{{/if}}", "");
    prompt = prompt.replace("{{examples}}", examples);
  } else {
    prompt = prompt.replace(/{{#if examples}}[\s\S]*?{{\/if}}/g, "");
  }

  return prompt;
}

/**
 * Parse LLM response to extract agent scenarios.
 *
 * @param response - Raw LLM response text
 * @param agent - Agent component for reference
 * @returns Array of test scenarios
 */
export function parseAgentScenarioResponse(
  response: string,
  agent: AgentComponent,
): TestScenario[] {
  try {
    // Try to extract JSON array from response
    let jsonText = response.trim();

    // Handle markdown code blocks
    const jsonMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(jsonText);
    if (jsonMatch?.[1]) {
      jsonText = jsonMatch[1].trim();
    }

    const generated = JSON.parse(jsonText) as GeneratedAgentScenario[];

    return generated.map((g, i) => {
      const scenario: TestScenario = {
        id: `${agent.name}-${g.scenario_type}-${String(i)}`,
        component_ref: agent.name,
        component_type: "agent",
        scenario_type: g.scenario_type,
        user_prompt: g.user_prompt,
        expected_trigger: g.expected_trigger,
        expected_component: agent.name,
        reasoning: g.reasoning,
      };

      // Add setup messages for proactive scenarios
      if (g.scenario_type === "proactive" && g.setup_messages) {
        scenario.setup_messages = g.setup_messages;
      }

      return scenario;
    });
  } catch (error) {
    console.error(`Failed to parse agent scenarios for ${agent.name}:`, error);
    return [];
  }
}

/**
 * Generate scenarios for a single agent using LLM.
 *
 * @param client - Anthropic client
 * @param agent - Agent component
 * @param config - Generation config
 * @returns Array of test scenarios
 */
export async function generateAgentScenarios(
  client: Anthropic,
  agent: AgentComponent,
  config: GenerationConfig,
): Promise<TestScenario[]> {
  const prompt = buildAgentPrompt(agent, config.scenarios_per_component);

  const response = await withRetry(async () => {
    const result = await client.messages.create({
      model: resolveModelId(config.model),
      max_tokens: config.max_tokens,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = result.content.find((block) => block.type === "text");
    if (textBlock?.type !== "text") {
      throw new Error("No text content in response");
    }
    return textBlock.text;
  });

  return parseAgentScenarioResponse(response, agent);
}

/**
 * Generate scenarios for all agents.
 *
 * @param client - Anthropic client
 * @param agents - Array of agent components
 * @param config - Generation config
 * @param onProgress - Optional progress callback
 * @returns Array of all test scenarios
 */
export async function generateAllAgentScenarios(
  client: Anthropic,
  agents: AgentComponent[],
  config: GenerationConfig,
  onProgress?: (completed: number, total: number, agent: string) => void,
): Promise<TestScenario[]> {
  const allScenarios: TestScenario[] = [];

  for (const [i, agent] of agents.entries()) {
    onProgress?.(i, agents.length, agent.name);

    const scenarios = await generateAgentScenarios(client, agent, config);
    allScenarios.push(...scenarios);

    onProgress?.(i + 1, agents.length, agent.name);
  }

  return allScenarios;
}

/**
 * Create fallback scenarios when LLM generation fails.
 *
 * @param agent - Agent component
 * @returns Array of fallback test scenarios
 */
export function createFallbackAgentScenarios(
  agent: AgentComponent,
): TestScenario[] {
  const scenarios: TestScenario[] = [];

  // Create direct scenarios from examples
  for (const [i, example] of agent.example_triggers.entries()) {
    scenarios.push({
      id: `${agent.name}-fallback-direct-${String(i)}`,
      component_ref: agent.name,
      component_type: "agent",
      scenario_type: "direct",
      user_prompt: example.user_message,
      expected_trigger: true,
      expected_component: agent.name,
      reasoning: `Fallback: direct use of example - ${example.context}`,
    });
  }

  // If no examples, create a generic scenario from description
  if (scenarios.length === 0) {
    scenarios.push({
      id: `${agent.name}-fallback-direct-0`,
      component_ref: agent.name,
      component_type: "agent",
      scenario_type: "direct",
      user_prompt: `Help me with ${agent.description.toLowerCase().slice(0, 50)}`,
      expected_trigger: true,
      expected_component: agent.name,
      reasoning: "Fallback: generic request based on description",
    });
  }

  // Add one negative scenario
  scenarios.push({
    id: `${agent.name}-fallback-negative-0`,
    component_ref: agent.name,
    component_type: "agent",
    scenario_type: "negative",
    user_prompt: "What is the capital of France?",
    expected_trigger: false,
    expected_component: agent.name,
    reasoning: "Fallback: unrelated query should not trigger",
  });

  return scenarios;
}
