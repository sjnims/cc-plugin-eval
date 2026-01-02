/**
 * Logging utilities with color support.
 */

import chalk from "chalk";

import { DEFAULT_TUNING } from "../config/defaults.js";

/**
 * Log levels.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Logger configuration.
 */
export interface LoggerConfig {
  level: LogLevel;
  timestamps: boolean;
  colors: boolean;
}

/**
 * Default logger configuration.
 */
const defaultConfig: LoggerConfig = {
  level: "info",
  timestamps: false,
  colors: true,
};

/**
 * Current logger configuration.
 */
let config: LoggerConfig = { ...defaultConfig };

/**
 * Log level priorities.
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Configure the logger.
 *
 * @param newConfig - Partial configuration to apply
 */
export function configureLogger(newConfig: Partial<LoggerConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Check if a log level should be output.
 *
 * @param level - Level to check
 * @returns True if level should be logged
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[config.level];
}

/**
 * Format a log message.
 *
 * @param level - Log level
 * @param message - Message to format
 * @returns Formatted message
 */
function formatMessage(level: LogLevel, message: string): string {
  let prefix = "";

  if (config.timestamps) {
    prefix += `[${new Date().toISOString()}] `;
  }

  if (config.colors) {
    switch (level) {
      case "debug":
        prefix += chalk.gray("[DEBUG]");
        break;
      case "info":
        prefix += chalk.blue("[INFO]");
        break;
      case "warn":
        prefix += chalk.yellow("[WARN]");
        break;
      case "error":
        prefix += chalk.red("[ERROR]");
        break;
    }
  } else {
    prefix += `[${level.toUpperCase()}]`;
  }

  return `${prefix} ${message}`;
}

/**
 * Log a debug message.
 *
 * @param message - Message to log
 * @param args - Additional arguments
 */
export function debug(message: string, ...args: unknown[]): void {
  if (shouldLog("debug")) {
    console.debug(formatMessage("debug", message), ...args);
  }
}

/**
 * Log an info message.
 *
 * @param message - Message to log
 * @param args - Additional arguments
 */
export function info(message: string, ...args: unknown[]): void {
  if (shouldLog("info")) {
    console.info(formatMessage("info", message), ...args);
  }
}

/**
 * Log a warning message.
 *
 * @param message - Message to log
 * @param args - Additional arguments
 */
export function warn(message: string, ...args: unknown[]): void {
  if (shouldLog("warn")) {
    console.warn(formatMessage("warn", message), ...args);
  }
}

/**
 * Log an error message.
 *
 * @param message - Message to log
 * @param args - Additional arguments
 */
export function error(message: string, ...args: unknown[]): void {
  if (shouldLog("error")) {
    console.error(formatMessage("error", message), ...args);
  }
}

/**
 * Log a success message.
 *
 * @param message - Message to log
 */
export function success(message: string): void {
  if (shouldLog("info")) {
    const formatted = config.colors
      ? chalk.green(`✅ ${message}`)
      : `[SUCCESS] ${message}`;
    console.log(formatted);
  }
}

/**
 * Log a failure message.
 *
 * @param message - Message to log
 */
export function failure(message: string): void {
  if (shouldLog("info")) {
    const formatted = config.colors
      ? chalk.red(`❌ ${message}`)
      : `[FAILURE] ${message}`;
    console.log(formatted);
  }
}

/**
 * Log a stage header.
 *
 * @param stageName - Name of the stage
 * @param itemCount - Optional item count
 */
export function stageHeader(stageName: string, itemCount?: number): void {
  const separator = "=".repeat(60);
  const countStr =
    itemCount !== undefined ? ` (${String(itemCount)} items)` : "";

  if (config.colors) {
    console.log(chalk.cyan(separator));
    console.log(
      chalk.cyan.bold(`STAGE: ${stageName.toUpperCase()}${countStr}`),
    );
    console.log(chalk.cyan(separator));
  } else {
    console.log(separator);
    console.log(`STAGE: ${stageName.toUpperCase()}${countStr}`);
    console.log(separator);
  }
}

/**
 * Log a progress update.
 *
 * @param current - Current item number
 * @param total - Total items
 * @param message - Progress message
 */
export function progress(
  current: number,
  total: number,
  message: string,
): void {
  if (shouldLog("info")) {
    const percentage = Math.round((current / total) * 100);
    const progressBar = createProgressBar(current, total);

    if (config.colors) {
      console.log(
        chalk.gray(
          `[${String(current)}/${String(total)}] ${progressBar} ${String(percentage)}% - ${message}`,
        ),
      );
    } else {
      console.log(
        `[${String(current)}/${String(total)}] ${progressBar} ${String(percentage)}% - ${message}`,
      );
    }
  }
}

/**
 * Create a text progress bar.
 *
 * @param current - Current value
 * @param total - Total value
 * @param width - Bar width (defaults to tuning config value)
 * @returns Progress bar string
 */
function createProgressBar(
  current: number,
  total: number,
  width = DEFAULT_TUNING.limits.progress_bar_width,
): string {
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

/**
 * Create a table for CLI output.
 *
 * @param headers - Column headers
 * @param rows - Table rows
 * @returns Formatted table string
 */
export function table(headers: string[], rows: string[][]): string {
  // Calculate column widths
  const widths = headers.map((h, i) => {
    const rowMax = Math.max(...rows.map((r) => (r[i] ?? "").length));
    return Math.max(h.length, rowMax);
  });

  // Format header
  const headerRow = headers.map((h, i) => h.padEnd(widths[i] ?? 0)).join(" | ");
  const separator = widths.map((w) => "-".repeat(w)).join("-+-");

  // Format rows
  const dataRows = rows.map((row) =>
    row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join(" | "),
  );

  return [headerRow, separator, ...dataRows].join("\n");
}

/**
 * Default logger instance.
 */
export const logger = {
  debug,
  info,
  warn,
  error,
  success,
  failure,
  stageHeader,
  progress,
  configure: configureLogger,
};
