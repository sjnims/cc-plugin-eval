/**
 * Tests for conflict tracker functions.
 */

import { describe, it, expect } from "vitest";

import type { ProgrammaticDetection } from "../../../../src/types/index.js";

import {
  calculateConflictSeverity,
  sharesDomain,
  countConflicts,
  getConflictSummary,
} from "../../../../src/stages/4-evaluation/conflict-tracker.js";

/**
 * Create a mock ProgrammaticDetection for testing.
 */
function createDetection(
  componentName: string,
  componentType: "skill" | "agent" | "command" = "skill",
): ProgrammaticDetection {
  return {
    component_type: componentType,
    component_name: componentName,
    confidence: 100,
    tool_name:
      componentType === "skill"
        ? "Skill"
        : componentType === "agent"
          ? "Task"
          : "SlashCommand",
    evidence: `${componentType} triggered: ${componentName}`,
    timestamp: Date.now(),
  };
}

describe("sharesDomain", () => {
  it("should return true for components sharing a domain suffix", () => {
    expect(sharesDomain("skill-development", "command-development")).toBe(true);
    expect(sharesDomain("hook-development", "agent-development")).toBe(true);
  });

  it("should return false for unrelated components", () => {
    expect(sharesDomain("bootstrap-expert", "hook-development")).toBe(false);
    expect(sharesDomain("commit", "review-pr")).toBe(false);
  });

  it("should ignore short parts", () => {
    // "dev" is only 3 chars, should be ignored
    expect(sharesDomain("skill-dev", "command-dev")).toBe(false);
  });

  it("should match parts of 4+ chars", () => {
    expect(sharesDomain("bootstrap-components", "react-components")).toBe(true);
  });

  it("should handle single-word names", () => {
    expect(sharesDomain("commit", "commit")).toBe(true);
    expect(sharesDomain("commit", "review")).toBe(false);
  });
});

describe("calculateConflictSeverity", () => {
  describe("no conflict (none)", () => {
    it("should return none when only expected component triggered", () => {
      const triggered = [createDetection("commit", "skill")];

      const result = calculateConflictSeverity("commit", "skill", triggered);

      expect(result.has_conflict).toBe(false);
      expect(result.conflict_severity).toBe("none");
      expect(result.expected_component).toBe("commit");
    });

    it("should return none when nothing triggered", () => {
      const result = calculateConflictSeverity("commit", "skill", []);

      expect(result.has_conflict).toBe(false);
      expect(result.conflict_severity).toBe("none");
      expect(result.all_triggered_components).toHaveLength(0);
    });
  });

  describe("minor conflict", () => {
    it("should return minor when related same-type components trigger", () => {
      const triggered = [
        createDetection("skill-development", "skill"),
        createDetection("command-development", "skill"),
      ];

      const result = calculateConflictSeverity(
        "skill-development",
        "skill",
        triggered,
      );

      expect(result.has_conflict).toBe(true);
      expect(result.conflict_severity).toBe("minor");
      expect(result.conflict_reason).toContain("Related components triggered");
    });
  });

  describe("major conflict", () => {
    it("should return major when expected component did not trigger", () => {
      const triggered = [createDetection("review", "skill")];

      const result = calculateConflictSeverity("commit", "skill", triggered);

      expect(result.has_conflict).toBe(true);
      expect(result.conflict_severity).toBe("major");
      expect(result.conflict_reason).toContain("did not trigger");
      expect(result.conflict_reason).toContain("commit");
    });

    it("should return major when different component types trigger", () => {
      const triggered = [
        createDetection("commit", "skill"),
        createDetection("review-agent", "agent"),
      ];

      const result = calculateConflictSeverity("commit", "skill", triggered);

      expect(result.has_conflict).toBe(true);
      expect(result.conflict_severity).toBe("major");
      expect(result.conflict_reason).toContain("Different component types");
    });

    it("should return major when unrelated same-type components trigger", () => {
      const triggered = [
        createDetection("bootstrap-expert", "skill"),
        createDetection("hook-development", "skill"),
      ];

      const result = calculateConflictSeverity(
        "bootstrap-expert",
        "skill",
        triggered,
      );

      expect(result.has_conflict).toBe(true);
      expect(result.conflict_severity).toBe("major");
      expect(result.conflict_reason).toContain("Unrelated components");
    });
  });

  describe("all_triggered_components", () => {
    it("should include all triggered components", () => {
      const triggered = [
        createDetection("commit", "skill"),
        createDetection("review", "skill"),
      ];

      const result = calculateConflictSeverity("commit", "skill", triggered);

      expect(result.all_triggered_components).toHaveLength(2);
      expect(result.all_triggered_components[0]).toMatchObject({
        component_name: "commit",
        component_type: "skill",
        confidence: 100,
      });
    });
  });
});

describe("countConflicts", () => {
  it("should count conflicts by severity", () => {
    const analyses = [
      calculateConflictSeverity("a", "skill", [createDetection("a", "skill")]),
      calculateConflictSeverity("b", "skill", [createDetection("c", "skill")]),
      calculateConflictSeverity("skill-development", "skill", [
        createDetection("skill-development", "skill"),
        createDetection("command-development", "skill"),
      ]),
    ];

    const counts = countConflicts(analyses);

    expect(counts.none).toBe(1);
    expect(counts.major).toBe(1);
    expect(counts.minor).toBe(1);
    expect(counts.total).toBe(2);
  });

  it("should return zero counts for empty array", () => {
    const counts = countConflicts([]);

    expect(counts.none).toBe(0);
    expect(counts.minor).toBe(0);
    expect(counts.major).toBe(0);
    expect(counts.total).toBe(0);
  });
});

describe("getConflictSummary", () => {
  it("should return no conflicts message when none", () => {
    const analyses = [
      calculateConflictSeverity("a", "skill", [createDetection("a", "skill")]),
    ];

    const summary = getConflictSummary(analyses);

    expect(summary).toBe("No conflicts detected");
  });

  it("should summarize major and minor conflicts", () => {
    const analyses = [
      calculateConflictSeverity("a", "skill", [createDetection("b", "skill")]),
      calculateConflictSeverity("skill-development", "skill", [
        createDetection("skill-development", "skill"),
        createDetection("command-development", "skill"),
      ]),
    ];

    const summary = getConflictSummary(analyses);

    expect(summary).toContain("2 conflicts");
    expect(summary).toContain("1 major");
    expect(summary).toContain("1 minor");
  });

  it("should handle only major conflicts", () => {
    const analyses = [
      calculateConflictSeverity("a", "skill", [createDetection("b", "skill")]),
    ];

    const summary = getConflictSummary(analyses);

    expect(summary).toContain("1 conflict");
    expect(summary).toContain("1 major");
    expect(summary).not.toContain("minor");
  });

  it("should handle only minor conflicts", () => {
    const analyses = [
      calculateConflictSeverity("skill-development", "skill", [
        createDetection("skill-development", "skill"),
        createDetection("command-development", "skill"),
      ]),
    ];

    const summary = getConflictSummary(analyses);

    expect(summary).toContain("1 conflict");
    expect(summary).toContain("1 minor");
    expect(summary).not.toContain("major");
  });
});
