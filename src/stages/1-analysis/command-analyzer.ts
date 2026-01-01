/**
 * Command analyzer.
 * Parses command markdown files and extracts frontmatter.
 */

import { parseFrontmatter, readText, basename } from "../../utils/index.js";

import { getFullName } from "./path-resolver.js";

import type { CommandComponent } from "../../types/index.js";

/**
 * Analyze a command file.
 *
 * @param commandPath - Path to command markdown file
 * @param namespace - Namespace from directory structure
 * @param pluginPrefix - Plugin name prefix for invocation
 * @returns Parsed command component
 */
export function analyzeCommand(
  commandPath: string,
  namespace: string,
  pluginPrefix: string,
): CommandComponent {
  const content = readText(commandPath);
  const { frontmatter, body } = parseFrontmatter(content);

  // Get command name from frontmatter or filename (without .md)
  const name =
    typeof frontmatter["name"] === "string"
      ? frontmatter["name"]
      : basename(commandPath, ".md");

  // Get description from frontmatter or body
  const description =
    typeof frontmatter["description"] === "string"
      ? frontmatter["description"]
      : body.slice(0, 500);

  // Get argument hint (note: uses hyphenated 'argument-hint')
  const argumentHint =
    typeof frontmatter["argument-hint"] === "string"
      ? frontmatter["argument-hint"]
      : undefined;

  // Get allowed tools (note: uses hyphenated 'allowed-tools')
  let allowedTools: string[] | undefined;
  const rawAllowedTools = frontmatter["allowed-tools"];
  if (typeof rawAllowedTools === "string") {
    allowedTools = rawAllowedTools.split(",").map((t) => t.trim());
  } else if (Array.isArray(rawAllowedTools)) {
    allowedTools = rawAllowedTools.filter(
      (t): t is string => typeof t === "string",
    );
  }

  // Get disable-model-invocation flag
  const disableModelInvocation =
    frontmatter["disable-model-invocation"] === true;

  return {
    name,
    path: commandPath,
    plugin_prefix: pluginPrefix,
    namespace,
    fullName: getFullName(name, namespace),
    description,
    argument_hint: argumentHint,
    allowed_tools: allowedTools,
    disable_model_invocation: disableModelInvocation,
  };
}

/**
 * Analyze multiple commands.
 *
 * @param commandFiles - Array of command file info
 * @param pluginPrefix - Plugin name prefix for invocation
 * @returns Array of parsed command components
 */
export function analyzeCommands(
  commandFiles: { path: string; namespace: string }[],
  pluginPrefix: string,
): CommandComponent[] {
  return commandFiles.map((file) =>
    analyzeCommand(file.path, file.namespace, pluginPrefix),
  );
}

/**
 * Get the slash command invocation string.
 *
 * @param command - Parsed command component
 * @returns Slash command invocation (e.g., "/plugin-name:command-name")
 */
export function getCommandInvocation(command: CommandComponent): string {
  const prefix = command.plugin_prefix;
  const fullName = command.fullName;

  // Format: /plugin:namespace/command or /plugin:command
  return `/${prefix}:${fullName}`;
}

/**
 * Get expected arguments from argument hint.
 *
 * @param argumentHint - Argument hint string (e.g., "[filename] [options]")
 * @returns Array of expected argument names
 */
export function parseArgumentHint(argumentHint: string | undefined): string[] {
  if (!argumentHint) {
    return [];
  }

  // Match [arg] or <arg> patterns
  const argPattern = /[<[]([^\]>]+)[>\]]/g;
  const args: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = argPattern.exec(argumentHint)) !== null) {
    const arg = match[1];
    if (arg) {
      args.push(arg);
    }
  }

  return args;
}
