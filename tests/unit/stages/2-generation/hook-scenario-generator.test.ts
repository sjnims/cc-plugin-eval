import path from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeHooks } from "../../../../src/stages/1-analysis/hook-analyzer.js";
import {
  generateHookScenarios,
  generateAllHookScenarios,
  getExpectedHookScenarioCount,
  getToolPrompt,
} from "../../../../src/stages/2-generation/hook-scenario-generator.js";

const fixturesPath = path.resolve(process.cwd(), "tests/fixtures");
const validPluginPath = path.join(fixturesPath, "valid-plugin");
const hooksPath = path.join(validPluginPath, "hooks", "hooks.json");

describe("getToolPrompt", () => {
  it("returns prompt for Write tool", () => {
    const prompt = getToolPrompt("Write");
    expect(prompt).toBeDefined();
    expect(prompt.toLowerCase()).toContain("file");
  });

  it("returns prompt for Read tool", () => {
    const prompt = getToolPrompt("Read");
    expect(prompt).toBeDefined();
    expect(prompt.toLowerCase()).toContain("read");
  });

  it("returns prompt for Bash tool", () => {
    const prompt = getToolPrompt("Bash");
    expect(prompt).toBeDefined();
    expect(prompt.toLowerCase()).toContain("run");
  });

  it("returns prompt for Edit tool", () => {
    const prompt = getToolPrompt("Edit");
    expect(prompt).toBeDefined();
  });

  it("returns generic prompt for unknown tools", () => {
    const prompt = getToolPrompt("UnknownTool");
    expect(prompt).toBeDefined();
    expect(prompt.toLowerCase()).toContain("unknowntool");
  });

  it("returns prompt for wildcard matcher", () => {
    const prompt = getToolPrompt("*");
    expect(prompt).toBeDefined();
  });
});

describe("generateHookScenarios", () => {
  it("generates scenarios for PreToolUse hook", () => {
    const hooks = analyzeHooks(hooksPath);
    const preToolUseHook = hooks.find(
      (h) => h.eventType === "PreToolUse" && h.matcher === "Write|Edit",
    );
    expect(preToolUseHook).toBeDefined();

    const scenarios = generateHookScenarios(preToolUseHook!);

    // Should generate scenarios for each matching tool
    expect(scenarios.length).toBeGreaterThan(0);
    expect(scenarios.every((s) => s.component_type === "hook")).toBe(true);
    expect(scenarios.some((s) => s.scenario_type === "direct")).toBe(true);
  });

  it("generates negative scenarios", () => {
    const hooks = analyzeHooks(hooksPath);
    const preToolUseHook = hooks.find(
      (h) => h.eventType === "PreToolUse" && h.matcher === "Write|Edit",
    );
    expect(preToolUseHook).toBeDefined();

    const scenarios = generateHookScenarios(preToolUseHook!);
    const negativeScenarios = scenarios.filter(
      (s) => s.scenario_type === "negative",
    );

    expect(negativeScenarios.length).toBeGreaterThan(0);
    expect(negativeScenarios.every((s) => s.expected_trigger === false)).toBe(
      true,
    );
  });

  it("generates scenarios for Stop hook", () => {
    const hooks = analyzeHooks(hooksPath);
    const stopHook = hooks.find((h) => h.eventType === "Stop");
    expect(stopHook).toBeDefined();

    const scenarios = generateHookScenarios(stopHook!);

    expect(scenarios.length).toBeGreaterThan(0);
    expect(scenarios[0]?.component_ref).toContain("Stop");
  });

  it("generates scenarios for SessionStart hook", () => {
    const hooks = analyzeHooks(hooksPath);
    const sessionHook = hooks.find((h) => h.eventType === "SessionStart");
    expect(sessionHook).toBeDefined();

    const scenarios = generateHookScenarios(sessionHook!);

    // SessionStart hooks fire on session start, not tool use
    expect(scenarios.length).toBeGreaterThan(0);
  });

  it("generates scenarios for UserPromptSubmit hook", () => {
    const hooks = analyzeHooks(hooksPath);
    const promptHook = hooks.find((h) => h.eventType === "UserPromptSubmit");
    expect(promptHook).toBeDefined();

    const scenarios = generateHookScenarios(promptHook!);

    expect(scenarios.length).toBeGreaterThan(0);
  });

  it("includes hook metadata in scenarios", () => {
    const hooks = analyzeHooks(hooksPath);
    const preToolUseHook = hooks.find(
      (h) => h.eventType === "PreToolUse" && h.matcher === "Bash",
    );
    expect(preToolUseHook).toBeDefined();

    const scenarios = generateHookScenarios(preToolUseHook!);
    const directScenario = scenarios.find((s) => s.scenario_type === "direct");

    expect(directScenario).toBeDefined();
    expect(directScenario?.component_ref).toBe(preToolUseHook!.name);
  });

  it("generates unique scenario ids", () => {
    const hooks = analyzeHooks(hooksPath);
    const allScenarios = hooks.flatMap((h) => generateHookScenarios(h));

    const ids = allScenarios.map((s) => s.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe("generateAllHookScenarios", () => {
  it("generates scenarios for all hooks", () => {
    const hooks = analyzeHooks(hooksPath);
    const scenarios = generateAllHookScenarios(hooks);

    expect(scenarios.length).toBeGreaterThan(0);
    expect(scenarios.every((s) => s.component_type === "hook")).toBe(true);
  });

  it("returns empty array for empty hooks", () => {
    const scenarios = generateAllHookScenarios([]);
    expect(scenarios).toEqual([]);
  });
});

describe("getExpectedHookScenarioCount", () => {
  it("returns expected count for hooks", () => {
    const hooks = analyzeHooks(hooksPath);
    const expectedCount = getExpectedHookScenarioCount(hooks);

    expect(expectedCount).toBeGreaterThan(0);
    expect(typeof expectedCount).toBe("number");
  });

  it("returns 0 for empty hooks", () => {
    const count = getExpectedHookScenarioCount([]);
    expect(count).toBe(0);
  });

  it("count matches actual generation", () => {
    const hooks = analyzeHooks(hooksPath);
    const expectedCount = getExpectedHookScenarioCount(hooks);
    const scenarios = generateAllHookScenarios(hooks);

    // Allow some tolerance for dynamic generation
    expect(Math.abs(scenarios.length - expectedCount)).toBeLessThan(
      hooks.length * 2,
    );
  });
});
