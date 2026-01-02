/**
 * Preflight validation for plugins.
 * Catches errors before SDK initialization with actionable suggestions.
 */

import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import type {
  PreflightError,
  PreflightResult,
  PreflightWarning,
} from "../../types/index.js";

/**
 * Validate plugin before SDK initialization.
 * Catches common errors early with actionable suggestions.
 *
 * Run this BEFORE calling verifyPluginLoad() to avoid cryptic SDK errors.
 *
 * @param pluginPath - Path to the plugin directory
 * @returns Preflight validation result
 */
export function preflightCheck(pluginPath: string): PreflightResult {
  const errors: PreflightError[] = [];
  const warnings: PreflightWarning[] = [];
  let pluginName: string | null = null;

  const absolutePath = path.resolve(pluginPath);
  let resolvedPath = absolutePath;
  const manifestPath = path.join(absolutePath, ".claude-plugin", "plugin.json");

  // 1. Verify plugin path exists
  if (!existsSync(absolutePath)) {
    errors.push({
      code: "PATH_NOT_FOUND",
      message: `Plugin path does not exist: ${absolutePath}`,
      suggestion:
        "Check the path in your config. Use absolute path or path relative to cwd.",
    });
    return {
      valid: false,
      pluginPath: absolutePath,
      resolvedPath,
      manifestPath,
      pluginName,
      errors,
      warnings,
    };
  }

  // 2. Resolve symlinks and warn if path is a symlink
  try {
    const stats = lstatSync(absolutePath);
    if (stats.isSymbolicLink()) {
      resolvedPath = realpathSync(absolutePath);
      warnings.push({
        code: "SYMLINK_RESOLVED",
        message: `Plugin path is a symlink: ${absolutePath} -> ${resolvedPath}`,
      });
    }
  } catch (err) {
    errors.push({
      code: "PATH_RESOLUTION_FAILED",
      message: `Could not resolve real path: ${err instanceof Error ? err.message : String(err)}`,
      suggestion: "Check that the symlink target exists and is accessible.",
    });
    return {
      valid: false,
      pluginPath: absolutePath,
      resolvedPath,
      manifestPath,
      pluginName,
      errors,
      warnings,
    };
  }

  // Use resolved path for remaining checks
  const resolvedManifestPath = path.join(
    resolvedPath,
    ".claude-plugin",
    "plugin.json",
  );

  // 3. Verify plugin.json exists
  if (!existsSync(resolvedManifestPath)) {
    errors.push({
      code: "MANIFEST_NOT_FOUND",
      message: `Plugin manifest not found: ${resolvedManifestPath}`,
      suggestion:
        'Create .claude-plugin/plugin.json with at minimum: { "name": "your-plugin-name" }',
    });
    return {
      valid: false,
      pluginPath: absolutePath,
      resolvedPath,
      manifestPath: resolvedManifestPath,
      pluginName,
      errors,
      warnings,
    };
  }

  // 4. Verify manifest is valid JSON
  let manifest: Record<string, unknown>;
  try {
    const content = readFileSync(resolvedManifestPath, "utf-8");
    manifest = JSON.parse(content) as Record<string, unknown>;
  } catch (err) {
    errors.push({
      code: "MANIFEST_PARSE_ERROR",
      message: `Invalid JSON in plugin.json: ${err instanceof Error ? err.message : String(err)}`,
      suggestion:
        "Validate your JSON syntax. Common issues: trailing commas, missing quotes.",
    });
    return {
      valid: false,
      pluginPath: absolutePath,
      resolvedPath,
      manifestPath: resolvedManifestPath,
      pluginName,
      errors,
      warnings,
    };
  }

  // 5. Validate required fields
  if (typeof manifest["name"] !== "string" || !manifest["name"]) {
    errors.push({
      code: "MANIFEST_INVALID",
      message: 'Plugin manifest missing required "name" field',
      suggestion: 'Add "name": "your-plugin-name" to plugin.json',
    });
  } else {
    pluginName = manifest["name"];

    // Validate name format (kebab-case)
    if (!/^[a-z][a-z0-9-]*$/.test(pluginName)) {
      warnings.push({
        code: "NAME_FORMAT",
        message: `Plugin name "${pluginName}" should be kebab-case (lowercase with hyphens)`,
      });
    }
  }

  // 6. Check for common component directories
  const expectedDirs = ["skills", "agents", "commands"];
  const existingDirs = expectedDirs.filter((dir) =>
    existsSync(path.join(resolvedPath, dir)),
  );

  if (existingDirs.length === 0) {
    warnings.push({
      code: "NO_COMPONENTS",
      message:
        "No standard component directories found (skills/, agents/, commands/)",
    });
  }

  return {
    valid: errors.length === 0,
    pluginPath: absolutePath,
    resolvedPath,
    manifestPath: resolvedManifestPath,
    pluginName,
    errors,
    warnings,
  };
}

/**
 * Format preflight result for console output.
 *
 * @param result - Preflight result
 * @returns Formatted string
 */
export function formatPreflightResult(result: PreflightResult): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push(`✅ Plugin preflight passed: ${result.pluginName ?? "unknown"}`);
  } else {
    lines.push("❌ Plugin preflight check failed:");
    for (const err of result.errors) {
      lines.push(`  [${err.code}] ${err.message}`);
      lines.push(`  💡 ${err.suggestion}`);
    }
  }

  for (const warn of result.warnings) {
    lines.push(`⚠️  [${warn.code}] ${warn.message}`);
  }

  return lines.join("\n");
}
