/**
 * Configuration module exports.
 */

export {
  loadConfig,
  loadConfigWithOverrides,
  validateConfig,
  resolveModelId,
  ConfigLoadError,
  ConfigValidationError,
  type CLIOptions,
} from "./loader.js";

export {
  EvalConfigSchema,
  PluginConfigSchema,
  ScopeConfigSchema,
  GenerationConfigSchema,
  ExecutionConfigSchema,
  EvaluationConfigSchema,
  OutputConfigSchema,
  type ValidatedEvalConfig,
} from "./schema.js";

export {
  createDefaultConfig,
  DEFAULT_SCOPE,
  DEFAULT_GENERATION,
  DEFAULT_EXECUTION,
  DEFAULT_EVALUATION,
  DEFAULT_OUTPUT,
} from "./defaults.js";

export {
  MODEL_PRICING,
  getModelPricing,
  calculateCost,
  formatCost,
} from "./pricing.js";
