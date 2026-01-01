/**
 * Plugin manifest parser.
 * Parses plugin.json and discovers component files.
 */

import { readFileSync } from "node:fs";

import { readJson } from "../../utils/index.js";

import type { PluginManifest } from "../../types/index.js";

/**
 * Parse a plugin manifest file.
 *
 * @param manifestPath - Path to plugin.json
 * @returns Parsed manifest
 * @throws Error if manifest is invalid
 */
export function parsePluginManifest(manifestPath: string): PluginManifest {
  const rawData = readJson(manifestPath);

  // Type guard for object
  if (typeof rawData !== "object" || rawData === null) {
    throw new Error("Plugin manifest must be a JSON object");
  }

  const raw = rawData as Record<string, unknown>;

  // Validate required fields
  if (typeof raw["name"] !== "string" || !raw["name"]) {
    throw new Error('Plugin manifest missing required "name" field');
  }

  const manifest: PluginManifest = {
    name: raw["name"],
  };

  // Optional fields
  if (typeof raw["version"] === "string") {
    manifest.version = raw["version"];
  }

  if (typeof raw["description"] === "string") {
    manifest.description = raw["description"];
  }

  // Component paths (can be string or array)
  if (raw["commands"] !== undefined) {
    manifest.commands = parsePathField(raw["commands"]);
  }

  if (raw["agents"] !== undefined) {
    manifest.agents = parsePathField(raw["agents"]);
  }

  if (typeof raw["hooks"] === "string") {
    manifest.hooks = raw["hooks"];
  }

  if (typeof raw["mcpServers"] === "string") {
    manifest.mcpServers = raw["mcpServers"];
  }

  return manifest;
}

/**
 * Parse a path field that can be string or array.
 *
 * @param value - Raw value from manifest
 * @returns String or array of strings
 */
function parsePathField(value: unknown): string | string[] {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value;
  }

  throw new Error("Invalid path field: must be string or array of strings");
}

/**
 * Read raw plugin manifest without validation.
 *
 * @param manifestPath - Path to plugin.json
 * @returns Raw manifest content
 */
export function readRawManifest(manifestPath: string): unknown {
  const content = readFileSync(manifestPath, "utf-8");
  return JSON.parse(content);
}
