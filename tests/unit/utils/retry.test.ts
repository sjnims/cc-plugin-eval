import { describe, expect, it, vi } from "vitest";

import {
  calculateDelay,
  createRetryWrapper,
  isTransientError,
  withRetry,
} from "../../../src/utils/retry.js";

describe("isTransientError", () => {
  it("identifies rate limit errors", () => {
    const error = new Error("Rate limit exceeded");
    expect(isTransientError(error)).toBe(true);

    const error2 = new Error("Too many requests");
    expect(isTransientError(error2)).toBe(true);
  });

  it("identifies server errors", () => {
    const error = new Error("500 Internal Server Error");
    expect(isTransientError(error)).toBe(true);

    const error2 = new Error("502 Bad Gateway");
    expect(isTransientError(error2)).toBe(true);
  });

  it("identifies network errors", () => {
    const error = new Error("Network error");
    expect(isTransientError(error)).toBe(true);

    const error2 = new Error("ECONNRESET");
    expect(isTransientError(error2)).toBe(true);
  });

  it("identifies Anthropic-specific errors", () => {
    const error = new Error("API overloaded");
    expect(isTransientError(error)).toBe(true);
  });

  it("returns false for non-transient errors", () => {
    const error = new Error("Invalid API key");
    expect(isTransientError(error)).toBe(false);
  });

  it("checks status codes", () => {
    const error429 = { status: 429, message: "Error" };
    expect(isTransientError(error429)).toBe(true);

    const error500 = { statusCode: 500, message: "Error" };
    expect(isTransientError(error500)).toBe(true);

    const error400 = { status: 400, message: "Error" };
    expect(isTransientError(error400)).toBe(false);
  });
});

describe("calculateDelay", () => {
  it("calculates exponential backoff", () => {
    const options = {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      jitterFactor: 0,
    };

    expect(calculateDelay(0, options)).toBe(1000);
    expect(calculateDelay(1, options)).toBe(2000);
    expect(calculateDelay(2, options)).toBe(4000);
  });

  it("caps at max delay", () => {
    const options = {
      maxRetries: 10,
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      backoffMultiplier: 2,
      jitterFactor: 0,
    };

    expect(calculateDelay(5, options)).toBe(5000);
    expect(calculateDelay(10, options)).toBe(5000);
  });
});

describe("withRetry", () => {
  it("returns result on success", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    const result = await withRetry(fn);

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on transient error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Rate limit"))
      .mockResolvedValueOnce("success");

    const result = await withRetry(fn, {
      initialDelayMs: 10,
      maxRetries: 3,
    });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after max retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Rate limit"));

    await expect(
      withRetry(fn, { maxRetries: 2, initialDelayMs: 10 }),
    ).rejects.toThrow("Rate limit");

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-transient errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Invalid API key"));

    await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow(
      "Invalid API key",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calls onRetry callback", async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Rate limit"))
      .mockResolvedValueOnce("success");

    await withRetry(fn, { onRetry, initialDelayMs: 10 });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      expect.any(Error),
      1,
      expect.any(Number),
    );
  });
});

describe("createRetryWrapper", () => {
  it("creates a reusable retry function", async () => {
    const retry = createRetryWrapper({ maxRetries: 2, initialDelayMs: 10 });
    const fn = vi.fn().mockResolvedValue("result");

    const result = await retry(fn);
    expect(result).toBe("result");
  });
});
