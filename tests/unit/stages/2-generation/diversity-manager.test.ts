/**
 * Unit tests for diversity-manager.ts
 */

import { describe, expect, it } from "vitest";

import {
  calculateScenarioDistribution,
  distributeScenarioTypes,
  calculateDiversityMetrics,
  baseToTestScenario,
  createBaseScenario,
} from "../../../../src/stages/2-generation/diversity-manager.js";
import type { TestScenario } from "../../../../src/types/index.js";

describe("calculateScenarioDistribution", () => {
  it("should calculate distribution with high diversity (1.0)", () => {
    const result = calculateScenarioDistribution({
      total_scenarios: 10,
      diversity: 1.0,
    });

    expect(result.base_count).toBe(10);
    expect(result.variations_per_base).toBe(1);
  });

  it("should calculate distribution with low diversity (0.2)", () => {
    const result = calculateScenarioDistribution({
      total_scenarios: 10,
      diversity: 0.2,
    });

    expect(result.base_count).toBe(2);
    expect(result.variations_per_base).toBe(5);
  });

  it("should calculate distribution with medium diversity (0.5)", () => {
    const result = calculateScenarioDistribution({
      total_scenarios: 10,
      diversity: 0.5,
    });

    expect(result.base_count).toBe(5);
    expect(result.variations_per_base).toBe(2);
  });

  it("should clamp diversity below 0.1 to 0.1", () => {
    const result = calculateScenarioDistribution({
      total_scenarios: 10,
      diversity: 0.05,
    });

    // At 0.1 diversity: base_count = ceil(10 * 0.1) = 1, variations = ceil(1/0.1) = 10
    expect(result.base_count).toBe(1);
    expect(result.variations_per_base).toBe(10);
  });

  it("should clamp diversity above 1.0 to 1.0", () => {
    const result = calculateScenarioDistribution({
      total_scenarios: 10,
      diversity: 1.5,
    });

    expect(result.base_count).toBe(10);
    expect(result.variations_per_base).toBe(1);
  });

  it("should ensure at least 1 base scenario", () => {
    const result = calculateScenarioDistribution({
      total_scenarios: 1,
      diversity: 0.1,
    });

    expect(result.base_count).toBeGreaterThanOrEqual(1);
  });
});

describe("distributeScenarioTypes", () => {
  it("should return empty map for count <= 0", () => {
    const result = distributeScenarioTypes(0);
    expect(result.size).toBe(0);
  });

  it("should allocate 30% to direct scenarios", () => {
    const result = distributeScenarioTypes(10, true, false);

    expect(result.get("direct")).toBe(3);
  });

  it("should distribute remaining scenarios evenly among other types", () => {
    const result = distributeScenarioTypes(10, true, false);

    // 10 total, 3 direct = 7 remaining
    // Other types: paraphrased, edge_case, negative = 3 types
    // 7 / 3 = 2 each with 1 leftover
    expect(result.get("direct")).toBe(3);
    expect(result.get("paraphrased")).toBeDefined();
    expect(result.get("edge_case")).toBeDefined();
    expect(result.get("negative")).toBeDefined();
  });

  it("should include semantic when includeSemantic is true", () => {
    const result = distributeScenarioTypes(10, true, true);

    expect(result.has("semantic")).toBe(true);
  });

  it("should exclude negative when includeNegative is false", () => {
    const result = distributeScenarioTypes(10, false, false);

    expect(result.has("negative")).toBe(false);
  });

  it("should handle small counts correctly", () => {
    const result = distributeScenarioTypes(2, true, false);

    expect(result.get("direct")).toBeGreaterThanOrEqual(1);
    // With only 2 scenarios, we might not have all types
    const total = Array.from(result.values()).reduce((a, b) => a + b, 0);
    expect(total).toBe(2);
  });
});

