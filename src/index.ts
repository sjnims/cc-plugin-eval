#!/usr/bin/env node
/**
 * cc-plugin-eval CLI entry point.
 *
 * CRITICAL: env.js must be the FIRST import to ensure
 * environment variables are loaded before any other module.
 */
import "./env.js";

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import chalk from "chalk";
import { Command } from "commander";
import YAML from "yaml";

import { loadConfigWithOverrides, type CLIOptions } from "./config/index.js";
import { runAnalysis } from "./stages/1-analysis/index.js";
import { runGeneration } from "./stages/2-generation/index.js";
import { runExecution, consoleProgress } from "./stages/3-execution/index.js";
import { runEvaluation } from "./stages/4-evaluation/index.js";
import {
  createPipelineState,
  loadState,
  findLatestRun,
  updateStateAfterAnalysis,
  updateStateAfterGeneration,
  updateStateAfterExecution,
  updateStateAfterEvaluation,
  updateStateComplete,
  getFailedScenarios,
  canResumeFrom,
  formatState,
  listRuns,
  type PipelineStage,
} from "./state/index.js";
import {
  logger,
  writeJson,
  readJson,
  getResultsDir,
  generateRunId,
} from "./utils/index.js";

import type { EvalMetrics } from "./types/index.js";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Find plugin name by searching results directories for a run ID.
 *
 * @param runId - Run ID to search for
 * @returns Plugin name if found, null otherwise
 */
function findPluginByRunId(runId: string): string | null {
  if (!existsSync("results")) {
    return null;
  }

  const plugins = readdirSync("results");
  for (const plugin of plugins) {
    const runPath = join("results", plugin, runId);
    if (existsSync(runPath)) {
      return plugin;
    }
  }

  return null;
}

/**
 * Find and load pipeline state.
 *
 * @param pluginName - Optional plugin name hint
 * @param runId - Run ID to load
 * @returns Loaded state or null if not found
 */
function findAndLoadState(
  pluginName: string | undefined,
  runId: string,
): ReturnType<typeof loadState> {
  // Try direct load if plugin name provided
  if (pluginName) {
    const state = loadState(pluginName, runId);
    if (state) {
      return state;
    }
  }

  // Search results directories
  const foundPlugin = findPluginByRunId(runId);
  if (foundPlugin) {
    return loadState(foundPlugin, runId);
  }

  return null;
}

// =============================================================================
// Resume Stage Handlers
// =============================================================================

/**
 * Resume from analysis stage (run full pipeline).
 */
async function resumeFromAnalysis(
  initialState: NonNullable<ReturnType<typeof loadState>>,
  config: ReturnType<typeof loadConfigWithOverrides>,
  resultsDir: string,
): Promise<NonNullable<ReturnType<typeof loadState>>> {
  logger.info("Resuming from analysis...");

  const analysis = await runAnalysis(config);
  writeJson(`${resultsDir}/analysis.json`, analysis);

  const generation = await runGeneration(analysis, config);
  writeJson(`${resultsDir}/scenarios.json`, generation.scenarios);

  const execution = await runExecution(
    analysis,
    generation.scenarios,
    config,
    consoleProgress,
  );

  const evaluation = await runEvaluation(
    analysis.plugin_name,
    generation.scenarios,
    execution.results,
    config,
    consoleProgress,
  );

  // Chain state updates
  let currentState = updateStateAfterAnalysis(initialState, analysis);
  currentState = updateStateAfterGeneration(currentState, generation.scenarios);
  currentState = updateStateAfterExecution(currentState, execution.results);
  currentState = updateStateAfterEvaluation(currentState, evaluation.results);
  currentState = updateStateComplete(currentState);

  logger.success("Resume complete!");
  return currentState;
}

/**
 * Resume from generation stage.
 */
