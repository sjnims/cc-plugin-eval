/**
 * Evaluation type definitions.
 * Represents detection results, judgments, and metrics.
 */

import type { ComponentType } from "./scenario.js";

/**
 * Programmatic detection result with 100% confidence.
 */
export interface ProgrammaticDetection {
  component_type: ComponentType;
  component_name: string;
  /** Programmatic detection is always 100% confident */
  confidence: 100;
  tool_name: string;
  evidence: string;
  timestamp: number;
}

/**
 * Component triggered during evaluation.
 */
export interface TriggeredComponent {
  component_type: string;
  component_name: string;
  confidence: number;
}

/**
 * Conflict analysis result.
 */
export interface ConflictAnalysis {
  expected_component: string;
  expected_component_type: ComponentType;
  all_triggered_components: TriggeredComponent[];
  has_conflict: boolean;
  conflict_severity: "none" | "minor" | "major";
  conflict_reason?: string;
}

/**
 * Citation linking highlight to message.
 */
export interface Citation {
  message_id: string;
  quoted_text: string;
  /** Start and end character positions */
  position: [number, number];
  /** If citing a tool call */
  tool_call_id?: string;
}

/**
 * Highlight with citation for grounding.
 */
export interface HighlightWithCitation {
  description: string;
  citation: Citation;
}

/**
 * LLM judge response.
 */
export interface JudgeResponse {
  quality_score: number;
  response_relevance: number;
  trigger_accuracy: "correct" | "incorrect" | "partial";
  issues: string[];
  highlights?: HighlightWithCitation[];
  summary: string;
}

/**
 * Multi-sample judgment result.
 */
export interface MultiSampleResult {
  individual_scores: number[];
  aggregated_score: number;
  score_variance: number;
  consensus_trigger_accuracy: "correct" | "incorrect" | "partial";
  /** Whether all samples agreed on trigger_accuracy (unanimous vote) */
  is_unanimous: boolean;
  all_issues: string[];
  representative_response: JudgeResponse;
}

/**
 * Source of detection.
 */
export type DetectionSource = "programmatic" | "llm" | "both";

/**
 * Complete evaluation result for a scenario.
 */
export interface EvaluationResult {
  scenario_id: string;
  triggered: boolean;
  confidence: number;
  quality_score: number | null;
  evidence: string[];
  issues: string[];
  summary: string;
  /** Detection source */
  detection_source: DetectionSource;
  /** All components that triggered */
  all_triggered_components: TriggeredComponent[];
  has_conflict: boolean;
  conflict_severity: "none" | "minor" | "major";
}

/**
 * Per-component metrics.
 */
export interface ComponentMetrics {
  trigger_rate: number;
  accuracy: number;
  avg_quality: number;
  scenarios_count: number;
  false_positives: number;
  false_negatives: number;
}

/**
 * Multi-sampling statistics.
 */
export interface MultiSampleStats {
  samples_per_scenario: number;
  avg_score_variance: number;
  /** Scenarios with variance > threshold */
  high_variance_scenarios: string[];
  /** % scenarios where all samples agreed */
  consensus_rate: number;
}

/**
 * Semantic testing statistics.
 */
export interface SemanticStats {
  total_semantic_scenarios: number;
  semantic_trigger_rate: number;
  variations_by_type: Record<string, { count: number; trigger_rate: number }>;
}

/**
 * Repetition statistics.
 */
export interface RepetitionStats {
  reps_per_scenario: number;
  /** % scenarios with same result across reps */
  consistency_rate: number;
  /** Scenarios with inconsistent results */
  flaky_scenarios: string[];
}

/**
 * Aggregate evaluation metrics.
 */
export interface EvalMetrics {
  total_scenarios: number;
  triggered_count: number;
  trigger_rate: number;
  accuracy: number;
  avg_quality: number;
  by_component: Record<string, ComponentMetrics>;

  /** Conflict metrics */
  conflict_count: number;
  major_conflicts: number;
  minor_conflicts: number;

  /** Cost tracking */
  total_cost_usd: number;
  avg_cost_per_scenario: number;
  total_api_duration_ms: number;

  /** Error tracking */
  error_count: number;
  errors_by_type: Record<string, number>;

  /** Multi-sampling statistics */
  multi_sample_stats?: MultiSampleStats;

  /** Semantic testing stats */
  semantic_stats?: SemanticStats;

  /** Repetition statistics */
  repetition_stats?: RepetitionStats;
}

/**
 * Meta-judgment of overall eval suite quality.
 */
export interface MetaJudgmentResult {
  suite_diversity_score: number;
  coverage_completeness: number;
  scenario_quality_distribution: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
  identified_gaps: string[];
  false_positive_patterns: string[];
  false_negative_patterns: string[];
  recommendations: string[];
}
