/**
 * LLM Judge - Quality assessment using structured output.
 *
 * Secondary evaluation method that assesses response quality,
 * validates edge cases, and confirms negative scenarios.
 *
 * Uses Anthropic's beta structured output API for guaranteed JSON parsing.
 */

import { DEFAULT_TUNING } from "../../config/defaults.js";
import { withRetry } from "../../utils/retry.js";
import { resolveModelId } from "../2-generation/cost-estimator.js";

import type {
  EvaluationConfig,
  JudgeResponse,
  ProgrammaticDetection,
  TestScenario,
  Transcript,
  TranscriptEvent,
} from "../../types/index.js";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * Judge response schema for structured output.
 *
 * Using structured output ensures guaranteed JSON parsing.
 * The schema enforces the exact structure we expect.
 */
const JUDGE_RESPONSE_SCHEMA = {
  type: "object" as const,
  properties: {
    quality_score: {
      type: "number" as const,
      description: "Overall quality of the response (1-10)",
    },
    response_relevance: {
      type: "number" as const,
      description:
        "How relevant the response was to the component purpose (1-10)",
    },
    trigger_accuracy: {
      type: "string" as const,
      enum: ["correct", "incorrect", "partial"] as const,
      description: "Whether the correct component triggered",
    },
    issues: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "List of issues or concerns found",
    },
    highlights: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          description: { type: "string" as const },
          message_id: { type: "string" as const },
          quoted_text: { type: "string" as const },
          position_start: { type: "number" as const },
          position_end: { type: "number" as const },
        },
        required: ["description", "message_id", "quoted_text"] as const,
      },
      description: "Notable quotes with citation grounding to message IDs",
    },
    summary: {
      type: "string" as const,
      description: "Brief summary of the evaluation",
    },
  },
  required: [
    "quality_score",
    "response_relevance",
    "trigger_accuracy",
    "issues",
    "summary",
  ] as const,
};

/**
 * Judge prompt template.
 */
const JUDGE_PROMPT_TEMPLATE = `You are evaluating a Claude Code plugin test execution.

PLUGIN: {{plugin_name}}
COMPONENT BEING TESTED: {{expected_component}} ({{component_type}})
SCENARIO TYPE: {{scenario_type}}
EXPECTED TO TRIGGER: {{expected_trigger}}
PROGRAMMATIC DETECTION: {{programmatic_result}}

TRANSCRIPT (with message IDs for citation):
{{formatted_transcript}}

COMPONENT DETAILS:
{{component_ref}}

Evaluate:
1. quality_score (1-10): How well did the component respond to the user's request?
2. response_relevance (1-10): Did the response align with the component's stated purpose?
3. trigger_accuracy: Was the triggering behavior correct given the scenario type?
   - "correct": Component triggered when expected, or didn't trigger when not expected
   - "incorrect": Component triggered when it shouldn't, or didn't trigger when it should
   - "partial": Component triggered but response was incomplete or had issues
4. issues: List any problems, errors, or unexpected behaviors
5. highlights: {{citation_instruction}}
6. summary: Brief overall assessment

For negative scenarios (expected_trigger: false):
- "correct" means the component did NOT trigger (which is desired)
- "incorrect" means the component DID trigger (false positive)

For positive scenarios (expected_trigger: true):
- "correct" means the component triggered and responded appropriately
- "incorrect" means the component did NOT trigger (false negative)
- "partial" means it triggered but had issues`;

/**
 * Format transcript events with message IDs for citation grounding.
 *
 * Each message includes its ID so the judge can cite specific messages
 * in highlights.
 *
 * @param transcript - Execution transcript
 * @param maxContentLength - Maximum content length per message
 * @returns Formatted transcript string
 */