async function resumeFromGeneration(
  initialState: NonNullable<ReturnType<typeof loadState>>,
  config: ReturnType<typeof loadConfigWithOverrides>,
  resultsDir: string,
): Promise<NonNullable<ReturnType<typeof loadState>>> {
  logger.info("Resuming from generation...");

  const analysisData = initialState.analysis;
  if (!analysisData) {
    throw new Error("Cannot resume from generation: missing analysis data");
  }

  const generation = await runGeneration(analysisData, config);
  writeJson(`${resultsDir}/scenarios.json`, generation.scenarios);

  const execution = await runExecution(
    analysisData,
    generation.scenarios,
    config,
    consoleProgress,
  );

  const evaluation = await runEvaluation(
    analysisData.plugin_name,
    generation.scenarios,
    execution.results,
    config,
    consoleProgress,
  );

  // Chain state updates
  let currentState = updateStateAfterGeneration(
    initialState,
    generation.scenarios,
  );
  currentState = updateStateAfterExecution(currentState, execution.results);
  currentState = updateStateAfterEvaluation(currentState, evaluation.results);
  currentState = updateStateComplete(currentState);

  logger.success("Resume complete!");
  return currentState;
}

/**
 * Resume from execution stage.
 */
async function resumeFromExecution(
  initialState: NonNullable<ReturnType<typeof loadState>>,
  config: ReturnType<typeof loadConfigWithOverrides>,
  _resultsDir: string,
): Promise<NonNullable<ReturnType<typeof loadState>>> {
  logger.info("Resuming from execution...");

  const analysisData = initialState.analysis;
  const scenarioData = initialState.scenarios;
  if (!analysisData || !scenarioData) {
    throw new Error(
      "Cannot resume from execution: missing analysis or scenario data",
    );
  }

  const execution = await runExecution(
    analysisData,
    scenarioData,
    config,
    consoleProgress,
  );

  const evaluation = await runEvaluation(
    analysisData.plugin_name,
    scenarioData,
    execution.results,
    config,
    consoleProgress,
  );

  // Chain state updates
  let currentState = updateStateAfterExecution(initialState, execution.results);
  currentState = updateStateAfterEvaluation(currentState, evaluation.results);
  currentState = updateStateComplete(currentState);

  logger.success("Resume complete!");
  return currentState;
}

/**
 * Resume from evaluation stage.
 */
async function resumeFromEvaluation(
  initialState: NonNullable<ReturnType<typeof loadState>>,
  config: ReturnType<typeof loadConfigWithOverrides>,
  _resultsDir: string,
): Promise<NonNullable<ReturnType<typeof loadState>>> {
  logger.info("Resuming from evaluation...");

  const analysisData = initialState.analysis;
  const scenarioData = initialState.scenarios;
  const executionData = initialState.executions;
  if (!analysisData || !scenarioData || !executionData) {
    throw new Error(
      "Cannot resume from evaluation: missing analysis, scenario, or execution data",
    );
  }

  const evaluation = await runEvaluation(
    analysisData.plugin_name,
    scenarioData,
    executionData,
    config,
    consoleProgress,
  );

  // Chain state updates
  let currentState = updateStateAfterEvaluation(
    initialState,
    evaluation.results,
  );
  currentState = updateStateComplete(currentState);

  logger.success("Resume complete!");
  return currentState;
}

/**
 * Stage handler type for resume operations.
 */
type ResumeHandler = (
  state: NonNullable<ReturnType<typeof loadState>>,
  config: ReturnType<typeof loadConfigWithOverrides>,
  resultsDir: string,
) => Promise<NonNullable<ReturnType<typeof loadState>>>;

/**
 * Map of stages to their resume handlers.
 */
const resumeHandlers: Record<PipelineStage, ResumeHandler> = {
  pending: resumeFromAnalysis,
  analysis: resumeFromAnalysis,
  generation: resumeFromGeneration,
  execution: resumeFromExecution,
  evaluation: resumeFromEvaluation,
  complete: resumeFromEvaluation, // Already complete, but handle gracefully
};

const program = new Command();

// Configure styled help output (Commander v13+ feature)
program.configureHelp({
  styleTitle: (str) => chalk.bold.cyan(str),
  styleCommandText: (str) => chalk.green(str),
  styleCommandDescription: (str) => chalk.dim(str),
  styleDescriptionText: (str) => str,
  styleOptionText: (str) => chalk.yellow(str),
  styleArgumentText: (str) => chalk.magenta(str),
  styleSubcommandText: (str) => chalk.green(str),
});

program
  .name("cc-plugin-eval")
  .description("Claude Code plugin component triggering evaluation framework")
  .version("0.1.0");

/**
 * Extract CLI options from commander options object.
 */
