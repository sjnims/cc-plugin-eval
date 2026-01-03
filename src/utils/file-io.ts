/**
 * File I/O utilities.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

/**
 * Ensure a directory exists, creating it if necessary.
 *
 * @param dirPath - Path to directory
 */
export function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Read a JSON file.
 *
 * @param filePath - Path to file
 * @returns Parsed JSON content
 * @throws Error if file doesn't exist or isn't valid JSON
 */
export function readJson(filePath: string): unknown {
  const content = readFileSync(filePath, "utf-8");
  return JSON.parse(content) as unknown;
}

/**
 * Write a JSON file.
 *
 * @param filePath - Path to file
 * @param data - Data to write
 * @param pretty - Whether to format with indentation (default: true)
 */
export function writeJson(
  filePath: string,
  data: unknown,
  pretty = true,
): void {
  ensureDir(path.dirname(filePath));
  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  writeFileSync(filePath, content, "utf-8");
}

/**
 * Read a YAML file.
 *
 * @param filePath - Path to file
 * @returns Parsed YAML content
 * @throws Error if file doesn't exist or isn't valid YAML
 */
export function readYaml(filePath: string): unknown {
  const content = readFileSync(filePath, "utf-8");
  return parseYaml(content) as unknown;
}

/**
 * Write a YAML file.
 *
 * @param filePath - Path to file
 * @param data - Data to write
 */
export function writeYaml(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  const content = stringifyYaml(data);
  writeFileSync(filePath, content, "utf-8");
}

/**
 * Read a text file.
 *
 * @param filePath - Path to file
 * @returns File content
 */
export function readText(filePath: string): string {
  return readFileSync(filePath, "utf-8");
}

/**
 * Write a text file.
 *
 * @param filePath - Path to file
 * @param content - Content to write
 */
export function writeText(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, content, "utf-8");
}

/**
 * Check if a file exists.
 *
 * @param filePath - Path to file
 * @returns True if file exists
 */
export function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

/**
 * Get the relative path from one path to another.
 *
 * @param from - Source path
 * @param to - Destination path
 * @returns Relative path
 */
export function relativePath(from: string, to: string): string {
  return path.relative(from, to);
}

/**
 * Join path segments.
 *
 * @param segments - Path segments
 * @returns Joined path
 */
export function joinPath(...segments: string[]): string {
  return path.join(...segments);
}

/**
 * Resolve a path to absolute.
 *
 * @param filePath - Path to resolve
 * @returns Absolute path
 */
export function resolvePath(filePath: string): string {
  return path.resolve(filePath);
}

/**
 * Get the directory name from a path.
 *
 * @param filePath - Path
 * @returns Directory name
 */
export function dirname(filePath: string): string {
  return path.dirname(filePath);
}

/**
 * Get the base name from a path.
 *
 * @param filePath - Path
 * @param ext - Optional extension to remove
 * @returns Base name
 */
export function basename(filePath: string, ext?: string): string {
  return path.basename(filePath, ext);
}

/**
 * Get the extension from a path.
 *
 * @param filePath - Path
 * @returns Extension (including dot)
 */
export function extname(filePath: string): string {
  return path.extname(filePath);
}

/**
 * Parse YAML frontmatter from markdown content.
 *
 * @param content - Markdown content with optional frontmatter
 * @returns Parsed frontmatter and body
 */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
  const match = frontmatterRegex.exec(content);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const [, yamlContent, body] = match;

  try {
    const parsed: unknown = parseYaml(yamlContent ?? "");
    // parseYaml returns null for empty content, coalesce to empty object
    const frontmatter =
      parsed !== null && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
    return { frontmatter, body: body ?? "" };
  } catch {
    return { frontmatter: {}, body: content };
  }
}

/**
 * Generate a unique run ID.
 *
 * @param prefix - Optional prefix
 * @returns Unique run ID
 */
export function generateRunId(prefix = "run"): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${String(timestamp)}-${random}`;
}

/**
 * Get the results directory for a run.
 *
 * @param pluginName - Plugin name
 * @param runId - Run ID
 * @returns Results directory path
 */
export function getResultsDir(pluginName: string, runId?: string): string {
  const baseDir = path.join(process.cwd(), "results", pluginName);

  if (runId) {
    return path.join(baseDir, runId);
  }

  return baseDir;
}
