/**
 * Unit tests for hook-capture.ts
 */

import { describe, expect, it } from "vitest";

import {
  analyzeHookResponses,
  analyzeCaptures,
  createHookResponseCollector,
  createToolCaptureCollector,
  extractCommandName,
  extractSkillName,
  extractTaskInfo,
  filterTriggerCaptures,
  isMcpTool,
  isTriggerTool,
  parseMcpToolName,
  TRIGGER_TOOL_NAMES,
} from "../../../../src/stages/3-execution/hook-capture.js";
import type {
  HookResponseCapture,
  ToolCapture,
} from "../../../../src/types/index.js";

describe("createToolCaptureCollector", () => {
  it("should create a collector with empty captures", () => {
    const collector = createToolCaptureCollector();

    expect(collector.captures).toEqual([]);
    expect(typeof collector.hook).toBe("function");
    expect(typeof collector.clear).toBe("function");
  });

  it("should capture tool invocations via hook", async () => {
    const collector = createToolCaptureCollector();

    await collector.hook(
      { tool_name: "Skill", tool_input: { skill: "test-skill" } },
      "tool-use-123",
      { signal: new AbortController().signal },
    );

    expect(collector.captures).toHaveLength(1);
    expect(collector.captures[0]).toMatchObject({
      name: "Skill",
      input: { skill: "test-skill" },
      toolUseId: "tool-use-123",
    });
    expect(collector.captures[0]?.timestamp).toBeTypeOf("number");
  });

  it("should clear captures", async () => {
    const collector = createToolCaptureCollector();

    await collector.hook({ tool_name: "Skill", tool_input: {} }, undefined, {
      signal: new AbortController().signal,
    });

    expect(collector.captures).toHaveLength(1);

    collector.clear();

    expect(collector.captures).toHaveLength(0);
  });

  it("should return empty object from hook to allow operation", async () => {
    const collector = createToolCaptureCollector();

    const result = await collector.hook(
      { tool_name: "Read", tool_input: {} },
      undefined,
      { signal: new AbortController().signal },
    );

    expect(result).toEqual({});
  });
});

describe("TRIGGER_TOOL_NAMES", () => {
  it("should include Skill, Task, and SlashCommand", () => {
    expect(TRIGGER_TOOL_NAMES).toContain("Skill");
    expect(TRIGGER_TOOL_NAMES).toContain("Task");
    expect(TRIGGER_TOOL_NAMES).toContain("SlashCommand");
  });
});

describe("isTriggerTool", () => {
  it("should return true for trigger tools", () => {
    expect(isTriggerTool("Skill")).toBe(true);
    expect(isTriggerTool("Task")).toBe(true);
    expect(isTriggerTool("SlashCommand")).toBe(true);
  });

  it("should return false for non-trigger tools", () => {
    expect(isTriggerTool("Read")).toBe(false);
    expect(isTriggerTool("Write")).toBe(false);
    expect(isTriggerTool("Bash")).toBe(false);
  });
});

describe("isMcpTool", () => {
  it("should return true for MCP tools", () => {
    expect(isMcpTool("mcp__github__create_issue")).toBe(true);
    expect(isMcpTool("mcp__postgres__query")).toBe(true);
  });

  it("should return false for non-MCP tools", () => {
    expect(isMcpTool("Skill")).toBe(false);
    expect(isMcpTool("Read")).toBe(false);
    expect(isMcpTool("mcp_without_double_underscore")).toBe(false);
  });
});

describe("parseMcpToolName", () => {
  it("should parse MCP tool names correctly", () => {
    const result = parseMcpToolName("mcp__github__create_issue");

    expect(result).toEqual({
      serverName: "github",
      toolName: "create_issue",
    });
  });

  it("should handle tools with underscores in name", () => {
    const result = parseMcpToolName("mcp__postgres__run_sql_query");

    expect(result).toEqual({
      serverName: "postgres",
      toolName: "run_sql_query",
    });
  });

  it("should return null for non-MCP tools", () => {
    expect(parseMcpToolName("Skill")).toBeNull();
    expect(parseMcpToolName("Read")).toBeNull();
  });

  it("should return null for malformed MCP tool names", () => {
    expect(parseMcpToolName("mcp__only_server")).toBeNull();
  });
});

