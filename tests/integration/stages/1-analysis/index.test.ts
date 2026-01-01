/**
 * Integration tests for Stage 1: Analysis
 *
 * Tests the full runAnalysis() pipeline with real fixtures.
 */

import path from "node:path";

import { describe, expect, it } from "vitest";

import { runAnalysis } from "../../../../src/stages/1-analysis/index.js";
import type { EvalConfig } from "../../../../src/types/index.js";

const fixturesPath = path.resolve(process.cwd(), "tests/fixtures");
const validPluginPath = path.join(fixturesPath, "valid-plugin");

/**
 * Create a minimal EvalConfig for testing.
 */
function createTestConfig(
  pluginPath: string,
  scope: Partial<{ skills: boolean; agents: boolean; commands: boolean }> = {},
): EvalConfig {
  return {
    plugin: { path: pluginPath },
    scope: {
      skills: scope.skills ?? true,
      agents: scope.agents ?? true,
      commands: scope.commands ?? true,
      hooks: false,
      mcp_servers: false,
    },
    generation: {
      model: "claude-sonnet-4-5-20250929",
      scenarios_per_component: 2,
      diversity: 0.5,
      max_tokens: 4000,
      reasoning_effort: "low",
      semantic_variations: false,
    },
    execution: {
      model: "claude-sonnet-4-20250514",
      max_turns: 3,
      timeout_ms: 30000,
      max_budget_usd: 1.0,
      session_isolation: true,
      permission_bypass: true,
      num_reps: 1,
      additional_plugins: [],
    },
    evaluation: {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      detection_mode: "programmatic_first",
      reasoning_effort: "low",
      num_samples: 1,
      aggregate_method: "average",
      include_citations: false,
    },
    output: {
      format: "json",
      include_cli_summary: true,
      junit_test_suite_name: "test-plugin-eval",
    },
    dry_run: false,
    estimate_costs: false,
    batch_threshold: 50,
    force_synchronous: true,
    poll_interval_ms: 30000,
    rewind_file_changes: false,
    debug: false,
    verbose: false,
    max_concurrent: 5,
  };
}

