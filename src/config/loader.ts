/**
 * Configuration loader with YAML/JSON support and Zod validation.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import { createDefaultConfig } from "./defaults.js";
import { EvalConfigSchema } from "./schema.js";

import type { EvalConfig } from "../types/index.js";
import type { ZodError } from "zod";

/**
 * Configuration load error.
 */
export class ConfigLoadError extends Error {
  override readonly cause?: Error | undefined;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "ConfigLoadError";
    this.cause = cause;
  }
}

/**
 * Configuration validation error.
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly zodError: ZodError,
  ) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

/**
 * Load configuration from YAML or JSON file.
 *
 * @param configPath - Path to configuration file
 * @returns Validated configuration
 * @throws ConfigLoadError if file cannot be loaded
 * @throws ConfigValidationError if validation fails
 */
export function loadConfig(configPath: string): EvalConfig {
  const absolutePath = path.resolve(configPath);

  // Check file exists
  if (!existsSync(absolutePath)) {
    throw new ConfigLoadError(`Configuration file not found: ${absolutePath}`);
  }

  // Read file content
  let content: string;
  try {
    content = readFileSync(absolutePath, "utf-8");
  } catch (err) {
    throw new ConfigLoadError(
      `Failed to read configuration file: ${absolutePath}`,
      err instanceof Error ? err : undefined,
    );
  }

  // Parse based on extension
  let rawConfig: unknown;
  const ext = path.extname(absolutePath).toLowerCase();

  try {
    if (ext === ".yaml" || ext === ".yml") {
      rawConfig = parseYaml(content);
    } else if (ext === ".json") {
      rawConfig = JSON.parse(content);
    } else {
      // Try YAML first, fall back to JSON
      try {
        rawConfig = parseYaml(content);
      } catch {
        rawConfig = JSON.parse(content);
      }
    }
  } catch (err) {
    throw new ConfigLoadError(
      `Failed to parse configuration file: ${absolutePath}`,
      err instanceof Error ? err : undefined,
    );
  }

  // Validate with Zod
  return validateConfig(rawConfig);
}

/**
 * Validate raw configuration object.
 *
 * @param rawConfig - Raw configuration object
 * @returns Validated configuration
 * @throws ConfigValidationError if validation fails
 */
export function validateConfig(rawConfig: unknown): EvalConfig {
  const result = EvalConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new ConfigValidationError(
      `Configuration validation failed:\n${issues}`,
      result.error,
    );
  }

  return result.data as EvalConfig;
}

/**
 * Load configuration with CLI overrides.
 *
 * @param configPath - Path to configuration file (optional)
 * @param cliOptions - CLI option overrides
 * @returns Validated configuration
 */
export function loadConfigWithOverrides(
  configPath: string | undefined,
  cliOptions: Partial<CLIOptions>,
): EvalConfig {
  let config: EvalConfig;

  if (configPath) {
    config = loadConfig(configPath);
  } else if (cliOptions.plugin) {
    config = createDefaultConfig(cliOptions.plugin);
  } else {
    throw new ConfigLoadError(
      "Either config file or --plugin path is required",
    );
  }

  // Apply CLI overrides
  return applyOverrides(config, cliOptions);
}

/**
 * CLI options that can override config.
 */
export interface CLIOptions {
  plugin?: string;
  marketplace?: string;
  dryRun?: boolean;
  verbose?: boolean;
  debug?: boolean;
  fast?: boolean;
  failedRun?: string;
  withPlugins?: string[];
  output?: "json" | "yaml" | "junit-xml" | "tap" | undefined;
  estimate?: boolean;
  noBatch?: boolean;
  rewind?: boolean;
  semantic?: boolean;
  samples?: number;
  reps?: number;
}

/**
 * Apply CLI overrides to configuration.
 *
 * @param config - Base configuration
 * @param options - CLI options
 * @returns Configuration with overrides applied
 */
function applyOverrides(
  config: EvalConfig,
  options: Partial<CLIOptions>,
): EvalConfig {
  const result = { ...config };

  if (options.plugin) {
    result.plugin = { ...result.plugin, path: options.plugin };
  }

  if (options.marketplace) {
    result.marketplace = { path: options.marketplace, evaluate_all: true };
  }

  if (options.dryRun !== undefined) {
    result.dry_run = options.dryRun;
  }

  if (options.verbose !== undefined) {
    result.verbose = options.verbose;
  }

  if (options.debug !== undefined) {
    result.debug = options.debug;
  }

  if (options.fast !== undefined || options.failedRun) {
    result.fast_mode = {
      enabled: options.fast ?? true,
      failed_run_id: options.failedRun,
    };
  }

  if (options.withPlugins) {
    result.execution = {
      ...result.execution,
      additional_plugins: options.withPlugins,
    };
  }

  if (options.output) {
    result.output = { ...result.output, format: options.output };
  }

  if (options.estimate !== undefined) {
    result.estimate_costs = options.estimate;
  }

  if (options.noBatch !== undefined) {
    result.force_synchronous = options.noBatch;
  }

  if (options.rewind !== undefined) {
    result.rewind_file_changes = options.rewind;
  }

  if (options.semantic !== undefined) {
    result.generation = {
      ...result.generation,
      semantic_variations: options.semantic,
    };
  }

  if (options.samples !== undefined) {
    result.evaluation = {
      ...result.evaluation,
      num_samples: options.samples,
    };
  }

  if (options.reps !== undefined) {
    result.execution = {
      ...result.execution,
      num_reps: options.reps,
    };
  }

  return result;
}

/**
 * Resolve short model names to full model IDs.
 *
 * @param modelName - Short or full model name
 * @returns Full model ID
 */
export function resolveModelId(modelName: string): string {
  const modelAliases: Record<string, string> = {
    opus: "claude-opus-4-5-20251101",
    "claude-opus-4.5": "claude-opus-4-5-20251101",
    sonnet: "claude-sonnet-4-5-20250929",
    "claude-sonnet-4.5": "claude-sonnet-4-5-20250929",
    "claude-sonnet-4": "claude-sonnet-4-20250514",
    haiku: "claude-haiku-3-5-20250929",
    "claude-haiku-3.5": "claude-haiku-3-5-20250929",
  };

  return modelAliases[modelName] ?? modelName;
}