function extractCLIOptions(
  options: Record<string, unknown>,
): Partial<CLIOptions> {
  const cliOptions: Partial<CLIOptions> = {};

  if (typeof options["plugin"] === "string") {
    cliOptions.plugin = options["plugin"];
  }
  if (typeof options["marketplace"] === "string") {
    cliOptions.marketplace = options["marketplace"];
  }
  if (typeof options["dryRun"] === "boolean") {
    cliOptions.dryRun = options["dryRun"];
  }
  if (typeof options["verbose"] === "boolean") {
    cliOptions.verbose = options["verbose"];
  }
  if (typeof options["debug"] === "boolean") {
    cliOptions.debug = options["debug"];
  }
  if (typeof options["fast"] === "boolean") {
    cliOptions.fast = options["fast"];
  }
  if (typeof options["failedRun"] === "string") {
    cliOptions.failedRun = options["failedRun"];
  }
  if (typeof options["withPlugins"] === "string") {
    cliOptions.withPlugins = options["withPlugins"].split(",");
  }
  if (typeof options["output"] === "string") {
    cliOptions.output = options["output"] as CLIOptions["output"];
  }
  if (typeof options["estimate"] === "boolean") {
    cliOptions.estimate = options["estimate"];
  }
  if (typeof options["noBatch"] === "boolean") {
    cliOptions.noBatch = options["noBatch"];
  }
  if (typeof options["rewind"] === "boolean") {
    cliOptions.rewind = options["rewind"];
  }
  if (typeof options["semantic"] === "boolean") {
    cliOptions.semantic = options["semantic"];
  }
  if (typeof options["samples"] === "number") {
    cliOptions.samples = options["samples"];
  }
  if (typeof options["reps"] === "number") {
    cliOptions.reps = options["reps"];
  }

  return cliOptions;
}

// =============================================================================
// Pipeline Commands Group
// =============================================================================
program.commandsGroup("Pipeline Commands:");