describe("runAnalysis integration", () => {
  it("analyzes valid plugin and returns complete output", async () => {
    const config = createTestConfig(validPluginPath);
    const output = await runAnalysis(config);

    // Verify plugin name
    expect(output.plugin_name).toBe("test-plugin");

    // Verify plugin load result
    expect(output.plugin_load_result.loaded).toBe(true);
    expect(output.plugin_load_result.plugin_name).toBe("test-plugin");
    expect(output.plugin_load_result.plugin_path).toBe(validPluginPath);

    // Verify components discovered
    expect(output.components.skills.length).toBeGreaterThanOrEqual(2);
    expect(output.components.agents.length).toBeGreaterThanOrEqual(2);
    expect(output.components.commands.length).toBeGreaterThanOrEqual(2);

    // Verify trigger understanding populated
    expect(Object.keys(output.trigger_understanding.skills).length).toBe(
      output.components.skills.length,
    );
    expect(Object.keys(output.trigger_understanding.agents).length).toBe(
      output.components.agents.length,
    );
    expect(Object.keys(output.trigger_understanding.commands).length).toBe(
      output.components.commands.length,
    );
  });

  it("respects scope configuration for skills only", async () => {
    const config = createTestConfig(validPluginPath, {
      skills: true,
      agents: false,
      commands: false,
    });
    const output = await runAnalysis(config);

    // Skills should be analyzed
    expect(output.components.skills.length).toBeGreaterThan(0);

    // Agents and commands should be empty
    expect(output.components.agents).toHaveLength(0);
    expect(output.components.commands).toHaveLength(0);

    // Trigger understanding should match
    expect(
      Object.keys(output.trigger_understanding.skills).length,
    ).toBeGreaterThan(0);
    expect(Object.keys(output.trigger_understanding.agents)).toHaveLength(0);
    expect(Object.keys(output.trigger_understanding.commands)).toHaveLength(0);
  });

  it("respects scope configuration for agents only", async () => {
    const config = createTestConfig(validPluginPath, {
      skills: false,
      agents: true,
      commands: false,
    });
    const output = await runAnalysis(config);

    expect(output.components.skills).toHaveLength(0);
    expect(output.components.agents.length).toBeGreaterThan(0);
    expect(output.components.commands).toHaveLength(0);
  });

  it("respects scope configuration for commands only", async () => {
    const config = createTestConfig(validPluginPath, {
      skills: false,
      agents: false,
      commands: true,
    });
    const output = await runAnalysis(config);

    expect(output.components.skills).toHaveLength(0);
    expect(output.components.agents).toHaveLength(0);
    expect(output.components.commands.length).toBeGreaterThan(0);
  });

  it("throws error for non-existent plugin path", async () => {
    const config = createTestConfig("/non/existent/path");

    await expect(runAnalysis(config)).rejects.toThrow(
      "Plugin preflight check failed",
    );
  });

  it("throws error for plugin without manifest", async () => {
    const config = createTestConfig(fixturesPath); // fixtures dir has no manifest

    await expect(runAnalysis(config)).rejects.toThrow(
      "Plugin preflight check failed",
    );
  });

  it("populates diagnostics in plugin load result", async () => {
    const config = createTestConfig(validPluginPath);
    const output = await runAnalysis(config);

    const diagnostics = output.plugin_load_result.diagnostics;
    expect(diagnostics).toBeDefined();
    expect(diagnostics?.manifest_found).toBe(true);
    expect(diagnostics?.manifest_valid).toBe(true);
    expect(diagnostics?.components_discovered.skills).toBeGreaterThanOrEqual(2);
    expect(diagnostics?.components_discovered.agents).toBeGreaterThanOrEqual(2);
    expect(diagnostics?.components_discovered.commands).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("extracts trigger phrases for skills", async () => {
    const config = createTestConfig(validPluginPath, {
      skills: true,
      agents: false,
      commands: false,
    });
    const output = await runAnalysis(config);

    // Find a skill with triggers
    const testSkill = output.components.skills.find(
      (s) => s.name === "test-skill",
    );
    expect(testSkill).toBeDefined();
    expect(testSkill?.trigger_phrases.length).toBeGreaterThan(0);

    // Verify trigger understanding
    const skillTriggerInfo = output.trigger_understanding.skills["test-skill"];
    expect(skillTriggerInfo).toBeDefined();
    expect(skillTriggerInfo?.triggers.length).toBeGreaterThan(0);
  });

  it("extracts example triggers for agents", async () => {
    const config = createTestConfig(validPluginPath, {
      skills: false,
      agents: true,
      commands: false,
    });
    const output = await runAnalysis(config);

    // Find an agent with examples
    const testAgent = output.components.agents.find(
      (a) => a.name === "test-agent",
    );
    expect(testAgent).toBeDefined();
    expect(testAgent?.example_triggers.length).toBeGreaterThan(0);

    // Verify trigger understanding
    const agentTriggerInfo = output.trigger_understanding.agents["test-agent"];
    expect(agentTriggerInfo).toBeDefined();
    expect(agentTriggerInfo?.examples.length).toBeGreaterThan(0);
  });

  it("extracts command invocations correctly", async () => {
    const config = createTestConfig(validPluginPath, {
      skills: false,
      agents: false,
      commands: true,
    });
    const output = await runAnalysis(config);

    // Find root-level command
    const testCommand = output.components.commands.find(
      (c) => c.name === "test-command",
    );
    expect(testCommand).toBeDefined();
    expect(testCommand?.fullName).toBe("test-command");

    // Verify trigger understanding
    const cmdTriggerInfo =
      output.trigger_understanding.commands["test-command"];
    expect(cmdTriggerInfo).toBeDefined();
    expect(cmdTriggerInfo?.invocation).toBe("/test-plugin:test-command");
  });

  it("handles nested commands with namespaces", async () => {
    const config = createTestConfig(validPluginPath, {
      skills: false,
      agents: false,
      commands: true,
    });
    const output = await runAnalysis(config);

    // Find nested command
    const nestedCommand = output.components.commands.find(
      (c) => c.name === "nested-command",
    );
    expect(nestedCommand).toBeDefined();
    expect(nestedCommand?.namespace).toBe("advanced");
    expect(nestedCommand?.fullName).toBe("advanced/nested-command");

    // Verify trigger understanding
    const cmdTriggerInfo =
      output.trigger_understanding.commands["nested-command"];
    expect(cmdTriggerInfo).toBeDefined();
    expect(cmdTriggerInfo?.invocation).toBe(
      "/test-plugin:advanced/nested-command",
    );
  });

  it("registers discovered components in plugin load result", async () => {
    const config = createTestConfig(validPluginPath);
    const output = await runAnalysis(config);

    // Verify registered components match discovered ones
    expect(output.plugin_load_result.registered_skills).toEqual(
      output.components.skills.map((s) => s.name),
    );
    expect(output.plugin_load_result.registered_agents).toEqual(
      output.components.agents.map((a) => a.name),
    );
    expect(output.plugin_load_result.registered_commands).toEqual(
      output.components.commands.map((c) => c.name),
    );
  });
});
