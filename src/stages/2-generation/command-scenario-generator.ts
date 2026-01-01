/**
 * Command Scenario Generator - Deterministic scenario generation for commands.
 *
 * Commands use explicit /command syntax, so test scenarios are deterministic:
 * - Basic invocation: /plugin:command
 * - With arguments: /plugin:command arg1 arg2
 * - With file references: /plugin:command @file.md
 * - Negative: natural language that should NOT trigger
 */

import type { CommandComponent, TestScenario } from "../../types/index.js";

/**
 * Generate test scenarios for a command.
 *
 * @param cmd - Command component
 * @returns Array of test scenarios
 */
export function generateCommandScenarios(
  cmd: CommandComponent,
): TestScenario[] {
  // Build full command name with namespace if present
  const fullCommandName = cmd.namespace
    ? `/${cmd.plugin_prefix}:${cmd.namespace}/${cmd.name}`
    : `/${cmd.plugin_prefix}:${cmd.name}`;

  const scenarios: TestScenario[] = [];

  // 1. Basic invocation - explicit /command syntax
  scenarios.push({
    id: `${cmd.fullName}-basic`,
    component_ref: cmd.fullName,
    component_type: "command",
    scenario_type: "direct",
    user_prompt: fullCommandName,
    expected_trigger: true,
    expected_component: cmd.fullName,
    reasoning: "Basic command invocation with explicit slash syntax",
  });

  // 2. With simple argument
  scenarios.push({
    id: `${cmd.fullName}-with-args`,
    component_ref: cmd.fullName,
    component_type: "command",
    scenario_type: "direct",
    user_prompt: `${fullCommandName} test-arg`,
    expected_trigger: true,
    expected_component: cmd.fullName,
    reasoning: "Command invocation with simple argument",
  });

  // 3. With file reference (@file.md syntax)
  scenarios.push({
    id: `${cmd.fullName}-file-ref`,
    component_ref: cmd.fullName,
    component_type: "command",
    scenario_type: "direct",
    user_prompt: `${fullCommandName} @README.md`,
    expected_trigger: true,
    expected_component: cmd.fullName,
    expected_file_reference: "README.md",
    reasoning: "Command invocation with file reference",
  });

  // 4. With multiple file references
  scenarios.push({
    id: `${cmd.fullName}-multi-file-ref`,
    component_ref: cmd.fullName,
    component_type: "command",
    scenario_type: "direct",
    user_prompt: `${fullCommandName} @src/index.ts @package.json`,
    expected_trigger: true,
    expected_component: cmd.fullName,
    expected_file_references: ["src/index.ts", "package.json"],
    reasoning: "Command invocation with multiple file references",
  });

  // 5. Negative scenario handling based on disable-model-invocation
  if (!cmd.disable_model_invocation) {
    // Only add negative test for commands that CAN be model-invoked
    // This tests that natural language doesn't incorrectly trigger it
    scenarios.push({
      id: `${cmd.fullName}-negative`,
      component_ref: cmd.fullName,
      component_type: "command",
      scenario_type: "negative",
      user_prompt: `Run the ${cmd.name} command`,
      expected_trigger: false,
      expected_component: cmd.fullName,
      reasoning:
        "Natural language should not trigger command invocation - only explicit slash syntax should",
    });
  } else {
    // For disable-model-invocation commands, verify it cannot be invoked programmatically
    scenarios.push({
      id: `${cmd.fullName}-model-invocation-blocked`,
      component_ref: cmd.fullName,
      component_type: "command",
      scenario_type: "negative",
      user_prompt: `Please invoke the ${cmd.name} command programmatically`,
      expected_trigger: false,
      expected_component: cmd.fullName,
      reasoning:
        "Command has disable-model-invocation: true - cannot be invoked via SlashCommand tool",
    });
  }

  // 6. If command has argument_hint, add scenario with hint-like args
  if (cmd.argument_hint) {
    const generatedArgs = generateArgFromHint(cmd.argument_hint);
    scenarios.push({
      id: `${cmd.fullName}-with-hint-args`,
      component_ref: cmd.fullName,
      component_type: "command",
      scenario_type: "direct",
      user_prompt: `${fullCommandName} ${generatedArgs}`,
      expected_trigger: true,
      expected_component: cmd.fullName,
      reasoning: `Command invocation with arguments matching hint: ${cmd.argument_hint}`,
    });
  }

  return scenarios;
}

/**
 * Generate argument string from argument hint.
 *
 * @param hint - Argument hint like "[filename] [options]"
 * @returns Generated argument string
 */
export function generateArgFromHint(hint: string): string {
  // Parse argument hint like "[filename] [options]" → "test.ts --verbose"
  const parts = hint.match(/\[([^\]]+)\]/g) ?? [];

  return parts
    .map((p) => {
      const name = p.slice(1, -1).toLowerCase();
      if (name.includes("file")) {
        return "test-file.ts";
      }
      if (name.includes("dir") || name.includes("path")) {
        return "./src";
      }
      if (name.includes("option")) {
        return "--verbose";
      }
      if (name.includes("url")) {
        return "https://example.com";
      }
      if (name.includes("name")) {
        return "test-name";
      }
      if (name.includes("id")) {
        return "123";
      }
      if (name.includes("number") || name.includes("count")) {
        return "42";
      }
      return "test-value";
    })
    .join(" ");
}

/**
 * Generate scenarios for all commands.
 *
 * @param commands - Array of command components
 * @returns Array of all test scenarios
 */
export function generateAllCommandScenarios(
  commands: CommandComponent[],
): TestScenario[] {
  const scenarios: TestScenario[] = [];

  for (const cmd of commands) {
    scenarios.push(...generateCommandScenarios(cmd));
  }

  return scenarios;
}

/**
 * Get expected scenario count for commands.
 * Used for cost estimation.
 *
 * @param commands - Array of command components
 * @returns Expected scenario count
 */
export function getExpectedCommandScenarioCount(
  commands: CommandComponent[],
): number {
  let count = 0;

  for (const cmd of commands) {
    // Base scenarios: basic, with-args, file-ref, multi-file-ref, negative
    count += 5;
    // Add 1 if has argument_hint
    if (cmd.argument_hint) {
      count += 1;
    }
  }

  return count;
}