program
  .command("run")
  .description("Run full evaluation pipeline")
  // Input Options Group
  .optionsGroup("Input Options:")
  .option("-p, --plugin <path>", "Path to plugin directory")
  .option("-c, --config <path>", "Path to config file (default: config.yaml)")
  .option("--marketplace <path>", "Evaluate all plugins in marketplace")
  // Execution Mode Group (with v13.1 dual long flag aliases)
  .optionsGroup("Execution Mode:")
  .option("--dr, --dry-run", "Generate scenarios without execution")
  .option("--fast", "Only run previously failed scenarios")
  .option("--failed-run <id>", "Run ID to get failed scenarios from")
  .option("--no-batch", "Force synchronous execution")
  .option("--rewind", "Undo file changes after each scenario")
  .option("--est, --estimate", "Show cost estimate before execution")
  // Output Options Group
  .optionsGroup("Output Options:")
  .option("-o, --output <format>", "Output format: json|yaml|junit-xml|tap")
  .option("-v, --verbose", "Detailed progress output")
  .option("--debug", "Enable debug output")
  // Testing Options Group
  .optionsGroup("Testing Options:")
  .option(
    "--with-plugins <paths>",
    "Additional plugins for conflict testing (comma-separated)",
  )
  .option("--semantic", "Enable semantic variation testing")
  .option(
    "--samples <n>",
    "Number of samples for multi-sample judgment",
    parseInt,
  )
  .option("--reps <n>", "Number of repetitions per scenario", parseInt)
  .action(async (options: Record<string, unknown>) => {
    try {
      const cliOptions = extractCLIOptions(options);
      const configPath =
        typeof options["config"] === "string"
          ? options["config"]
          : "config.yaml";
      const config = loadConfigWithOverrides(configPath, cliOptions);

      if (config.verbose) {
        logger.configure({ level: "debug" });
      }

      logger.info("Starting cc-plugin-eval...");

      // Generate run ID and create initial state
      const runId = generateRunId();

      // Stage 1: Analysis
      const analysis = await runAnalysis(config);
      let state = createPipelineState({
        pluginName: analysis.plugin_name,
        config,
        runId,
      });
      state = updateStateAfterAnalysis(state, analysis);

      const resultsDir = getResultsDir(analysis.plugin_name, runId);
      writeJson(`${resultsDir}/analysis.json`, analysis);
      logger.success(`Analysis saved to ${resultsDir}/analysis.json`);

      // Stage 2: Generation
      const generation = await runGeneration(analysis, config);
      state = updateStateAfterGeneration(state, generation.scenarios);

      writeJson(`${resultsDir}/scenarios.json`, generation.scenarios);
      writeJson(`${resultsDir}/generation-metadata.json`, {
        timestamp: new Date().toISOString(),
        plugin_name: generation.plugin_name,
        scenario_count: generation.scenarios.length,
        scenario_count_by_type: generation.scenario_count_by_type,
        scenario_count_by_component: generation.scenario_count_by_component,
        diversity_metrics: generation.diversity_metrics,
        cost_estimate: generation.cost_estimate,
      });
      logger.success(`Scenarios saved to ${resultsDir}/scenarios.json`);

      // Check if dry_run mode - stop after generation
      if (config.dry_run) {
        logger.info("Dry-run mode: stopping after generation");
        return;
      }

      // Determine scenarios to run (support fast mode)
      let scenariosToRun = generation.scenarios;

      if (config.fast_mode?.enabled && config.fast_mode.failed_run_id) {
        // Fast mode: only run previously failed scenarios
        const previousState = loadState(
          analysis.plugin_name,
          config.fast_mode.failed_run_id,
        );
        if (previousState) {
          scenariosToRun = getFailedScenarios(
            previousState,
            generation.scenarios,
          );
          logger.info(
            `Fast mode: running ${String(scenariosToRun.length)} failed scenarios`,
          );
        }
      }

      // Stage 3: Execution
      const execution = await runExecution(
        analysis,
        scenariosToRun,
        config,
        consoleProgress,
      );
      state = updateStateAfterExecution(state, execution.results);

      writeJson(`${resultsDir}/execution-metadata.json`, {
        timestamp: new Date().toISOString(),
        plugin_name: execution.plugin_name,
        total_cost_usd: execution.total_cost_usd,
        total_duration_ms: execution.total_duration_ms,
        success_count: execution.success_count,
        error_count: execution.error_count,
        total_tools_captured: execution.total_tools_captured,
      });

      // Stage 4: Evaluation
      const evaluation = await runEvaluation(
        analysis.plugin_name,
        scenariosToRun,
        execution.results,
        config,
        consoleProgress,
      );
      state = updateStateAfterEvaluation(state, evaluation.results);

      writeJson(`${resultsDir}/evaluation.json`, {
        timestamp: new Date().toISOString(),
        plugin_name: evaluation.plugin_name,
        metrics: evaluation.metrics,
        results: evaluation.results,
      });

      // Mark as complete
      updateStateComplete(state);

      // Output final summary
      outputFinalSummary(resultsDir, evaluation.metrics);

      logger.success("Evaluation complete!");
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("analyze")
  .description("Run Stage 1: Plugin Analysis only")
  .option("-p, --plugin <path>", "Path to plugin directory")
  .option("-c, --config <path>", "Path to config file")
  .action(async (options: Record<string, unknown>) => {
    try {
      const cliOptions: Partial<CLIOptions> = {};
      if (typeof options["plugin"] === "string") {
        cliOptions.plugin = options["plugin"];
      }

      const configPath =
        typeof options["config"] === "string" ? options["config"] : undefined;
      const config = loadConfigWithOverrides(configPath, cliOptions);

      const analysis = await runAnalysis(config);

      const resultsDir = getResultsDir(analysis.plugin_name);
      writeJson(`${resultsDir}/analysis.json`, analysis);
      logger.success(`Analysis saved to ${resultsDir}/analysis.json`);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("generate")
  .description("Run Stages 1-2: Analysis and Scenario Generation")
  .option("-p, --plugin <path>", "Path to plugin directory")
  .option("-c, --config <path>", "Path to config file")
  .option("--verbose", "Detailed progress output")
  .option("--semantic", "Enable semantic variation testing")
  .action(async (options: Record<string, unknown>) => {
    try {
      const cliOptions: Partial<CLIOptions> = {
        dryRun: true, // Generation only, no execution
      };
      if (typeof options["plugin"] === "string") {
        cliOptions.plugin = options["plugin"];
      }
      if (typeof options["verbose"] === "boolean") {
        cliOptions.verbose = options["verbose"];
      }
      if (typeof options["semantic"] === "boolean") {
        cliOptions.semantic = options["semantic"];
      }

      const configPath =
        typeof options["config"] === "string" ? options["config"] : undefined;
      const config = loadConfigWithOverrides(configPath, cliOptions);

      // Override dry_run to false for generate command since we want to generate scenarios
      config.dry_run = false;

      if (config.verbose) {
        logger.configure({ level: "debug" });
      }

      const runId = generateRunId();

      // Stage 1: Analysis
      const analysis = await runAnalysis(config);

      const resultsDir = getResultsDir(analysis.plugin_name, runId);
      writeJson(`${resultsDir}/analysis.json`, analysis);
      logger.success(`Analysis saved to ${resultsDir}/analysis.json`);

      // Stage 2: Generation
      const generation = await runGeneration(analysis, config);

      writeJson(`${resultsDir}/scenarios.json`, generation.scenarios);
      writeJson(`${resultsDir}/generation-metadata.json`, {
        timestamp: new Date().toISOString(),
        plugin_name: generation.plugin_name,
        scenario_count: generation.scenarios.length,
        scenario_count_by_type: generation.scenario_count_by_type,
        scenario_count_by_component: generation.scenario_count_by_component,
        diversity_metrics: generation.diversity_metrics,
        cost_estimate: generation.cost_estimate,
      });

      logger.success(
        `Generated ${String(generation.scenarios.length)} scenarios`,
      );
      logger.success(`Scenarios saved to ${resultsDir}/scenarios.json`);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("execute")
  .description("Run Stages 1-3: Analysis, Generation, and Execution")
  .option("-p, --plugin <path>", "Path to plugin directory")
  .option("-c, --config <path>", "Path to config file")
  .option("--verbose", "Detailed progress output")
  .action(async (options: Record<string, unknown>) => {
    try {
      const cliOptions: Partial<CLIOptions> = {};
      if (typeof options["plugin"] === "string") {
        cliOptions.plugin = options["plugin"];
      }
      if (typeof options["verbose"] === "boolean") {
        cliOptions.verbose = options["verbose"];
      }

      const configPath =
        typeof options["config"] === "string" ? options["config"] : undefined;
      const config = loadConfigWithOverrides(configPath, cliOptions);

      if (config.verbose) {
        logger.configure({ level: "debug" });
      }

      const runId = generateRunId();

      // Stage 1: Analysis
      const analysis = await runAnalysis(config);
      let state = createPipelineState({
        pluginName: analysis.plugin_name,
        config,
        runId,
      });
      state = updateStateAfterAnalysis(state, analysis);

      const resultsDir = getResultsDir(analysis.plugin_name, runId);
      writeJson(`${resultsDir}/analysis.json`, analysis);

      // Stage 2: Generation
      const generation = await runGeneration(analysis, config);
      state = updateStateAfterGeneration(state, generation.scenarios);

      writeJson(`${resultsDir}/scenarios.json`, generation.scenarios);

      // Stage 3: Execution
      const execution = await runExecution(
        analysis,
        generation.scenarios,
        config,
        consoleProgress,
      );
      updateStateAfterExecution(state, execution.results);

      writeJson(`${resultsDir}/execution-metadata.json`, {
        timestamp: new Date().toISOString(),
        plugin_name: execution.plugin_name,
        total_cost_usd: execution.total_cost_usd,
        total_duration_ms: execution.total_duration_ms,
        success_count: execution.success_count,
        error_count: execution.error_count,
        total_tools_captured: execution.total_tools_captured,
      });

      logger.success(
        `Execution complete: ${String(execution.success_count)}/${String(execution.results.length)} passed`,
      );
      logger.success(`Results saved to ${resultsDir}`);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// =============================================================================
// State Management Commands Group
// =============================================================================
program.commandsGroup("State Management:");

program
  .command("resume")
  .description("Resume from saved state")
  .option("-r, --run-id <id>", "Run ID to resume")
  .option("-p, --plugin <name>", "Plugin name (for finding run)")
  .option(
    "-s, --from-stage <stage>",
    "Stage to resume from: analysis|generation|execution|evaluation",
  )
  .action(async (options: Record<string, unknown>) => {
    try {
      const pluginName = options["plugin"] as string | undefined;
      let runId = options["runId"] as string | undefined;
      const fromStage = options["fromStage"] as PipelineStage | undefined;

      // If no run ID provided, find the latest run for the plugin
      if (!runId && pluginName) {
        runId = findLatestRun(pluginName) ?? undefined;
        if (!runId) {
          logger.error(`No runs found for plugin: ${pluginName}`);
          process.exit(1);
        }
        logger.info(`Found latest run: ${runId}`);
      }

      if (!runId) {
        logger.error("Please provide --run-id or --plugin to find a run");
        process.exit(1);
      }

      // Load the state using helper function
      const state = findAndLoadState(pluginName, runId);

      if (!state) {
        logger.error(`No state found for run: ${runId}`);
        process.exit(1);
      }

      logger.info("Current state:");
      console.log(formatState(state));

      // Determine resume point
      const resumeStage = fromStage ?? state.stage;

      if (!canResumeFrom(state, resumeStage)) {
        logger.error(`Cannot resume from stage: ${resumeStage}`);
        logger.info("Available data:");
        if (state.analysis) {
          logger.info("  - Analysis complete");
        }
        if (state.scenarios) {
          logger.info("  - Scenarios generated");
        }
        if (state.executions) {
          logger.info("  - Executions complete");
        }
        if (state.evaluations) {
          logger.info("  - Evaluations complete");
        }
        process.exit(1);
      }

      const config = state.config;
      if (config.verbose) {
        logger.configure({ level: "debug" });
      }

      const resultsDir = getResultsDir(state.plugin_name, state.run_id);

      // Resume from the appropriate stage using handler map
      const handler = resumeHandlers[resumeStage];
      await handler(state, config, resultsDir);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("report")
  .description("Generate report from existing results")
  .option("-r, --run-id <id>", "Run ID to report on")
  .option("-p, --plugin <name>", "Plugin name")
  .option("-o, --output <format>", "Output format: json|yaml|junit-xml|tap")
  .option("--cli", "Output CLI summary")
  .action((options: Record<string, unknown>) => {
    try {
      const pluginName = options["plugin"] as string | undefined;
      let runId = options["runId"] as string | undefined;
      const outputFormat = (options["output"] as string | undefined) ?? "json";
      const cliOutput = options["cli"] as boolean | undefined;

      // Find run if not specified
      if (!runId && pluginName) {
        runId = findLatestRun(pluginName) ?? undefined;
        if (!runId) {
          logger.error(`No runs found for plugin: ${pluginName}`);
          process.exit(1);
        }
      }

      if (!runId) {
        logger.error("Please provide --run-id or --plugin");
        process.exit(1);
      }

      // Find the plugin if not specified using helper function
      const actualPluginName = pluginName ?? findPluginByRunId(runId);

      if (!actualPluginName) {
        logger.error(`Cannot find run: ${runId}`);
        process.exit(1);
      }

      const resultsDir = getResultsDir(actualPluginName, runId);

      // Load evaluation results
      const evaluationPath = `${resultsDir}/evaluation.json`;
      interface EvaluationFile {
        plugin_name: string;
        metrics: Record<string, unknown>;
        results: Record<string, unknown>[];
      }
      const evaluation = readJson(evaluationPath) as EvaluationFile;

      if (cliOutput) {
        // Output CLI summary
        outputCLISummary(evaluation);
      } else if (outputFormat === "junit-xml") {
        // Output JUnit XML
        outputJUnitXML(actualPluginName, evaluation.results);
      } else if (outputFormat === "tap") {
        // Output TAP format
        outputTAP(evaluation.results);
      } else {
        // Output JSON (or YAML if requested)
        if (outputFormat === "yaml") {
          console.log(YAML.stringify(evaluation));
        } else {
          console.log(JSON.stringify(evaluation, null, 2));
        }
      }
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("list")
  .description("List previous runs")
  .option("-p, --plugin <name>", "Plugin name")
  .action((options: Record<string, unknown>) => {
    const pluginName = options["plugin"] as string | undefined;

    if (!pluginName) {
      // List all plugins and their runs
      if (!existsSync("results")) {
        logger.info("No results found");
        return;
      }

      const plugins = readdirSync("results");
      for (const plugin of plugins) {
        const runs = listRuns(plugin);
        if (runs.length > 0) {
          console.log(`\n${plugin}:`);
          for (const run of runs) {
            console.log(`  ${run.runId} - ${run.stage} (${run.timestamp})`);
          }
        }
      }
    } else {
      // List runs for specific plugin
      const runs = listRuns(pluginName);

      if (runs.length === 0) {
        logger.info(`No runs found for plugin: ${pluginName}`);
        return;
      }

      console.log(`\nRuns for ${pluginName}:`);
      for (const run of runs) {
        console.log(`  ${run.runId} - ${run.stage} (${run.timestamp})`);
      }
    }
  });

/**
 * Output CLI summary of evaluation results.
 */
function outputCLISummary(evaluation: {
  plugin_name: string;
  metrics: Record<string, unknown>;
  results: Record<string, unknown>[];
}): void {
  const metrics = evaluation.metrics as {
    accuracy: number;
    trigger_rate: number;
    total_scenarios: number;
    triggered_count: number;
    avg_quality: number;
    conflict_count: number;
  };

  console.log("\n" + "=".repeat(60));
  console.log(`Plugin: ${evaluation.plugin_name}`);
  console.log("=".repeat(60));
  console.log(`Total Scenarios: ${String(metrics.total_scenarios)}`);
  console.log(`Accuracy: ${(metrics.accuracy * 100).toFixed(1)}%`);
  console.log(`Trigger Rate: ${(metrics.trigger_rate * 100).toFixed(1)}%`);
  console.log(
    `Triggered: ${String(metrics.triggered_count)}/${String(metrics.total_scenarios)}`,
  );

  if (metrics.avg_quality > 0) {
    console.log(`Avg Quality: ${metrics.avg_quality.toFixed(1)}/10`);
  }

  if (metrics.conflict_count > 0) {
    console.log(`Conflicts: ${String(metrics.conflict_count)}`);
  }

  console.log("=".repeat(60) + "\n");
}

/**
 * Output JUnit XML format.
 */
function outputJUnitXML(
  pluginName: string,
  results: Record<string, unknown>[],
): void {
  const failures = results.filter(
    (r) => r["triggered"] !== r["expected_trigger"],
  );

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<testsuites name="cc-plugin-eval" tests="${String(results.length)}" failures="${String(failures.length)}">\n`;
  xml += `  <testsuite name="${pluginName}" tests="${String(results.length)}" failures="${String(failures.length)}">\n`;

  for (const result of results) {
    const scenarioId = result["scenario_id"] as string;
    const triggered = result["triggered"] as boolean;
    const expected = result["expected_trigger"] as boolean | undefined;
    const passed = expected === undefined || triggered === expected;

    xml += `    <testcase name="${scenarioId}" classname="${pluginName}">\n`;
    if (!passed) {
      const summary =
        typeof result["summary"] === "string" ? result["summary"] : "";
      xml += `      <failure message="Expected ${String(expected)}, got ${String(triggered)}">${summary}</failure>\n`;
    }
    xml += `    </testcase>\n`;
  }

  xml += "  </testsuite>\n";
  xml += "</testsuites>\n";

  console.log(xml);
}

/**
 * Output TAP format.
 */
function outputTAP(results: Record<string, unknown>[]): void {
  console.log(`TAP version 14`);
  console.log(`1..${String(results.length)}`);

  let i = 1;
  for (const result of results) {
    const scenarioId = result["scenario_id"] as string;
    const triggered = result["triggered"] as boolean;
    const expected = result["expected_trigger"] as boolean | undefined;
    const passed = expected === undefined || triggered === expected;

    if (passed) {
      console.log(`ok ${String(i)} - ${scenarioId}`);
    } else {
      console.log(`not ok ${String(i)} - ${scenarioId}`);
      console.log(`  ---`);
      console.log(`  expected: ${String(expected)}`);
      console.log(`  actual: ${String(triggered)}`);
      console.log(`  ...`);
    }
    i++;
  }
}

/**
 * Output final summary of evaluation.
 */
function outputFinalSummary(resultsDir: string, metrics: EvalMetrics): void {
  const m = metrics;

  console.log("\n" + "=".repeat(60));
  console.log("EVALUATION SUMMARY");
  console.log("=".repeat(60));
  console.log(`Results: ${resultsDir}`);
  console.log(`Accuracy: ${(m.accuracy * 100).toFixed(1)}%`);
  console.log(`Trigger Rate: ${(m.trigger_rate * 100).toFixed(1)}%`);
  console.log(
    `Scenarios: ${String(m.triggered_count)}/${String(m.total_scenarios)} triggered`,
  );

  if (m.avg_quality > 0) {
    console.log(`Quality Score: ${m.avg_quality.toFixed(1)}/10`);
  }

  if (m.conflict_count > 0) {
    console.log(`Conflicts Detected: ${String(m.conflict_count)}`);
  }

  console.log("=".repeat(60) + "\n");
}

program.parse();
