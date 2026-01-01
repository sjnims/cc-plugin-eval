import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  analyzeCommand,
  analyzeCommands,
  getCommandInvocation,
  parseArgumentHint,
} from "../../../../src/stages/1-analysis/command-analyzer.js";

const fixturesPath = path.resolve(process.cwd(), "tests/fixtures");
const validPluginPath = path.join(fixturesPath, "valid-plugin");

describe("parseArgumentHint", () => {
  it("parses bracket arguments", () => {
    const args = parseArgumentHint("[filename] [options]");

    expect(args).toHaveLength(2);
    expect(args).toContain("filename");
    expect(args).toContain("options");
  });

  it("parses angle bracket arguments", () => {
    const args = parseArgumentHint("<required> [optional]");

    expect(args).toHaveLength(2);
    expect(args).toContain("required");
    expect(args).toContain("optional");
  });

  it("returns empty array for no arguments", () => {
    expect(parseArgumentHint(undefined)).toHaveLength(0);
    expect(parseArgumentHint("")).toHaveLength(0);
  });
});

describe("analyzeCommand", () => {
  it("parses command from markdown file", () => {
    const commandPath = path.join(
      validPluginPath,
      "commands",
      "test-command.md",
    );
    const command = analyzeCommand(commandPath, "", "test-plugin");

    expect(command.name).toBe("test-command");
    expect(command.plugin_prefix).toBe("test-plugin");
    expect(command.namespace).toBe("");
    expect(command.fullName).toBe("test-command");
    expect(command.argument_hint).toBe("[filename]");
    expect(command.allowed_tools).toContain("Read");
    expect(command.disable_model_invocation).toBe(false);
  });

  it("handles nested commands with namespace", () => {
    const commandPath = path.join(
      validPluginPath,
      "commands",
      "advanced",
      "nested-command.md",
    );
    const command = analyzeCommand(commandPath, "advanced", "test-plugin");

    expect(command.name).toBe("nested-command");
    expect(command.namespace).toBe("advanced");
    expect(command.fullName).toBe("advanced/nested-command");
    expect(command.disable_model_invocation).toBe(true);
  });
});

describe("getCommandInvocation", () => {
  it("formats command without namespace", () => {
    const command = analyzeCommand(
      path.join(validPluginPath, "commands", "test-command.md"),
      "",
      "test-plugin",
    );

    expect(getCommandInvocation(command)).toBe("/test-plugin:test-command");
  });

  it("formats command with namespace", () => {
    const command = analyzeCommand(
      path.join(validPluginPath, "commands", "advanced", "nested-command.md"),
      "advanced",
      "test-plugin",
    );

    expect(getCommandInvocation(command)).toBe(
      "/test-plugin:advanced/nested-command",
    );
  });
});

describe("analyzeCommands", () => {
  it("analyzes multiple commands", () => {
    const commandFiles = [
      {
        path: path.join(validPluginPath, "commands", "test-command.md"),
        namespace: "",
      },
      {
        path: path.join(
          validPluginPath,
          "commands",
          "advanced",
          "nested-command.md",
        ),
        namespace: "advanced",
      },
    ];
    const commands = analyzeCommands(commandFiles, "test-plugin");

    expect(commands).toHaveLength(2);
    expect(commands.map((c) => c.name)).toContain("test-command");
    expect(commands.map((c) => c.name)).toContain("nested-command");
  });
});
