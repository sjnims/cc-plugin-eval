import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  analyzeSkill,
  analyzeSkills,
  extractSemanticIntents,
  extractTriggerPhrases,
} from "../../../../src/stages/1-analysis/skill-analyzer.js";

const fixturesPath = path.resolve(process.cwd(), "tests/fixtures");
const validPluginPath = path.join(fixturesPath, "valid-plugin");

describe("extractTriggerPhrases", () => {
  it("extracts quoted phrases after trigger keywords", () => {
    const description =
      'Use when user asks to "test something" or needs to "run tests"';
    const phrases = extractTriggerPhrases(description);

    expect(phrases).toContain("test something");
    expect(phrases).toContain("run tests");
  });

  it("extracts standalone quoted phrases", () => {
    const description = 'Handle requests like "hello world" and "greet me"';
    const phrases = extractTriggerPhrases(description);

    expect(phrases).toContain("hello world");
    expect(phrases).toContain("greet me");
  });

  it("deduplicates phrases", () => {
    const description = 'User asks to "test" or mentions "test" again';
    const phrases = extractTriggerPhrases(description);

    const testCount = phrases.filter((p) => p === "test").length;
    expect(testCount).toBe(1);
  });

  it("handles empty description", () => {
    const phrases = extractTriggerPhrases("");
    expect(phrases).toHaveLength(0);
  });
});

describe("extractSemanticIntents", () => {
  it("parses action-object patterns", () => {
    const intents = extractSemanticIntents(["create a hook", "add a skill"]);

    expect(intents).toHaveLength(2);
    expect(intents[0]?.action).toBe("create");
    expect(intents[0]?.object).toBe("hook");
    expect(intents[1]?.action).toBe("add");
    expect(intents[1]?.object).toBe("skill");
  });

  it("extracts context from phrases", () => {
    const intents = extractSemanticIntents(["create a hook for validation"]);

    expect(intents[0]?.context).toContain("for validation");
  });

  it("preserves raw phrase", () => {
    const phrase = "build a custom plugin";
    const intents = extractSemanticIntents([phrase]);

    expect(intents[0]?.raw_phrase).toBe(phrase);
  });
});

describe("analyzeSkill", () => {
  it("parses skill from SKILL.md", () => {
    const skillDir = path.join(validPluginPath, "skills", "test-skill");
    const skill = analyzeSkill(skillDir);

    expect(skill.name).toBe("test-skill");
    expect(skill.path).toContain("SKILL.md");
    expect(skill.description).toContain("test something");
    expect(skill.trigger_phrases.length).toBeGreaterThan(0);
    expect(skill.allowed_tools).toContain("Read");
  });

  it("extracts allowed-tools correctly", () => {
    const skillDir = path.join(validPluginPath, "skills", "test-skill");
    const skill = analyzeSkill(skillDir);

    expect(skill.allowed_tools).toEqual(["Read", "Grep", "Glob"]);
  });
});

describe("analyzeSkills", () => {
  it("analyzes multiple skills", () => {
    const skillDirs = [
      path.join(validPluginPath, "skills", "test-skill"),
      path.join(validPluginPath, "skills", "greet-skill"),
    ];
    const skills = analyzeSkills(skillDirs);

    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.name)).toContain("test-skill");
    expect(skills.map((s) => s.name)).toContain("greet-skill");
  });
});
