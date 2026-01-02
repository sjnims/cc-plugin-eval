/**
 * Conflict Tracker - Detect when multiple components trigger for the same input.
 *
 * Analyzes detection results to identify conflicts and assign severity levels.
 * Conflicts occur when:
 * - Multiple components trigger for a single input
 * - An unexpected component triggers instead of the expected one
 *
 * Severity Levels:
 * - NONE: Only expected component triggered (or no triggers)
 * - MINOR: Expected triggered + related components of same type
 * - MAJOR: Wrong component triggered, or different component types triggered
 */

import { DEFAULT_TUNING } from "../../config/defaults.js";

import type {
  ComponentType,
  ConflictAnalysis,
  ProgrammaticDetection,
  TriggeredComponent,
} from "../../types/index.js";

/**
 * Minimum part length for domain matching.
 * Parts shorter than this are ignored in domain comparison.
 * Value is sourced from DEFAULT_TUNING for centralized configuration.
 */
const MIN_DOMAIN_PART_LENGTH = DEFAULT_TUNING.limits.conflict_domain_part_min;

/**
 * Convert ProgrammaticDetection to TriggeredComponent.
 *
 * @param detection - Programmatic detection
 * @returns Triggered component
 */
function toTriggeredComponent(
  detection: ProgrammaticDetection,
): TriggeredComponent {
  return {
    component_type: detection.component_type,
    component_name: detection.component_name,
    confidence: detection.confidence,
  };
}

/**
 * Check if two component names share a domain suffix.
 *
 * Components sharing common domain suffixes (like "-development")
 * are considered related for conflict severity purposes.
 *
 * @param name1 - First component name
 * @param name2 - Second component name
 * @returns True if components share a domain
 *
 * @example
 * ```typescript
 * sharesDomain('skill-development', 'command-development') // true
 * sharesDomain('bootstrap-expert', 'hook-development') // false
 * ```
 */
export function sharesDomain(name1: string, name2: string): boolean {
  const parts1 = name1.split("-");
  const parts2 = name2.split("-");

  // Check if any significant part is shared
  return parts1.some(
    (part) => part.length >= MIN_DOMAIN_PART_LENGTH && parts2.includes(part),
  );
}

/**
 * Calculate conflict severity for detection results.
 *
 * Conflict Severity Rules:
 *
 * NONE:
 *   - Only the expected component triggered
 *   - No triggers at all (for negative scenarios this is expected)
 *
 * MINOR:
 *   - Expected component triggered AND
 *   - Additional components are of the SAME TYPE (e.g., skill + skill)
 *   - Additional components share a common prefix/domain
 *
 * MAJOR:
 *   - Expected component did NOT trigger (wrong component only)
 *   - Expected triggered but additional components are DIFFERENT TYPE
 *   - Additional components are unrelated domain
 *
 * @param expected - Expected component name
 * @param expectedType - Expected component type
 * @param triggered - All detected components
 * @returns Conflict analysis result
 *
 * @example
 * ```typescript
 * const analysis = calculateConflictSeverity(
 *   'skill-development',
 *   'skill',
 *   detections
 * );
 *
 * if (analysis.conflict_severity === 'major') {
 *   console.log(`Major conflict: ${analysis.conflict_reason}`);
 * }
 * ```
 */