describe("filterTriggerCaptures", () => {
  it("should filter to only trigger tools", () => {
    const captures: ToolCapture[] = [
      { name: "Skill", input: {}, toolUseId: "1", timestamp: 1 },
      { name: "Read", input: {}, toolUseId: "2", timestamp: 2 },
      { name: "Task", input: {}, toolUseId: "3", timestamp: 3 },
      { name: "Write", input: {}, toolUseId: "4", timestamp: 4 },
      { name: "SlashCommand", input: {}, toolUseId: "5", timestamp: 5 },
    ];

    const filtered = filterTriggerCaptures(captures);

    expect(filtered).toHaveLength(3);
    expect(filtered.map((c) => c.name)).toEqual([
      "Skill",
      "Task",
      "SlashCommand",
    ]);
  });

  it("should return empty array when no trigger tools", () => {
    const captures: ToolCapture[] = [
      { name: "Read", input: {}, toolUseId: "1", timestamp: 1 },
      { name: "Write", input: {}, toolUseId: "2", timestamp: 2 },
    ];

    expect(filterTriggerCaptures(captures)).toEqual([]);
  });
});

describe("extractSkillName", () => {
  it("should extract skill name from input", () => {
    expect(extractSkillName({ skill: "hook-development" })).toBe(
      "hook-development",
    );
  });

  it("should return null for invalid input", () => {
    expect(extractSkillName(null)).toBeNull();
    expect(extractSkillName(undefined)).toBeNull();
    expect(extractSkillName({})).toBeNull();
    expect(extractSkillName({ skill: 123 })).toBeNull();
    expect(extractSkillName("not an object")).toBeNull();
  });
});

describe("extractTaskInfo", () => {
  it("should extract task info with description", () => {
    const result = extractTaskInfo({
      subagent_type: "code-reviewer",
      description: "Review the code changes",
    });

    expect(result).toEqual({
      subagentType: "code-reviewer",
      description: "Review the code changes",
    });
  });

  it("should extract task info without description", () => {
    const result = extractTaskInfo({
      subagent_type: "Explore",
    });

    expect(result).toEqual({
      subagentType: "Explore",
      description: undefined,
    });
  });

  it("should return null for invalid input", () => {
    expect(extractTaskInfo(null)).toBeNull();
    expect(extractTaskInfo(undefined)).toBeNull();
    expect(extractTaskInfo({})).toBeNull();
    expect(extractTaskInfo({ subagent_type: 123 })).toBeNull();
  });
});

describe("extractCommandName", () => {
  it("should extract command name from input", () => {
    expect(extractCommandName({ command: "/commit" })).toBe("/commit");
  });

  it("should return null for invalid input", () => {
    expect(extractCommandName(null)).toBeNull();
    expect(extractCommandName(undefined)).toBeNull();
    expect(extractCommandName({})).toBeNull();
    expect(extractCommandName({ command: 123 })).toBeNull();
  });
});

describe("analyzeCaptures", () => {
  it("should categorize captures by type", () => {
    const captures: ToolCapture[] = [
      {
        name: "Skill",
        input: { skill: "hook-dev" },
        toolUseId: "1",
        timestamp: 1,
      },
      {
        name: "Task",
        input: { subagent_type: "Explore", description: "Find files" },
        toolUseId: "2",
        timestamp: 2,
      },
      {
        name: "SlashCommand",
        input: { command: "/commit" },
        toolUseId: "3",
        timestamp: 3,
      },
      {
        name: "mcp__github__create_issue",
        input: {},
        toolUseId: "4",
        timestamp: 4,
      },
      { name: "Read", input: {}, toolUseId: "5", timestamp: 5 },
    ];

    const result = analyzeCaptures(captures);

    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]?.name).toBe("hook-dev");

    expect(result.agents).toHaveLength(1);
    expect(result.agents[0]?.subagentType).toBe("Explore");
    expect(result.agents[0]?.description).toBe("Find files");

    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]?.name).toBe("/commit");

    expect(result.mcpTools).toHaveLength(1);
    expect(result.mcpTools[0]?.serverName).toBe("github");
    expect(result.mcpTools[0]?.toolName).toBe("create_issue");
  });

  it("should return empty arrays when no matching captures", () => {
    const captures: ToolCapture[] = [
      { name: "Read", input: {}, toolUseId: "1", timestamp: 1 },
    ];

    const result = analyzeCaptures(captures);

    expect(result.skills).toEqual([]);
    expect(result.agents).toEqual([]);
    expect(result.commands).toEqual([]);
    expect(result.mcpTools).toEqual([]);
  });

  it("should handle captures with invalid input gracefully", () => {
    const captures: ToolCapture[] = [
      {
        name: "Skill",
        input: { wrong_field: "value" },
        toolUseId: "1",
        timestamp: 1,
      },
      { name: "Task", input: null, toolUseId: "2", timestamp: 2 },
    ];

    const result = analyzeCaptures(captures);

    expect(result.skills).toEqual([]);
    expect(result.agents).toEqual([]);
  });
});

