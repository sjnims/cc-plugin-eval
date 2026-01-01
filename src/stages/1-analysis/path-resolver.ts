/**
 * Path resolver for plugin components.
 * Handles custom component paths from plugin.json.
 * Custom paths supplement defaults (don't replace them).
 */

import { existsSync } from "node:fs";
import path from "node:path";

import { glob } from "glob";

import type { PluginManifest, ResolvedPaths } from "../../types/index.js";

/**
 * Resolve component discovery paths from plugin.json.
 * Custom paths supplement defaults (don't replace them).
 *
 * @param pluginRoot - Root directory of the plugin
 * @param manifest - Parsed plugin manifest
 * @returns Resolved paths for each component type
 */
export function resolveComponentPaths(
  pluginRoot: string,
  manifest: PluginManifest,
): ResolvedPaths {
  const normalize = (p: string): string => path.resolve(pluginRoot, p);
  const toArray = (v: string | string[] | undefined): string[] => {
    if (!v) {
      return [];
    }
    return Array.isArray(v) ? v : [v];
  };

  // Default paths
  const defaultCommands = [path.join(pluginRoot, "commands")];
  const defaultAgents = [path.join(pluginRoot, "agents")];
  const defaultSkills = [path.join(pluginRoot, "skills")];

  // Custom paths supplement defaults
  const customCommands = toArray(manifest.commands).map(normalize);
  const customAgents = toArray(manifest.agents).map(normalize);

  return {
    commands: [...defaultCommands, ...customCommands].filter((p) =>
      existsSync(p),
    ),
    agents: [...defaultAgents, ...customAgents].filter((p) => existsSync(p)),
    skills: defaultSkills.filter((p) => existsSync(p)),
    hooks: manifest.hooks ? normalize(manifest.hooks) : null,
    mcpServers: manifest.mcpServers ? normalize(manifest.mcpServers) : null,
  };
}

/**
 * Discover skill directories.
 *
 * @param skillPaths - Paths to search for skills
 * @returns Array of skill directory paths
 */
export async function discoverSkillDirs(
  skillPaths: string[],
): Promise<string[]> {
  const skillDirs: string[] = [];

  for (const basePath of skillPaths) {
    // Look for directories containing SKILL.md
    const pattern = path.join(basePath, "*", "SKILL.md");
    const files = await glob(pattern, { absolute: true });

    for (const file of files) {
      skillDirs.push(path.dirname(file));
    }
  }

  return skillDirs;
}

/**
 * Discover agent files.
 *
 * @param agentPaths - Paths to search for agents
 * @returns Array of agent file paths
 */
export async function discoverAgentFiles(
  agentPaths: string[],
): Promise<string[]> {
  const agentFiles: string[] = [];

  for (const basePath of agentPaths) {
    // Look for markdown files (agents can be nested)
    const pattern = path.join(basePath, "**", "*.md");
    const files = await glob(pattern, { absolute: true });
    agentFiles.push(...files);
  }

  return agentFiles;
}

/**
 * Discover command files with namespace preservation.
 *
 * @param commandPaths - Paths to search for commands
 * @returns Array of command file info (path and namespace)
 */
export async function discoverCommandFiles(
  commandPaths: string[],
): Promise<{ path: string; namespace: string; basePath: string }[]> {
  const commands: { path: string; namespace: string; basePath: string }[] = [];

  for (const basePath of commandPaths) {
    // Look for markdown files (commands can be nested for namespacing)
    const pattern = path.join(basePath, "**", "*.md");
    const files = await glob(pattern, { absolute: true });

    for (const file of files) {
      const relativePath = path.relative(basePath, file);
      const namespace = path.dirname(relativePath);

      commands.push({
        path: file,
        namespace: namespace === "." ? "" : namespace,
        basePath,
      });
    }
  }

  return commands;
}

/**
 * Get the full component name with namespace.
 *
 * @param name - Base component name
 * @param namespace - Namespace (empty string if none)
 * @returns Full name with namespace if present
 */
export function getFullName(name: string, namespace: string): string {
  return namespace ? `${namespace}/${name}` : name;
}