export function formatTranscriptWithIds(
  transcript: Transcript,
  maxContentLength = DEFAULT_TUNING.limits.transcript_content_length,
): string {
  return transcript.events
    .map((event) => formatEvent(event, maxContentLength))
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Format a single transcript event.
 *
 * @param event - Transcript event
 * @param maxContentLength - Maximum content length
 * @returns Formatted event string
 */
function formatEvent(event: TranscriptEvent, maxContentLength: number): string {
  switch (event.type) {
    case "user": {
      const content = event.edit.message.content;
      const truncated =
        content.length > maxContentLength
          ? `${content.slice(0, maxContentLength)}...`
          : content;
      return `[${event.id}] USER: ${truncated}`;
    }

    case "assistant": {
      const content = event.edit.message.content;
      const truncated =
        content.length > maxContentLength
          ? `${content.slice(0, maxContentLength)}...`
          : content;

      const toolCalls = event.edit.message.tool_calls ?? [];
      const toolInfo =
        toolCalls.length > 0
          ? `\n  [Tools: ${toolCalls.map((tc) => tc.name).join(", ")}]`
          : "";

      return `[${event.id}] ASSISTANT: ${truncated}${toolInfo}`;
    }

    case "tool_result": {
      const resultStr =
        typeof event.result === "string"
          ? event.result
          : JSON.stringify(event.result);
      const truncated =
        resultStr.length > maxContentLength
          ? `${resultStr.slice(0, maxContentLength)}...`
          : resultStr;
      return `[${event.id}] TOOL_RESULT: ${truncated}`;
    }
  }
}

/**
 * Build the judge prompt from scenario and transcript.
 *
 * @param scenario - Test scenario
 * @param transcript - Execution transcript
 * @param programmaticResult - Programmatic detection results
 * @param config - Evaluation configuration
 * @returns Complete judge prompt
 */
export function buildJudgePrompt(
  scenario: TestScenario,
  transcript: Transcript,
  programmaticResult: ProgrammaticDetection[],
  config: EvaluationConfig,
): string {
  const formattedTranscript = formatTranscriptWithIds(transcript);

  const programmaticDisplay =
    programmaticResult.length > 0
      ? programmaticResult
          .map((d) => `${d.component_type}:${d.component_name}`)
          .join(", ")
      : "No components detected";

  const citationInstruction = config.include_citations
    ? "For each highlight, include message_id and quoted_text for citation grounding"
    : "Notable quotes demonstrating good or bad behavior";

  return JUDGE_PROMPT_TEMPLATE.replace(
    "{{plugin_name}}",
    transcript.metadata.plugin_name,
  )
    .replace("{{expected_component}}", scenario.expected_component)
    .replace("{{component_type}}", scenario.component_type)
    .replace("{{scenario_type}}", scenario.scenario_type)
    .replace("{{expected_trigger}}", String(scenario.expected_trigger))
    .replace("{{programmatic_result}}", programmaticDisplay)
    .replace("{{formatted_transcript}}", formattedTranscript)
    .replace("{{component_ref}}", scenario.component_ref)
    .replace("{{citation_instruction}}", citationInstruction);
}

/**
 * Parse judge response from structured output.
 *
 * @param text - JSON text from structured output
 * @returns Parsed judge response
 */
function parseJudgeResponse(text: string): JudgeResponse {
  const parsed = JSON.parse(text) as {
    quality_score: number;
    response_relevance: number;
    trigger_accuracy: "correct" | "incorrect" | "partial";
    issues: string[];
    highlights?: {
      description: string;
      message_id: string;
      quoted_text: string;
      position_start?: number;
      position_end?: number;
    }[];
    summary: string;
  };

  // Transform highlights to expected format
  const highlights = parsed.highlights?.map((h) => ({
    description: h.description,
    citation: {
      message_id: h.message_id,
      quoted_text: h.quoted_text,
      position: [h.position_start ?? 0, h.position_end ?? 0] as [
        number,
        number,
      ],
    },
  }));

  const result: JudgeResponse = {
    quality_score: parsed.quality_score,
    response_relevance: parsed.response_relevance,
    trigger_accuracy: parsed.trigger_accuracy,
    issues: parsed.issues,
    summary: parsed.summary,
  };

  // Only add highlights if present
  if (highlights !== undefined) {
    result.highlights = highlights;
  }

  return result;
}

/**
 * Evaluate a scenario using the LLM judge.
 *
 * Uses Anthropic's beta structured output API for guaranteed JSON parsing.
 *
 * @param client - Anthropic client
 * @param scenario - Test scenario
 * @param transcript - Execution transcript
 * @param programmaticResult - Programmatic detection results
 * @param config - Evaluation configuration
 * @returns Judge response
 *
 * @example
 * ```typescript
 * const response = await evaluateWithLLMJudge(
 *   client,
 *   scenario,
 *   transcript,
 *   detections,
 *   config
 * );
 *
 * console.log(`Quality: ${response.quality_score}/10`);
 * ```
 */
export async function evaluateWithLLMJudge(
  client: Anthropic,
  scenario: TestScenario,
  transcript: Transcript,
  programmaticResult: ProgrammaticDetection[],
  config: EvaluationConfig,
): Promise<JudgeResponse> {
  const prompt = buildJudgePrompt(
    scenario,
    transcript,
    programmaticResult,
    config,
  );

  const response = await withRetry(async () => {
    // Use Anthropic's beta structured output API
    // The SDK automatically adds the required beta header
    const result = await client.beta.messages.create({
      model: resolveModelId(config.model),
      max_tokens: config.max_tokens,
      messages: [{ role: "user", content: prompt }],
      betas: ["structured-outputs-2025-11-13"],
      // Anthropic uses output_format with schema directly (not nested json_schema)
      output_format: {
        type: "json_schema",
        schema: JUDGE_RESPONSE_SCHEMA,
      },
    });

    // Extract text content from structured output response
    const textBlock = result.content.find((block) => block.type === "text");
    if (textBlock?.type !== "text") {
      throw new Error("No text block in structured output response");
    }

    return textBlock.text;
  });

  try {
    return parseJudgeResponse(response);
  } catch (err) {
    throw new Error(`Failed to parse structured output: ${String(err)}`);
  }
}

/**
 * Evaluate with fallback to regular JSON parsing.
 *
 * If structured output isn't available, falls back to requesting
 * JSON output and parsing it manually.
 *
 * @param client - Anthropic client
 * @param scenario - Test scenario
 * @param transcript - Execution transcript
 * @param programmaticResult - Programmatic detection results
 * @param config - Evaluation configuration
 * @returns Judge response
 */
export async function evaluateWithFallback(
  client: Anthropic,
  scenario: TestScenario,
  transcript: Transcript,
  programmaticResult: ProgrammaticDetection[],
  config: EvaluationConfig,
): Promise<JudgeResponse> {
  try {
    // Try structured output first
    return await evaluateWithLLMJudge(
      client,
      scenario,
      transcript,
      programmaticResult,
      config,
    );
  } catch {
    // Fallback to regular JSON parsing
    return evaluateWithJsonFallback(
      client,
      scenario,
      transcript,
      programmaticResult,
      config,
    );
  }
}

/**
 * Evaluate using regular JSON output (fallback method).
 *
 * @param client - Anthropic client
 * @param scenario - Test scenario
 * @param transcript - Execution transcript
 * @param programmaticResult - Programmatic detection results
 * @param config - Evaluation configuration
 * @returns Judge response
 */
async function evaluateWithJsonFallback(
  client: Anthropic,
  scenario: TestScenario,
  transcript: Transcript,
  programmaticResult: ProgrammaticDetection[],
  config: EvaluationConfig,
): Promise<JudgeResponse> {
  const basePrompt = buildJudgePrompt(
    scenario,
    transcript,
    programmaticResult,
    config,
  );

  const prompt = `${basePrompt}

Respond with ONLY a JSON object matching this schema:
{
  "quality_score": number (1-10),
  "response_relevance": number (1-10),
  "trigger_accuracy": "correct" | "incorrect" | "partial",
  "issues": string[],
  "highlights": [{ "description": string, "message_id": string, "quoted_text": string }],
  "summary": string
}

No markdown, no explanation - just the JSON.`;

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

  // Extract JSON from response (handle markdown code blocks)
  let jsonText = response.trim();
  const jsonMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(jsonText);
  if (jsonMatch?.[1]) {
    jsonText = jsonMatch[1].trim();
  }

  try {
    return parseJudgeResponse(jsonText);
  } catch (err) {
    // Return a default error response if parsing fails
    return {
      quality_score: 1,
      response_relevance: 1,
      trigger_accuracy: "incorrect",
      issues: [`Failed to parse judge response: ${String(err)}`, response],
      summary: "Evaluation failed due to parsing error",
    };
  }
}

/**
 * Create default judge response for error cases.
 *
 * @param error - Error message
 * @returns Default judge response
 */
export function createErrorJudgeResponse(error: string): JudgeResponse {
  return {
    quality_score: 0,
    response_relevance: 0,
    trigger_accuracy: "incorrect",
    issues: [error],
    summary: `Evaluation failed: ${error}`,
  };
}
