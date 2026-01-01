import { describe, expect, it } from "vitest";

import {
  calculateCost,
  formatCost,
  getModelPricing,
  MODEL_PRICING,
} from "../../../src/config/pricing.js";

describe("getModelPricing", () => {
  it("returns pricing for known models", () => {
    const opusPricing = getModelPricing("claude-opus-4-5-20251101");
    expect(opusPricing.input).toBe(15.0);
    expect(opusPricing.output).toBe(75.0);

    const sonnetPricing = getModelPricing("claude-sonnet-4-5-20250929");
    expect(sonnetPricing.input).toBe(3.0);
    expect(sonnetPricing.output).toBe(15.0);
  });

  it("returns default pricing for unknown models", () => {
    const unknownPricing = getModelPricing("unknown-model");
    expect(unknownPricing.input).toBe(3.0);
    expect(unknownPricing.output).toBe(15.0);
  });
});

describe("calculateCost", () => {
  it("calculates cost for opus model", () => {
    // 1M input tokens at $15/M + 1M output tokens at $75/M = $90
    const cost = calculateCost(
      "claude-opus-4-5-20251101",
      1_000_000,
      1_000_000,
    );
    expect(cost).toBe(90);
  });

  it("calculates cost for smaller token counts", () => {
    // 10K input at $3/M + 5K output at $15/M
    // = 0.01 * 3 + 0.005 * 15 = 0.03 + 0.075 = 0.105
    const cost = calculateCost("claude-sonnet-4-5-20250929", 10_000, 5_000);
    expect(cost).toBeCloseTo(0.105);
  });

  it("handles zero tokens", () => {
    const cost = calculateCost("claude-sonnet-4-5-20250929", 0, 0);
    expect(cost).toBe(0);
  });
});

describe("formatCost", () => {
  it("formats small costs with 4 decimal places", () => {
    expect(formatCost(0.001)).toBe("$0.0010");
    expect(formatCost(0.0001)).toBe("$0.0001");
  });

  it("formats regular costs with 2 decimal places", () => {
    expect(formatCost(1.5)).toBe("$1.50");
    expect(formatCost(10.0)).toBe("$10.00");
  });
});

describe("MODEL_PRICING", () => {
  it("contains expected models", () => {
    expect(MODEL_PRICING).toHaveProperty("claude-opus-4-5-20251101");
    expect(MODEL_PRICING).toHaveProperty("claude-sonnet-4-5-20250929");
    expect(MODEL_PRICING).toHaveProperty("claude-sonnet-4-20250514");
    expect(MODEL_PRICING).toHaveProperty("claude-haiku-3-5-20250929");
  });
});