describe("calculateDiversityMetrics", () => {
  it("should calculate correct totals", () => {
    const scenarios: TestScenario[] = [
      {
        id: "test-direct-0",
        component_ref: "test-skill",
        component_type: "skill",
        scenario_type: "direct",
        user_prompt: "test prompt",
        expected_trigger: true,
        expected_component: "test-skill",
      },
      {
        id: "test-paraphrased-0",
        component_ref: "test-skill",
        component_type: "skill",
        scenario_type: "paraphrased",
        user_prompt: "test prompt 2",
        expected_trigger: true,
        expected_component: "test-skill",
      },
    ];

    const result = calculateDiversityMetrics(scenarios);

    expect(result.total).toBe(2);
    expect(result.by_type.direct).toBe(1);
    expect(result.by_type.paraphrased).toBe(1);
  });

  it("should count scenarios by component", () => {
    const scenarios: TestScenario[] = [
      {
        id: "skill1-direct-0",
        component_ref: "skill1",
        component_type: "skill",
        scenario_type: "direct",
        user_prompt: "test",
        expected_trigger: true,
        expected_component: "skill1",
      },
      {
        id: "skill2-direct-0",
        component_ref: "skill2",
        component_type: "skill",
        scenario_type: "direct",
        user_prompt: "test",
        expected_trigger: true,
        expected_component: "skill2",
      },
      {
        id: "skill1-direct-1",
        component_ref: "skill1",
        component_type: "skill",
        scenario_type: "direct",
        user_prompt: "test",
        expected_trigger: true,
        expected_component: "skill1",
      },
    ];

    const result = calculateDiversityMetrics(scenarios);

    expect(result.by_component["skill1"]).toBe(2);
    expect(result.by_component["skill2"]).toBe(1);
  });

  it("should identify base scenarios vs variations", () => {
    const scenarios: TestScenario[] = [
      {
        id: "test-base-0",
        component_ref: "test",
        component_type: "skill",
        scenario_type: "direct",
        user_prompt: "test",
        expected_trigger: true,
        expected_component: "test",
      },
      {
        id: "test-base-0-var-0",
        component_ref: "test",
        component_type: "skill",
        scenario_type: "paraphrased",
        user_prompt: "test",
        expected_trigger: true,
        expected_component: "test",
      },
      {
        id: "test-base-0-var-1",
        component_ref: "test",
        component_type: "skill",
        scenario_type: "edge_case",
        user_prompt: "test",
        expected_trigger: true,
        expected_component: "test",
      },
    ];

    const result = calculateDiversityMetrics(scenarios);

    expect(result.base_scenarios).toBe(1);
    expect(result.variations).toBe(2);
  });

  it("should calculate diversity ratio", () => {
    const scenarios: TestScenario[] = [
      {
        id: "test-base-0",
        component_ref: "test",
        component_type: "skill",
        scenario_type: "direct",
        user_prompt: "test",
        expected_trigger: true,
        expected_component: "test",
      },
      {
        id: "test-base-0-var-0",
        component_ref: "test",
        component_type: "skill",
        scenario_type: "paraphrased",
        user_prompt: "test",
        expected_trigger: true,
        expected_component: "test",
      },
    ];

    const result = calculateDiversityMetrics(scenarios);

    // 1 base out of 2 total = 0.5 ratio
    expect(result.diversity_ratio).toBe(0.5);
  });

  it("should handle empty scenarios", () => {
    const result = calculateDiversityMetrics([]);

    expect(result.total).toBe(0);
    expect(result.diversity_ratio).toBe(0);
  });
});

describe("createBaseScenario", () => {
  it("should create a base scenario with correct properties", () => {
    const result = createBaseScenario(
      "test-skill",
      "skill",
      "create a hook",
      "I want to create a hook",
      0,
    );

    expect(result.id).toBe("test-skill-base-0");
    expect(result.component_ref).toBe("test-skill");
    expect(result.component_type).toBe("skill");
    expect(result.core_intent).toBe("create a hook");
    expect(result.base_prompt).toBe("I want to create a hook");
  });
});

describe("baseToTestScenario", () => {
  it("should convert base scenario to test scenario", () => {
    const base = createBaseScenario(
      "test-skill",
      "skill",
      "create a hook",
      "I want to create a hook",
      0,
    );

    const result = baseToTestScenario(base, "direct", true, "Test reasoning");

    expect(result.id).toBe("test-skill-base-0");
    expect(result.component_ref).toBe("test-skill");
    expect(result.component_type).toBe("skill");
    expect(result.scenario_type).toBe("direct");
    expect(result.user_prompt).toBe("I want to create a hook");
    expect(result.expected_trigger).toBe(true);
    expect(result.expected_component).toBe("test-skill");
    expect(result.reasoning).toBe("Test reasoning");
  });

  it("should omit reasoning when not provided", () => {
    const base = createBaseScenario("test-skill", "skill", "test", "test", 0);

    const result = baseToTestScenario(base, "direct", true);

    expect(result.reasoning).toBeUndefined();
  });
});
