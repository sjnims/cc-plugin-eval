/**
 * Unit tests for command-scenario-generator.ts
 */

import { describe, expect, it } from "vitest";

import {
  generateCommandScenarios,
  generateAllCommandScenarios,
  generateArgFromHint,
  getExpectedCommandScenarioCount,
} from "../../../../src/stages/2-generation/command-scenario-generator.js";
import type { CommandComponent } from "../../../../src/types/index.js";

describe("generateArgFromHint", () => {
  it("should generate file path for file hints", () => {
    expect(generateArgFromHint("[filename]")).toBe("test-file.ts");
    expect(generateArgFromHint("[file]")).toBe("test-file.ts");
  });

  it("should generate directory for dir hints", () => {
    expect(generateArgFromHint("[dir]")).toBe("./src");
    expect(generateArgFromHint("[path]")).toBe("./src");
  });

  it("should generate URL for url hints", () => {
    expect(generateArgFromHint("[url]")).toBe("https://example.com");
  });

  it("should generate number for number hints", () => {
    expect(generateArgFromHint("[number]")).toBe("42");
    expect(generateArgFromHint("[count]")).toBe("42");
  });

  it("should generate name for name hints", () => {
    expect(generateArgFromHint("[name]")).toBe("test-name");
  });

  it("should generate id for id hints", () => {
    expect(generateArgFromHint("[id]")).toBe("123");
  });

  it("should generate option for option hints", () => {
    expect(generateArgFromHint("[option]")).toBe("--verbose");
  });

  it("should return generic value for unknown hints", () => {
    expect(generateArgFromHint("[something]")).toBe("test-value");
  });

  it("should handle multiple hints", () => {
    const result = generateArgFromHint("[filename] [option]");
    expect(result).toBe("test-file.ts --verbose");
  });

  it("should return empty for no brackets", () => {
    expect(generateArgFromHint("no brackets here")).toBe("");
  });
});