export function calculateConflictSeverity(
  expected: string,
  expectedType: ComponentType,
  triggered: ProgrammaticDetection[],
): ConflictAnalysis {
  const triggeredComponents = triggered.map(toTriggeredComponent);

  // No triggers at all - no conflict (could be expected for negative scenarios)
  if (triggered.length === 0) {
    return {
      expected_component: expected,
      expected_component_type: expectedType,
      all_triggered_components: [],
      has_conflict: false,
      conflict_severity: "none",
    };
  }

  // Check if expected component triggered
  const expectedTriggered = triggered.find(
    (t) => t.component_name === expected && t.component_type === expectedType,
  );

  // Only expected component triggered - perfect case
  if (triggered.length === 1 && expectedTriggered) {
    return {
      expected_component: expected,
      expected_component_type: expectedType,
      all_triggered_components: triggeredComponents,
      has_conflict: false,
      conflict_severity: "none",
    };
  }

  // Expected didn't trigger at all - MAJOR conflict
  if (!expectedTriggered) {
    return {
      expected_component: expected,
      expected_component_type: expectedType,
      all_triggered_components: triggeredComponents,
      has_conflict: true,
      conflict_severity: "major",
      conflict_reason: `Expected component "${expected}" did not trigger. Instead got: ${triggered.map((t) => t.component_name).join(", ")}`,
    };
  }

  // Multiple components triggered - analyze relationships
  const unexpected = triggered.filter(
    (t) => t.component_name !== expected || t.component_type !== expectedType,
  );

  for (const u of unexpected) {
    // Different component types = MAJOR
    if (u.component_type !== expectedType) {
      return {
        expected_component: expected,
        expected_component_type: expectedType,
        all_triggered_components: triggeredComponents,
        has_conflict: true,
        conflict_severity: "major",
        conflict_reason: `Different component types: expected ${expectedType} "${expected}" but also triggered ${u.component_type} "${u.component_name}"`,
      };
    }

    // Unrelated domain = MAJOR
    if (!sharesDomain(expected, u.component_name)) {
      return {
        expected_component: expected,
        expected_component_type: expectedType,
        all_triggered_components: triggeredComponents,
        has_conflict: true,
        conflict_severity: "major",
        conflict_reason: `Unrelated components: "${expected}" and "${u.component_name}" share no common domain`,
      };
    }
  }

  // Same type + related domain = MINOR conflict
  return {
    expected_component: expected,
    expected_component_type: expectedType,
    all_triggered_components: triggeredComponents,
    has_conflict: true,
    conflict_severity: "minor",
    conflict_reason: `Related components triggered: ${triggered.map((t) => t.component_name).join(", ")}`,
  };
}

/**
 * Check if any major conflicts exist in analysis results.
 *
 * @param analyses - Array of conflict analyses
 * @returns True if any major conflict exists
 */
export function hasMajorConflict(analyses: ConflictAnalysis[]): boolean {
  return analyses.some((a) => a.conflict_severity === "major");
}

/**
 * Count conflicts by severity level.
 *
 * @param analyses - Array of conflict analyses
 * @returns Count of conflicts by severity
 */
export function countConflicts(analyses: ConflictAnalysis[]): {
  none: number;
  minor: number;
  major: number;
  total: number;
} {
  const counts = {
    none: 0,
    minor: 0,
    major: 0,
    total: 0,
  };

  for (const analysis of analyses) {
    counts[analysis.conflict_severity]++;
    if (analysis.has_conflict) {
      counts.total++;
    }
  }

  return counts;
}

/**
 * Get conflict summary for reporting.
 *
 * @param analyses - Array of conflict analyses
 * @returns Human-readable conflict summary
 */
export function getConflictSummary(analyses: ConflictAnalysis[]): string {
  const counts = countConflicts(analyses);

  if (counts.total === 0) {
    return "No conflicts detected";
  }

  const parts: string[] = [];

  if (counts.major > 0) {
    parts.push(`${String(counts.major)} major`);
  }

  if (counts.minor > 0) {
    parts.push(`${String(counts.minor)} minor`);
  }

  return `${String(counts.total)} conflict${counts.total > 1 ? "s" : ""}: ${parts.join(", ")}`;
}

/**
 * Analyze conflicts across a cross-plugin test.
 *
 * Used when testing component triggering with additional_plugins loaded.
 *
 * @param expected - Expected component name
 * @param expectedType - Expected component type
 * @param expectedPlugin - Expected plugin name
 * @param triggered - All detected components
 * @returns Extended conflict analysis with plugin info
 */
export function analyzeCrossPluginConflict(
  expected: string,
  expectedType: ComponentType,
  expectedPlugin: string,
  triggered: ProgrammaticDetection[],
): ConflictAnalysis & { cross_plugin_conflict: boolean } {
  const baseAnalysis = calculateConflictSeverity(
    expected,
    expectedType,
    triggered,
  );

  // For cross-plugin analysis, check if conflict involves different plugins
  // Note: Plugin info would need to be added to ProgrammaticDetection for full support
  // This is a placeholder for future extension
  const crossPluginConflict =
    baseAnalysis.has_conflict && baseAnalysis.conflict_severity === "major";

  const newReason = crossPluginConflict
    ? `${baseAnalysis.conflict_reason ?? ""} (cross-plugin: expected from ${expectedPlugin})`
    : baseAnalysis.conflict_reason;

  const result: ConflictAnalysis & { cross_plugin_conflict: boolean } = {
    ...baseAnalysis,
    cross_plugin_conflict: crossPluginConflict,
  };

  if (newReason !== undefined) {
    result.conflict_reason = newReason;
  }

  return result;
}
