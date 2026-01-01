/**
 * Skill analyzer.
 * Parses SKILL.md files and extracts trigger phrases with semantic intents.
 */

import path from "node:path";

import { parseFrontmatter, readText } from "../../utils/index.js";

import type { SemanticIntent, SkillComponent } from "../../types/index.js";

/**
 * Analyze a skill directory.
 *
 * @param skillDir - Path to skill directory containing SKILL.md
 * @returns Parsed skill component
 */
export function analyzeSkill(skillDir: string): SkillComponent {
  const skillPath = path.join(skillDir, "SKILL.md");
  const content = readText(skillPath);
  const { frontmatter, body } = parseFrontmatter(content);

  // Get skill name from frontmatter or directory name
  const name =
    typeof frontmatter["name"] === "string"
      ? frontmatter["name"]
      : path.basename(skillDir);

  // Get description from frontmatter or body
  const description =
    typeof frontmatter["description"] === "string"
      ? frontmatter["description"]
      : body.slice(0, 500);

  // Extract trigger phrases from description
  const triggerPhrases = extractTriggerPhrases(description);

  // Parse semantic intents from trigger phrases
  const semanticIntents = extractSemanticIntents(triggerPhrases);

  // Get allowed tools (note: YAML frontmatter uses hyphenated 'allowed-tools')
  let allowedTools: string[] | undefined;
  const rawAllowedTools = frontmatter["allowed-tools"];
  if (typeof rawAllowedTools === "string") {
    allowedTools = rawAllowedTools.split(",").map((t) => t.trim());
  } else if (Array.isArray(rawAllowedTools)) {
    allowedTools = rawAllowedTools.filter(
      (t): t is string => typeof t === "string",
    );
  }

  return {
    name,
    path: skillPath,
    description,
    trigger_phrases: triggerPhrases,
    semantic_intents: semanticIntents,
    allowed_tools: allowedTools,
  };
}

/**
 * Extract trigger phrases from skill description.
 * Looks for phrases in double or single quotes following trigger keywords.
 *
 * @param description - Skill description text
 * @returns Array of trigger phrases
 */
export function extractTriggerPhrases(description: string): string[] {
  const phrases: string[] = [];

  // Match quoted strings after trigger keywords
  const triggerKeywords =
    /(?:asks?\s+to|needs?\s+to|wants?\s+to|mentions?|says?)\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = triggerKeywords.exec(description)) !== null) {
    const phrase = match[1];
    if (phrase) {
      phrases.push(phrase.trim());
    }
  }

  // Also match standalone quoted strings that look like commands
  const standaloneQuotes = /["']([^"']{3,50})["']/g;
  while ((match = standaloneQuotes.exec(description)) !== null) {
    const phrase = match[1];
    if (phrase) {
      const trimmed = phrase.trim();
      // Skip if already captured or if it's not a user action phrase
      if (!phrases.includes(trimmed) && /^[a-z]/i.test(trimmed)) {
        phrases.push(trimmed);
      }
    }
  }

  // Deduplicate while preserving order
  return [...new Set(phrases)];
}

/**
 * Extract semantic intents from trigger phrases.
 * Parses phrases like "create a hook" into structured intents.
 *
 * @param triggerPhrases - Array of trigger phrases
 * @returns Array of semantic intents
 */
export function extractSemanticIntents(
  triggerPhrases: string[],
): SemanticIntent[] {
  return triggerPhrases.map((phrase) => {
    const words = phrase.toLowerCase().split(/\s+/);

    // Common action verbs
    const actions = [
      "create",
      "add",
      "build",
      "make",
      "set",
      "configure",
      "implement",
      "define",
      "write",
      "generate",
      "develop",
      "update",
      "modify",
      "change",
      "fix",
      "debug",
    ];
    const action = words.find((w) => actions.includes(w)) ?? words[0] ?? "";

    // Object is typically after action (skip articles)
    const actionIndex = words.indexOf(action);
    const skipWords = [
      "a",
      "an",
      "the",
      "for",
      "to",
      "in",
      "with",
      "my",
      "some",
    ];
    const objectWords = words
      .slice(actionIndex + 1)
      .filter((w) => !skipWords.includes(w));
    const object = objectWords.slice(0, 2).join(" ");

    // Context is anything after "for", "to", "in", etc.
    const contextIndicators = ["for", "to", "in", "with"];
    const contextStart = words.findIndex((w) => contextIndicators.includes(w));
    const context =
      contextStart > -1 ? words.slice(contextStart).join(" ") : undefined;

    return {
      action,
      object,
      context,
      raw_phrase: phrase,
    };
  });
}

/**
 * Analyze multiple skills.
 *
 * @param skillDirs - Array of skill directory paths
 * @returns Array of parsed skill components
 */
export function analyzeSkills(skillDirs: string[]): SkillComponent[] {
  return skillDirs.map(analyzeSkill);
}
