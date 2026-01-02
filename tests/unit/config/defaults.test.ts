/**
 * Unit tests for config/defaults.ts
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_TUNING,
  getResolvedTuning,
} from "../../../src/config/defaults.js";

describe("getResolvedTuning", () => {
  it("returns DEFAULT_TUNING when input is undefined", () => {
    const result = getResolvedTuning(undefined);

    expect(result).toEqual(DEFAULT_TUNING);
  });

  it("returns DEFAULT_TUNING when input is empty object", () => {
    const result = getResolvedTuning({});

    expect(result).toEqual(DEFAULT_TUNING);
  });

  it("merges partial timeout overrides with defaults", () => {
    const result = getResolvedTuning({
      timeouts: { plugin_load_ms: 45000 },
    });

    expect(result.timeouts.plugin_load_ms).toBe(45000);
    expect(result.timeouts.retry_initial_ms).toBe(
      DEFAULT_TUNING.timeouts.retry_initial_ms,
    );
    expect(result.retry).toEqual(DEFAULT_TUNING.retry);
  });

  it("merges partial retry overrides with defaults", () => {
    const result = getResolvedTuning({
      retry: { max_retries: 5, backoff_multiplier: 3 },
    });

    expect(result.retry.max_retries).toBe(5);
    expect(result.retry.backoff_multiplier).toBe(3);
    expect(result.retry.jitter_factor).toBe(DEFAULT_TUNING.retry.jitter_factor);
    expect(result.timeouts).toEqual(DEFAULT_TUNING.timeouts);
  });

  it("merges partial token_estimates overrides with defaults", () => {
    const result = getResolvedTuning({
      token_estimates: {
        per_skill: 700,
        semantic_gen_max_tokens: 1200,
      },
    });

    expect(result.token_estimates.per_skill).toBe(700);
    expect(result.token_estimates.semantic_gen_max_tokens).toBe(1200);
    expect(result.token_estimates.per_agent).toBe(
      DEFAULT_TUNING.token_estimates.per_agent,
    );
  });

  it("merges multiple section overrides simultaneously", () => {
    const result = getResolvedTuning({
      timeouts: { plugin_load_ms: 60000 },
      retry: { max_retries: 10 },
      limits: { progress_bar_width: 30 },
    });

    expect(result.timeouts.plugin_load_ms).toBe(60000);
    expect(result.retry.max_retries).toBe(10);
    expect(result.limits.progress_bar_width).toBe(30);
    // Other values should be defaults
    expect(result.batching).toEqual(DEFAULT_TUNING.batching);
    expect(result.token_estimates).toEqual(DEFAULT_TUNING.token_estimates);
  });

  it("deep merges nested config without losing unspecified fields", () => {
    const result = getResolvedTuning({
      limits: { prompt_display_length: 100 },
    });

    // Specified field should be overridden
    expect(result.limits.prompt_display_length).toBe(100);
    // Other fields in same section should keep defaults
    expect(result.limits.progress_bar_width).toBe(
      DEFAULT_TUNING.limits.progress_bar_width,
    );
    expect(result.limits.transcript_content_length).toBe(
      DEFAULT_TUNING.limits.transcript_content_length,
    );
    expect(result.limits.conflict_domain_part_min).toBe(
      DEFAULT_TUNING.limits.conflict_domain_part_min,
    );
  });

  it("handles complete tuning config override", () => {
    const customTuning = {
      timeouts: {
        plugin_load_ms: 50000,
        retry_initial_ms: 500,
        retry_max_ms: 60000,
      },
      retry: { max_retries: 5, backoff_multiplier: 3, jitter_factor: 0.2 },
      token_estimates: {
        output_per_scenario: 900,
        transcript_prompt: 3500,
        judge_output: 600,
        input_per_turn: 600,
        output_per_turn: 2500,
        per_skill: 700,
        per_agent: 900,
        per_command: 350,
        semantic_gen_max_tokens: 1200,
      },
      limits: {
        transcript_content_length: 600,
        prompt_display_length: 100,
        progress_bar_width: 25,
        conflict_domain_part_min: 5,
      },
      batching: { safety_margin: 0.8 },
    };

    const result = getResolvedTuning(customTuning);

    expect(result).toEqual(customTuning);
  });
});