describe("createHookResponseCollector", () => {
  it("should create collector with empty responses initially", () => {
    const collector = createHookResponseCollector();

    expect(collector.responses).toEqual([]);
    expect(typeof collector.processMessage).toBe("function");
    expect(typeof collector.clear).toBe("function");
  });

  it("should process valid hook response message", () => {
    const collector = createHookResponseCollector();

    const mockMessage = {
      type: "system",
      subtype: "hook_response",
      hook_name: "PreToolUse::Write|Edit",
      hook_event: "PreToolUse",
      stdout: "Hook executed successfully",
      stderr: "",
      exit_code: 0,
    };

    collector.processMessage(mockMessage);

    expect(collector.responses).toHaveLength(1);
    expect(collector.responses[0]?.hookName).toBe("PreToolUse::Write|Edit");
    expect(collector.responses[0]?.hookEvent).toBe("PreToolUse");
    expect(collector.responses[0]?.stdout).toBe("Hook executed successfully");
    expect(collector.responses[0]?.stderr).toBe("");
    expect(collector.responses[0]?.exitCode).toBe(0);
    expect(collector.responses[0]?.timestamp).toBeTypeOf("number");
  });

  it("should ignore non-hook-response messages", () => {
    const collector = createHookResponseCollector();

    const mockMessages = [
      { type: "text", content: "Hello" },
      { type: "system", subtype: "other" },
      { type: "tool_use", name: "Write" },
      null,
      undefined,
      "string message",
    ];

    for (const msg of mockMessages) {
      collector.processMessage(msg);
    }

    expect(collector.responses).toHaveLength(0);
  });

  it("should handle multiple hook response messages", () => {
    const collector = createHookResponseCollector();

    const messages = [
      {
        type: "system",
        subtype: "hook_response",
        hook_name: "PreToolUse::Write",
        hook_event: "PreToolUse",
        stdout: "First hook",
        stderr: "",
      },
      {
        type: "system",
        subtype: "hook_response",
        hook_name: "PostToolUse::Write",
        hook_event: "PostToolUse",
        stdout: "Second hook",
        stderr: "",
      },
    ];

    for (const msg of messages) {
      collector.processMessage(msg);
    }

    expect(collector.responses).toHaveLength(2);
    expect(collector.responses[0]?.hookName).toBe("PreToolUse::Write");
    expect(collector.responses[1]?.hookName).toBe("PostToolUse::Write");
  });

  it("should handle hook response with stderr output", () => {
    const collector = createHookResponseCollector();

    const mockMessage = {
      type: "system",
      subtype: "hook_response",
      hook_name: "PreToolUse::Bash",
      hook_event: "PreToolUse",
      stdout: "",
      stderr: "Warning: validation failed",
      exit_code: 1,
    };

    collector.processMessage(mockMessage);

    expect(collector.responses).toHaveLength(1);
    expect(collector.responses[0]?.stderr).toBe("Warning: validation failed");
    expect(collector.responses[0]?.exitCode).toBe(1);
  });

  it("should clear all responses", () => {
    const collector = createHookResponseCollector();

    collector.processMessage({
      type: "system",
      subtype: "hook_response",
      hook_name: "Stop::*",
      hook_event: "Stop",
      stdout: "Session ended",
      stderr: "",
    });

    expect(collector.responses).toHaveLength(1);

    collector.clear();

    expect(collector.responses).toHaveLength(0);
  });

  it("should handle missing exit_code field", () => {
    const collector = createHookResponseCollector();

    const mockMessage = {
      type: "system",
      subtype: "hook_response",
      hook_name: "SessionStart::*",
      hook_event: "SessionStart",
      stdout: "Session initialized",
      stderr: "",
    };

    collector.processMessage(mockMessage);

    expect(collector.responses).toHaveLength(1);
    expect(collector.responses[0]?.exitCode).toBeUndefined();
  });

  it("should ignore messages with missing required fields", () => {
    const collector = createHookResponseCollector();

    const invalidMessages = [
      // Missing hook_name
      {
        type: "system",
        subtype: "hook_response",
        hook_event: "PreToolUse",
        stdout: "",
        stderr: "",
      },
      // Missing hook_event
      {
        type: "system",
        subtype: "hook_response",
        hook_name: "PreToolUse:Write",
        stdout: "",
        stderr: "",
      },
      // Missing stdout
      {
        type: "system",
        subtype: "hook_response",
        hook_name: "PreToolUse:Write",
        hook_event: "PreToolUse",
        stderr: "",
      },
      // Wrong type
      {
        type: "assistant",
        subtype: "hook_response",
        hook_name: "PreToolUse:Write",
        hook_event: "PreToolUse",
        stdout: "",
        stderr: "",
      },
      // Wrong subtype
      {
        type: "system",
        subtype: "other",
        hook_name: "PreToolUse:Write",
        hook_event: "PreToolUse",
        stdout: "",
        stderr: "",
      },
    ];

    for (const msg of invalidMessages) {
      collector.processMessage(msg);
    }

    expect(collector.responses).toHaveLength(0);
  });
});