describe("generateCommandScenarios", () => {
  const baseCommand: CommandComponent = {
    name: "commit",
    path: "/path/to/command.md",
    plugin_prefix: "git-tools",
    namespace: "",
    fullName: "commit",
    description: "Create a git commit",
    disable_model_invocation: false,
  };

  it("should generate basic invocation scenario", () => {
    const scenarios = generateCommandScenarios(baseCommand);

    const basic = scenarios.find((s) => s.id.includes("basic"));
    expect(basic).toBeDefined();
    expect(basic?.user_prompt).toBe("/git-tools:commit");
    expect(basic?.scenario_type).toBe("direct");
    expect(basic?.expected_trigger).toBe(true);
  });

  it("should generate with-args scenario", () => {
    const scenarios = generateCommandScenarios(baseCommand);

    const withArgs = scenarios.find((s) => s.id.includes("with-args"));
    expect(withArgs).toBeDefined();
    expect(withArgs?.user_prompt).toMatch(/^\/git-tools:commit .+/);
    expect(withArgs?.scenario_type).toBe("direct");
  });

  it("should generate file-ref scenario", () => {
    const scenarios = generateCommandScenarios(baseCommand);

    const fileRef = scenarios.find(
      (s) => s.id.includes("file-ref") && !s.id.includes("multi"),
    );
    expect(fileRef).toBeDefined();
    expect(fileRef?.user_prompt).toMatch(/@README\.md/);
  });

  it("should generate multi-file-ref scenario", () => {
    const scenarios = generateCommandScenarios(baseCommand);

    const multiFileRef = scenarios.find((s) => s.id.includes("multi-file-ref"));
    expect(multiFileRef).toBeDefined();
    // Should have 2 file references
    expect(multiFileRef?.user_prompt).toContain("@src/index.ts");
    expect(multiFileRef?.user_prompt).toContain("@package.json");
  });

  it("should generate negative scenario when not disabled", () => {
    const scenarios = generateCommandScenarios(baseCommand);

    const negative = scenarios.find((s) => s.id.includes("negative"));
    expect(negative).toBeDefined();
    expect(negative?.scenario_type).toBe("negative");
    expect(negative?.expected_trigger).toBe(false);
    // Should be natural language, not slash command
    expect(negative?.user_prompt).not.toMatch(/^\//);
  });

  it("should generate model-invocation-blocked for disabled commands", () => {
    const disabledCommand: CommandComponent = {
      ...baseCommand,
      disable_model_invocation: true,
    };

    const scenarios = generateCommandScenarios(disabledCommand);

    const blocked = scenarios.find((s) =>
      s.id.includes("model-invocation-blocked"),
    );
    expect(blocked).toBeDefined();
    expect(blocked?.scenario_type).toBe("negative");
  });

  it("should handle namespaced commands", () => {
    const namespacedCommand: CommandComponent = {
      ...baseCommand,
      namespace: "advanced",
      fullName: "advanced/commit",
    };

    const scenarios = generateCommandScenarios(namespacedCommand);

    const basic = scenarios.find((s) => s.id.includes("basic"));
    expect(basic?.user_prompt).toBe("/git-tools:advanced/commit");
  });

  it("should generate hint-args scenario when argument_hint present", () => {
    const commandWithHint: CommandComponent = {
      ...baseCommand,
      argument_hint: "[filename] [option]",
    };

    const scenarios = generateCommandScenarios(commandWithHint);

    const hintArgs = scenarios.find((s) => s.id.includes("hint-args"));
    expect(hintArgs).toBeDefined();
    expect(hintArgs?.user_prompt).toContain("test-file.ts");
    expect(hintArgs?.user_prompt).toContain("--verbose");
  });

  it("should set correct component metadata", () => {
    const scenarios = generateCommandScenarios(baseCommand);

    for (const scenario of scenarios) {
      expect(scenario.component_ref).toBe("commit");
      expect(scenario.component_type).toBe("command");
      expect(scenario.expected_component).toBe("commit");
    }
  });
});

describe("generateAllCommandScenarios", () => {
  it("should generate scenarios for all commands", () => {
    const commands: CommandComponent[] = [
      {
        name: "commit",
        path: "/path/to/commit.md",
        plugin_prefix: "git-tools",
        namespace: "",
        fullName: "commit",
        description: "Create a git commit",
        disable_model_invocation: false,
      },
      {
        name: "push",
        path: "/path/to/push.md",
        plugin_prefix: "git-tools",
        namespace: "",
        fullName: "push",
        description: "Push to remote",
        disable_model_invocation: false,
      },
    ];

    const scenarios = generateAllCommandScenarios(commands);

    // Should have scenarios for both commands
    const commitScenarios = scenarios.filter(
      (s) => s.component_ref === "commit",
    );
    const pushScenarios = scenarios.filter((s) => s.component_ref === "push");

    expect(commitScenarios.length).toBeGreaterThan(0);
    expect(pushScenarios.length).toBeGreaterThan(0);
  });

  it("should return empty array for empty input", () => {
    const scenarios = generateAllCommandScenarios([]);
    expect(scenarios).toEqual([]);
  });

  it("should have unique IDs across all scenarios", () => {
    const commands: CommandComponent[] = [
      {
        name: "cmd1",
        path: "/path/1",
        plugin_prefix: "plugin",
        namespace: "",
        fullName: "cmd1",
        description: "Command 1",
        disable_model_invocation: false,
      },
      {
        name: "cmd2",
        path: "/path/2",
        plugin_prefix: "plugin",
        namespace: "",
        fullName: "cmd2",
        description: "Command 2",
        disable_model_invocation: false,
      },
    ];

    const scenarios = generateAllCommandScenarios(commands);
    const ids = scenarios.map((s) => s.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe("getExpectedCommandScenarioCount", () => {
  it("should return 5 per command without hint", () => {
    const commands: CommandComponent[] = [
      {
        name: "cmd",
        path: "/path",
        plugin_prefix: "plugin",
        namespace: "",
        fullName: "cmd",
        description: "Test",
        disable_model_invocation: false,
      },
    ];

    const count = getExpectedCommandScenarioCount(commands);
    expect(count).toBe(5);
  });

  it("should return 6 per command with hint", () => {
    const commands: CommandComponent[] = [
      {
        name: "cmd",
        path: "/path",
        plugin_prefix: "plugin",
        namespace: "",
        fullName: "cmd",
        description: "Test",
        argument_hint: "[file]",
        disable_model_invocation: false,
      },
    ];

    const count = getExpectedCommandScenarioCount(commands);
    expect(count).toBe(6);
  });

  it("should sum across all commands", () => {
    const commands: CommandComponent[] = [
      {
        name: "cmd1",
        path: "/path",
        plugin_prefix: "plugin",
        namespace: "",
        fullName: "cmd1",
        description: "Test 1",
        disable_model_invocation: false,
      },
      {
        name: "cmd2",
        path: "/path",
        plugin_prefix: "plugin",
        namespace: "",
        fullName: "cmd2",
        description: "Test 2",
        argument_hint: "[option]",
        disable_model_invocation: false,
      },
    ];

    const count = getExpectedCommandScenarioCount(commands);
    expect(count).toBe(5 + 6);
  });
});
