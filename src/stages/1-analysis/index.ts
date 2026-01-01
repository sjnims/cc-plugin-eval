/**
 * Stage 1: Plugin Analysis
 *
 * Parses plugin structure and understands triggering conditions.
 */

import { logger } from "../../utils/index.js";

import { analyzeAgents } from "./agent-analyzer.js";
import {
  analyzeCommands,
  getCommandInvocation,
  parseArgumentHint,
} from "./command-analyzer.js";
import {
  discoverAgentFiles,
  discoverCommandFiles,
  discoverSkillDirs,
  resolveComponentPaths,
} from "./path-resolver.js";
import { parsePluginManifest } from "./plugin-parser.js";
import { formatPreflightResult, preflightCheck } from "./preflight.js";
import { analyzeSkills } from "./skill-analyzer.js";

import type {
  AnalysisOutput,
  EvalConfig,
  PluginLoadResult,
  AgentTriggerInfo,
  CommandTriggerInfo,
  SkillTriggerInfo,
} from "../../types/index.js";

/**
 * Run Stage 1: Plugin Analysis.
 *
 * @param config - Evaluation configuration
 * @returns Analysis output with parsed components
 * @throws Error if preflight check fails
 */
export async function runAnalysis(config: EvalConfig): Promise<AnalysisOutput> {
  logger.stageHeader("ANALYSIS");

  // 1. Preflight check
  const preflight = preflightCheck(config.plugin.path);
  logger.info(formatPreflightResult(preflight));

  if (!preflight.valid) {
    throw new Error("Plugin preflight check failed");
  }

  const pluginName = preflight.pluginName ?? "unknown";

  // 2. Parse manifest
  logger.info(`Parsing plugin manifest: ${preflight.manifestPath}`);
  const manifest = parsePluginManifest(preflight.manifestPath);

  // 3. Resolve component paths
  const paths = resolveComponentPaths(preflight.pluginPath, manifest);
  logger.info(
    `Resolved paths: skills=${String(paths.skills.length)}, agents=${String(paths.agents.length)}, commands=${String(paths.commands.length)}`,
  );

  // 4. Discover components
  const skillDirs = await discoverSkillDirs(paths.skills);
  const agentFiles = await discoverAgentFiles(paths.agents);
  const commandFiles = await discoverCommandFiles(paths.commands);

  logger.info(
    `Discovered: ${String(skillDirs.length)} skills, ${String(agentFiles.length)} agents, ${String(commandFiles.length)} commands`,
  );

  // 5. Analyze components based on scope
  const skills = config.scope.skills ? analyzeSkills(skillDirs) : [];
  const agents = config.scope.agents ? analyzeAgents(agentFiles) : [];
  const commands = config.scope.commands
    ? analyzeCommands(commandFiles, pluginName)
    : [];

  logger.info(
    `Analyzed: ${String(skills.length)} skills, ${String(agents.length)} agents, ${String(commands.length)} commands`,
  );

  // 6. Build trigger understanding
  const skillTriggers: Record<string, SkillTriggerInfo> = {};
  for (const skill of skills) {
    skillTriggers[skill.name] = {
      triggers: skill.trigger_phrases,
      description: skill.description,
    };
  }

  const agentTriggers: Record<string, AgentTriggerInfo> = {};
  for (const agent of agents) {
    agentTriggers[agent.name] = {
      examples: agent.example_triggers,
      description: agent.description,
    };
  }

  const commandTriggers: Record<string, CommandTriggerInfo> = {};
  for (const command of commands) {
    commandTriggers[command.name] = {
      invocation: getCommandInvocation(command),
      arguments: parseArgumentHint(command.argument_hint),
    };
  }

  // 7. Create plugin load result (simulated for now, real SDK integration in Stage 3)
  const pluginLoadResult: PluginLoadResult = {
    loaded: true,
    plugin_name: pluginName,
    plugin_path: preflight.pluginPath,
    registered_tools: [],
    registered_commands: commands.map((c) => c.name),
    registered_skills: skills.map((s) => s.name),
    registered_agents: agents.map((a) => a.name),
    mcp_servers: [],
    session_id: `analysis-${String(Date.now())}`,
    diagnostics: {
      manifest_found: true,
      manifest_valid: true,
      components_discovered: {
        skills: skills.length,
        agents: agents.length,
        commands: commands.length,
        hooks: paths.hooks !== null,
        mcp_servers: paths.mcpServers !== null ? 1 : 0,
      },
      load_duration_ms: 0,
    },
  };

  const output: AnalysisOutput = {
    plugin_name: pluginName,
    plugin_load_result: pluginLoadResult,
    components: {
      skills,
      agents,
      commands,
    },
    trigger_understanding: {
      skills: skillTriggers,
      agents: agentTriggers,
      commands: commandTriggers,
    },
  };

  logger.success(`Analysis complete for plugin: ${pluginName}`);

  return output;
}

// Re-export submodules
export { preflightCheck, formatPreflightResult } from "./preflight.js";
export { parsePluginManifest } from "./plugin-parser.js";
export {
  resolveComponentPaths,
  discoverSkillDirs,
  discoverAgentFiles,
  discoverCommandFiles,
} from "./path-resolver.js";
export {
  analyzeSkill,
  analyzeSkills,
  extractTriggerPhrases,
  extractSemanticIntents,
} from "./skill-analyzer.js";
export {
  analyzeAgent,
  analyzeAgents,
  extractAgentExamples,
} from "./agent-analyzer.js";
export {
  analyzeCommand,
  analyzeCommands,
  getCommandInvocation,
  parseArgumentHint,
} from "./command-analyzer.js";