describe("analyzeHookResponses", () => {
  const mockResponses: HookResponseCapture[] = [
    {
      hookName: "PreToolUse::Write|Edit",
      hookEvent: "PreToolUse",
      stdout: "Hook 1",
      stderr: "",
      timestamp: Date.now(),
    },
    {
      hookName: "PostToolUse::Write",
      hookEvent: "PostToolUse",
      stdout: "Hook 2",
      stderr: "",
      timestamp: Date.now(),
    },
    {
      hookName: "Stop::*",
      hookEvent: "Stop",
      stdout: "Hook 3",
      stderr: "",
      timestamp: Date.now(),
    },
  ];

  it("should return all responses when no filter provided", () => {
    const filtered = analyzeHookResponses(mockResponses);

    expect(filtered).toHaveLength(3);
    expect(filtered).toEqual(mockResponses);
  });

  it("should filter by exact hook name match", () => {
    const filtered = analyzeHookResponses(mockResponses, "Stop::*");

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.hookName).toBe("Stop::*");
  });

  it("should filter by event type and matcher pattern", () => {
    const filtered = analyzeHookResponses(
      mockResponses,
      "PreToolUse::Write|Edit",
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.hookEvent).toBe("PreToolUse");
    expect(filtered[0]?.hookName).toContain("Write|Edit");
  });

  it("should handle pattern matching with event type prefix", () => {
    const filtered = analyzeHookResponses(mockResponses, "PostToolUse::Write");

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.hookEvent).toBe("PostToolUse");
  });

  it("should return empty array for non-matching hook name", () => {
    const filtered = analyzeHookResponses(
      mockResponses,
      "SessionStart::NonExistent",
    );

    expect(filtered).toHaveLength(0);
  });

  it("should return empty array for empty responses", () => {
    const filtered = analyzeHookResponses([], "PreToolUse::Write");

    expect(filtered).toHaveLength(0);
  });

  it("should match partial hook name when using pattern", () => {
    const responses: HookResponseCapture[] = [
      {
        hookName: "mcp__github__create_issue",
        hookEvent: "PreToolUse",
        stdout: "MCP hook",
        stderr: "",
        timestamp: Date.now(),
      },
    ];

    const filtered = analyzeHookResponses(responses, "PreToolUse::mcp");

    expect(filtered).toHaveLength(1);
  });
});
