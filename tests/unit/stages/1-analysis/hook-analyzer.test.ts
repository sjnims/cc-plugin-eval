import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  analyzeHooks,
  analyzeHook,
  parseMatcherToTools,
  inferExpectedBehavior,
} from "../../../../src/stages/1-analysis/hook-analyzer.js";

const fixturesPath = path.resolve(process.cwd(), "tests/fixtures");
const validPluginPath = path.join(fixturesPath, "valid-plugin");
const hooksPath = path.join(validPluginPath, "hooks", "hooks.json");

describe("parseMatcherToTools", () => {
  it("parses wildcard matcher", () => {
    const tools = parseMatcherToTools("*");
    expect(tools).toEqual(["*"]);
  });

  it("parses single tool matcher", () => {
    const tools = parseMatcherToTools("Write");
    expect(tools).toEqual(["Write"]);
  });

  it("parses alternation matcher", () => {
    const tools = parseMatcherToTools("Write|Edit");
    expect(tools).toEqual(["Write", "Edit"]);
  });

  it("parses MCP tool pattern", () => {
    const tools = parseMatcherToTools("mcp__github__create_issue");
    expect(tools).toEqual(["mcp__github__create_issue"]);
  });

  it("parses regex pattern with MCP prefix", () => {
    const tools = parseMatcherToTools("mcp__.*__delete.*");
    expect(tools).toContain("mcp__*__delete*");
  });
});

describe("inferExpectedBehavior", () => {
  it("infers block behavior from deny keywords", () => {
    const behavior = inferExpectedBehavior("If unsafe, return 'deny'");
    expect(behavior).toBe("block");
  });

  it("infers allow behavior from approve keywords", () => {
    const behavior = inferExpectedBehavior("Return 'approve' if safe");
    expect(behavior).toBe("allow");
  });

  it("infers modify behavior from update keywords", () => {
    const behavior = inferExpectedBehavior("Modify the input before execution");
    expect(behavior).toBe("modify");
  });

  it("infers log behavior from log keywords", () => {
    const behavior = inferExpectedBehavior("Log the operation for audit");
    expect(behavior).toBe("log");
  });

  it("infers context behavior from context keywords", () => {
    const behavior = inferExpectedBehavior("Load project context");
    expect(behavior).toBe("context");
  });

  it("returns unknown for ambiguous content", () => {
    const behavior = inferExpectedBehavior("Do something");
    expect(behavior).toBe("unknown");
  });
});

describe("analyzeHook", () => {
  it("parses PreToolUse hook with prompt type", () => {
    const hooks = analyzeHook(hooksPath);
    const preToolUseHooks = hooks.filter((h) => h.eventType === "PreToolUse");

    expect(preToolUseHooks.length).toBeGreaterThan(0);
    const writeHook = preToolUseHooks.find((h) => h.matcher === "Write|Edit");
    expect(writeHook).toBeDefined();
    expect(writeHook?.actions[0]?.type).toBe("prompt");
    expect(writeHook?.matchingTools).toEqual(["Write", "Edit"]);
  });

  it("parses PreToolUse hook with command type", () => {
    const hooks = analyzeHook(hooksPath);
    const bashHook = hooks.find(
      (h) => h.eventType === "PreToolUse" && h.matcher === "Bash",
    );

    expect(bashHook).toBeDefined();
    expect(bashHook?.actions[0]?.type).toBe("command");
    expect(bashHook?.actions[0]?.command).toContain("validate-bash.sh");
  });

  it("parses Stop hook with wildcard matcher", () => {
    const hooks = analyzeHook(hooksPath);
    const stopHooks = hooks.filter((h) => h.eventType === "Stop");

    expect(stopHooks).toHaveLength(1);
    expect(stopHooks[0]?.matcher).toBe("*");
    expect(stopHooks[0]?.matchingTools).toEqual(["*"]);
  });

  it("parses SessionStart hook", () => {
    const hooks = analyzeHook(hooksPath);
    const sessionHooks = hooks.filter((h) => h.eventType === "SessionStart");

    expect(sessionHooks).toHaveLength(1);
    expect(sessionHooks[0]?.actions[0]?.type).toBe("command");
  });

  it("generates unique names for each hook", () => {
    const hooks = analyzeHook(hooksPath);
    const names = hooks.map((h) => h.name);
    const uniqueNames = new Set(names);

    expect(uniqueNames.size).toBe(names.length);
  });

  it("infers expected behavior from hook content", () => {
    const hooks = analyzeHook(hooksPath);
    const writeHook = hooks.find(
      (h) => h.eventType === "PreToolUse" && h.matcher === "Write|Edit",
    );

    // The fixture contains both "approve" and "deny" - "deny" is checked first, so infers "block"
    expect(writeHook?.expectedBehavior).toBe("block");
  });
});

describe("analyzeHooks", () => {
  it("returns empty array for non-existent file", () => {
    const hooks = analyzeHooks("/non/existent/hooks.json");
    expect(hooks).toEqual([]);
  });

  it("analyzes hooks from valid path", () => {
    const hooks = analyzeHooks(hooksPath);

    expect(hooks.length).toBeGreaterThan(0);
    expect(hooks.every((h) => h.path === hooksPath)).toBe(true);
  });

  it("includes hooks from all event types", () => {
    const hooks = analyzeHooks(hooksPath);
    const eventTypes = new Set(hooks.map((h) => h.eventType));

    expect(eventTypes.has("PreToolUse")).toBe(true);
    expect(eventTypes.has("PostToolUse")).toBe(true);
    expect(eventTypes.has("Stop")).toBe(true);
    expect(eventTypes.has("SessionStart")).toBe(true);
    expect(eventTypes.has("UserPromptSubmit")).toBe(true);
  });
});
