import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  parsePluginManifest,
  readRawManifest,
} from "../../../../src/stages/1-analysis/plugin-parser.js";

const fixturesPath = path.resolve(process.cwd(), "tests/fixtures");
const validPluginPath = path.join(fixturesPath, "valid-plugin");
const tempFixturePath = path.join(fixturesPath, "temp-parser-test");

describe("parsePluginManifest", () => {
  beforeAll(() => {
    // Create temp fixture directory
    mkdirSync(path.join(tempFixturePath, ".claude-plugin"), {
      recursive: true,
    });
  });

  afterAll(() => {
    // Cleanup temp fixture
    rmSync(tempFixturePath, { recursive: true, force: true });
  });

  it("parses valid manifest with required fields", () => {
    const manifestPath = path.join(
      validPluginPath,
      ".claude-plugin",
      "plugin.json",
    );
    const manifest = parsePluginManifest(manifestPath);

    expect(manifest.name).toBe("test-plugin");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.description).toBe(
      "Fixture plugin for testing cc-plugin-eval",
    );
  });

  it("throws error when name field is missing", () => {
    const manifestPath = path.join(
      fixturesPath,
      "invalid-plugin",
      ".claude-plugin",
      "plugin.json",
    );

    expect(() => parsePluginManifest(manifestPath)).toThrow(
      'missing required "name" field',
    );
  });

  it("parses commands as string", () => {
    const tempManifest = path.join(
      tempFixturePath,
      ".claude-plugin",
      "plugin.json",
    );
    writeFileSync(
      tempManifest,
      JSON.stringify({
        name: "test",
        commands: "./custom-commands",
      }),
    );

    const manifest = parsePluginManifest(tempManifest);
    expect(manifest.commands).toBe("./custom-commands");
  });

  it("parses commands as array", () => {
    const tempManifest = path.join(
      tempFixturePath,
      ".claude-plugin",
      "plugin.json",
    );
    writeFileSync(
      tempManifest,
      JSON.stringify({
        name: "test",
        commands: ["./commands", "./extra-commands"],
      }),
    );

    const manifest = parsePluginManifest(tempManifest);
    expect(manifest.commands).toEqual(["./commands", "./extra-commands"]);
  });

  it("parses agents as string", () => {
    const tempManifest = path.join(
      tempFixturePath,
      ".claude-plugin",
      "plugin.json",
    );
    writeFileSync(
      tempManifest,
      JSON.stringify({
        name: "test",
        agents: "./custom-agents",
      }),
    );

    const manifest = parsePluginManifest(tempManifest);
    expect(manifest.agents).toBe("./custom-agents");
  });

  it("parses agents as array", () => {
    const tempManifest = path.join(
      tempFixturePath,
      ".claude-plugin",
      "plugin.json",
    );
    writeFileSync(
      tempManifest,
      JSON.stringify({
        name: "test",
        agents: ["./agents", "./more-agents"],
      }),
    );

    const manifest = parsePluginManifest(tempManifest);
    expect(manifest.agents).toEqual(["./agents", "./more-agents"]);
  });

  it("parses hooks path", () => {
    const tempManifest = path.join(
      tempFixturePath,
      ".claude-plugin",
      "plugin.json",
    );
    writeFileSync(
      tempManifest,
      JSON.stringify({
        name: "test",
        hooks: "./hooks.json",
      }),
    );

    const manifest = parsePluginManifest(tempManifest);
    expect(manifest.hooks).toBe("./hooks.json");
  });

  it("parses mcpServers path", () => {
    const tempManifest = path.join(
      tempFixturePath,
      ".claude-plugin",
      "plugin.json",
    );
    writeFileSync(
      tempManifest,
      JSON.stringify({
        name: "test",
        mcpServers: "./.mcp.json",
      }),
    );

    const manifest = parsePluginManifest(tempManifest);
    expect(manifest.mcpServers).toBe("./.mcp.json");
  });

  it("throws error for non-object manifest", () => {
    const tempManifest = path.join(
      tempFixturePath,
      ".claude-plugin",
      "plugin.json",
    );
    writeFileSync(tempManifest, JSON.stringify("just a string"));

    expect(() => parsePluginManifest(tempManifest)).toThrow(
      "must be a JSON object",
    );
  });

  it("throws error for null manifest", () => {
    const tempManifest = path.join(
      tempFixturePath,
      ".claude-plugin",
      "plugin.json",
    );
    writeFileSync(tempManifest, "null");

    expect(() => parsePluginManifest(tempManifest)).toThrow(
      "must be a JSON object",
    );
  });

  it("throws error for invalid path field type", () => {
    const tempManifest = path.join(
      tempFixturePath,
      ".claude-plugin",
      "plugin.json",
    );
    writeFileSync(
      tempManifest,
      JSON.stringify({
        name: "test",
        commands: 123, // Invalid: should be string or array
      }),
    );

    expect(() => parsePluginManifest(tempManifest)).toThrow(
      "must be string or array",
    );
  });

  it("throws error for mixed array types", () => {
    const tempManifest = path.join(
      tempFixturePath,
      ".claude-plugin",
      "plugin.json",
    );
    writeFileSync(
      tempManifest,
      JSON.stringify({
        name: "test",
        commands: ["./valid", 123], // Invalid: mixed types
      }),
    );

    expect(() => parsePluginManifest(tempManifest)).toThrow(
      "must be string or array",
    );
  });

  it("handles empty name string", () => {
    const tempManifest = path.join(
      tempFixturePath,
      ".claude-plugin",
      "plugin.json",
    );
    writeFileSync(
      tempManifest,
      JSON.stringify({
        name: "",
      }),
    );

    expect(() => parsePluginManifest(tempManifest)).toThrow(
      'missing required "name" field',
    );
  });
});

describe("readRawManifest", () => {
  it("reads manifest as raw JSON", () => {
    const manifestPath = path.join(
      validPluginPath,
      ".claude-plugin",
      "plugin.json",
    );
    const raw = readRawManifest(manifestPath);

    expect(raw).toEqual({
      name: "test-plugin",
      version: "1.0.0",
      description: "Fixture plugin for testing cc-plugin-eval",
    });
  });

  it("throws error for malformed JSON", () => {
    const manifestPath = path.join(
      fixturesPath,
      "malformed-plugin",
      ".claude-plugin",
      "plugin.json",
    );

    expect(() => readRawManifest(manifestPath)).toThrow();
  });

  it("throws error for non-existent file", () => {
    expect(() => readRawManifest("/non/existent/file.json")).toThrow();
  });
});
