/**
 * Centralized type exports.
 */

// Plugin types
export type {
  PluginErrorType,
  McpServerStatus,
  PluginLoadDiagnostics,
  PluginLoadResult,
  PluginManifest,
  ResolvedPaths,
  PreflightError,
  PreflightWarning,
  PreflightResult,
} from "./plugin.js";

// Component types
export type {
  SemanticIntent,
  SemanticVariation,
  SkillComponent,
  AgentExample,
  AgentComponent,
  CommandComponent,
} from "./components.js";

// Scenario types
export type {
  ScenarioType,
  ComponentType,
  SetupMessage,
  TestScenario,
  DiversityConfig,
  ScenarioDistribution,
  BaseScenario,
  ScenarioVariation,
} from "./scenario.js";

// Transcript types
export type {
  ToolCapture,
  TranscriptMetadata,
  UserEvent,
  ToolCall,
  AssistantEvent,
  ToolResultEvent,
  TranscriptErrorType,
  TranscriptErrorEvent,
  TranscriptEvent,
  Transcript,
  ExecutionResult,
} from "./transcript.js";

// Evaluation types
export type {
  ProgrammaticDetection,
  TriggeredComponent,
  ConflictAnalysis,
  Citation,
  HighlightWithCitation,
  JudgeResponse,
  MultiSampleResult,
  DetectionSource,
  EvaluationResult,
  ComponentMetrics,
  MultiSampleStats,
  SemanticStats,
  RepetitionStats,
  EvalMetrics,
  MetaJudgmentResult,
} from "./evaluation.js";

// Config types
export type {
  PluginConfig,
  MarketplaceConfig,
  ScopeConfig,
  ReasoningEffort,
  GenerationConfig,
  ExecutionConfig,
  DetectionMode,
  AggregateMethod,
  EvaluationConfig,
  OutputFormat,
  OutputConfig,
  ResumeConfig,
  FastModeConfig,
  McpServersConfig,
  ConflictDetectionConfig,
  TimeoutsConfig,
  RetryTuningConfig,
  TokenEstimatesConfig,
  LimitsConfig,
  BatchingConfig,
  TuningConfig,
  EvalConfig,
} from "./config.js";

// State types
export type {
  PipelineStage,
  SkillTriggerInfo,
  AgentTriggerInfo,
  CommandTriggerInfo,
  AnalysisOutput,
  PipelineState,
} from "./state.js";

// Progress types
export type { ProgressCallbacks } from "./progress.js";

// Cost types
export type {
  ModelPricing,
  TokenEstimate,
  PipelineCostEstimate,
} from "./cost.js";
