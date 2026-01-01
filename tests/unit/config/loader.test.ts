import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ConfigLoadError,
  ConfigValidationError,
  loadConfig,
  resolveModelId,
  validateConfig,
} from "../../../src/config/loader.js";

const fixturesPath = path.resolve(process.cwd(), "tests/fixtures");

describe("loadConfig", () => {
  it("loads valid YAML configuration", () => {
    const config = loadConfig(path.join(fixturesPath, "test-config.yaml"));

    expect(config.plugin.path).toBe("./tests/fixtures/valid-plugin");
    expect(config.scope.skills).toBe(true);
    expect(config.generation.scenarios_per_component).toBe(2);
  });

  it("throws on missing file", () => {
    expect(() => loadConfig("/non/existent/config.yaml")).toThrow(
      ConfigLoadError,
    );
  });
});

describe("validateConfig", () => {
  it("validates raw configuration object", () => {
    const raw = {
      plugin: { path: "./my-plugin" },
    };

    const config = validateConfig(raw);
    expect(config.plugin.path).toBe("./my-plugin");
  });

  it("throws ConfigValidationError on invalid config", () => {
    const raw = {
      plugin: { path: "" }, // Empty path should fail
    };

    expect(() => validateConfig(raw)).toThrow(ConfigValidationError);
  });

  it("includes field path in error message", () => {
    const raw = {
      plugin: { path: "./plugin" },
      generation: { scenarios_per_component: 100 }, // Out of range
    };

    try {
      validateConfig(raw);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigValidationError);
      expect((err as ConfigValidationError).message).toContain(
        "scenarios_per_component",
      );
    }
  });
});

describe("resolveModelId", () => {
  it("resolves short aliases", () => {
    expect(resolveModelId("opus")).toBe("claude-opus-4-5-20251101");
    expect(resolveModelId("sonnet")).toBe("claude-sonnet-4-5-20250929");
    expect(resolveModelId("haiku")).toBe("claude-haiku-3-5-20250929");
  });

  it("resolves versioned aliases", () => {
    expect(resolveModelId("claude-opus-4.5")).toBe("claude-opus-4-5-20251101");
    expect(resolveModelId("claude-sonnet-4")).toBe("claude-sonnet-4-20250514");
  });

  it("returns unknown model IDs unchanged", () => {
    const customId = "custom-model-id";
    expect(resolveModelId(customId)).toBe(customId);
  });
});

import { loadConfigWithOverrides } from "../../../src/config/loader.js";

describe("loadConfigWithOverrides", () => {
  it("loads config from file and applies overrides", () => {
    const config = loadConfigWithOverrides(
      path.join(fixturesPath, "test-config.yaml"),
      { verbose: true, dryRun: true },
    );

    expect(config.verbose).toBe(true);
    expect(config.dry_run).toBe(true);
    expect(config.plugin.path).toBe("./tests/fixtures/valid-plugin");
  });

  it("creates default config when only plugin path provided", () => {
    const config = loadConfigWithOverrides(undefined, {
      plugin: "./my-plugin",
    });

    expect(config.plugin.path).toBe("./my-plugin");
  });

  it("throws when neither config nor plugin provided", () => {
    expect(() => loadConfigWithOverrides(undefined, {})).toThrow(
      ConfigLoadError,
    );
  });

  it("applies marketplace override", () => {
    const config = loadConfigWithOverrides(
      path.join(fixturesPath, "test-config.yaml"),
      { marketplace: "./my-marketplace" },
    );

    expect(config.marketplace).toEqual({
      path: "./my-marketplace",
      evaluate_all: true,
    });
  });

  it("applies debug override", () => {
    const config = loadConfigWithOverrides(
      path.join(fixturesPath, "test-config.yaml"),
      { debug: true },
    );

    expect(config.debug).toBe(true);
  });

  it("applies fast mode override", () => {
    const config = loadConfigWithOverrides(
      path.join(fixturesPath, "test-config.yaml"),
      { fast: true, failedRun: "run-123" },
    );

    expect(config.fast_mode).toEqual({
      enabled: true,
      failed_run_id: "run-123",
    });
  });

  it("applies withPlugins override", () => {
    const config = loadConfigWithOverrides(
      path.join(fixturesPath, "test-config.yaml"),
      { withPlugins: ["./plugin-a", "./plugin-b"] },
    );

    expect(config.execution.additional_plugins).toEqual([
      "./plugin-a",
      "./plugin-b",
    ]);
  });

  it("applies output format override", () => {
    const config = loadConfigWithOverrides(
      path.join(fixturesPath, "test-config.yaml"),
      { output: "junit-xml" },
    );

    expect(config.output.format).toBe("junit-xml");
  });

  it("applies estimate override", () => {
    const config = loadConfigWithOverrides(
      path.join(fixturesPath, "test-config.yaml"),
      { estimate: true },
    );

    expect(config.estimate_costs).toBe(true);
  });

  it("applies noBatch override", () => {
    const config = loadConfigWithOverrides(
      path.join(fixturesPath, "test-config.yaml"),
      { noBatch: true },
    );

    expect(config.force_synchronous).toBe(true);
  });

  it("applies rewind override", () => {
    const config = loadConfigWithOverrides(
      path.join(fixturesPath, "test-config.yaml"),
      { rewind: true },
    );

    expect(config.rewind_file_changes).toBe(true);
  });

  it("applies semantic override", () => {
    const config = loadConfigWithOverrides(
      path.join(fixturesPath, "test-config.yaml"),
      { semantic: true },
    );

    expect(config.generation.semantic_variations).toBe(true);
  });

  it("applies samples override", () => {
    const config = loadConfigWithOverrides(
      path.join(fixturesPath, "test-config.yaml"),
      { samples: 3 },
    );

    expect(config.evaluation.num_samples).toBe(3);
  });

  it("applies reps override", () => {
    const config = loadConfigWithOverrides(
      path.join(fixturesPath, "test-config.yaml"),
      { reps: 5 },
    );

    expect(config.execution.num_reps).toBe(5);
  });

  it("applies plugin path override", () => {
    const config = loadConfigWithOverrides(
      path.join(fixturesPath, "test-config.yaml"),
      { plugin: "./different-plugin" },
    );

    expect(config.plugin.path).toBe("./different-plugin");
  });
});
