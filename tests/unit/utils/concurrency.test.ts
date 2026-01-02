import { describe, expect, it, vi } from "vitest";

import {
  batch,
  createRateLimiter,
  parallel,
  parallelMap,
  sequential,
} from "../../../src/utils/concurrency.js";

describe("parallel", () => {
  it("executes items with concurrency limit", async () => {
    const items = [1, 2, 3, 4, 5];
    const fn = vi.fn().mockImplementation(async (x: number) => x * 2);

    const result = await parallel({
      items,
      concurrency: 2,
      fn,
    });

    expect(result.results).toEqual([2, 4, 6, 8, 10]);
    expect(result.successCount).toBe(5);
    expect(result.errorCount).toBe(0);
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it("handles errors with continueOnError", async () => {
    const items = [1, 2, 3];
    const fn = vi.fn().mockImplementation(async (x: number) => {
      if (x === 2) {
        throw new Error("Error on 2");
      }
      return x;
    });

    const result = await parallel({
      items,
      concurrency: 1,
      fn,
      continueOnError: true,
    });

    expect(result.successCount).toBe(2);
    expect(result.errorCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.index).toBe(1);
  });

  it("calls callbacks", async () => {
    const onComplete = vi.fn();
    const onError = vi.fn();
    const items = [1, 2];

    await parallel({
      items,
      concurrency: 2,
      fn: async (x) => x,
      onComplete,
      onError,
    });

    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("parallelMap", () => {
  it("returns only successful results", async () => {
    const items = [1, 2, 3];
    const fn = async (x: number) => {
      if (x === 2) {
        throw new Error("Skip");
      }
      return x * 2;
    };

    const results = await parallelMap(items, fn, 2);

    expect(results).toHaveLength(2);
    expect(results).toContain(2);
    expect(results).toContain(6);
  });
});

describe("sequential", () => {
  it("executes items in order", async () => {
    const order: number[] = [];
    const items = [1, 2, 3];

    await sequential(items, async (x) => {
      order.push(x);
      return x;
    });

    expect(order).toEqual([1, 2, 3]);
  });
});

describe("batch", () => {
  it("splits items into batches", () => {
    const items = [1, 2, 3, 4, 5];
    const batches = batch(items, 2);

    expect(batches).toHaveLength(3);
    expect(batches[0]).toEqual([1, 2]);
    expect(batches[1]).toEqual([3, 4]);
    expect(batches[2]).toEqual([5]);
  });

  it("handles empty array", () => {
    const batches = batch([], 2);
    expect(batches).toHaveLength(0);
  });

  it("handles batch size larger than array", () => {
    const items = [1, 2];
    const batches = batch(items, 10);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual([1, 2]);
  });
});

describe("createRateLimiter", () => {
  it("returns a function that wraps async functions", async () => {
    const rateLimiter = createRateLimiter(10);
    const fn = vi.fn().mockResolvedValue("result");

    const result = await rateLimiter(fn);

    expect(result).toBe("result");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("enforces minimum interval between calls", async () => {
    // 2 requests per second = 500ms minimum interval
    const rateLimiter = createRateLimiter(2);
    const timestamps: number[] = [];

    const fn = vi.fn().mockImplementation(async () => {
      timestamps.push(Date.now());
      return "done";
    });

    // Make 3 rapid calls sequentially
    await rateLimiter(fn);
    await rateLimiter(fn);
    await rateLimiter(fn);

    expect(timestamps).toHaveLength(3);

    // Check intervals (allowing 50ms tolerance for timing)
    const interval1 = timestamps[1]! - timestamps[0]!;
    const interval2 = timestamps[2]! - timestamps[1]!;

    expect(interval1).toBeGreaterThanOrEqual(450); // 500ms - 50ms tolerance
    expect(interval2).toBeGreaterThanOrEqual(450);
  });

  it("allows immediate execution when enough time has passed", async () => {
    // High RPS means short interval
    const rateLimiter = createRateLimiter(100); // 10ms interval
    const fn = vi.fn().mockResolvedValue("fast");

    const start = Date.now();
    await rateLimiter(fn);
    const end = Date.now();

    // First call should be nearly immediate
    expect(end - start).toBeLessThan(50);
  });

  it("propagates errors from wrapped function", async () => {
    const rateLimiter = createRateLimiter(10);
    const error = new Error("Test error");
    const fn = vi.fn().mockRejectedValue(error);

    await expect(rateLimiter(fn)).rejects.toThrow("Test error");
  });

  it("handles different return types", async () => {
    const rateLimiter = createRateLimiter(10);

    const numberFn = vi.fn().mockResolvedValue(42);
    const objectFn = vi.fn().mockResolvedValue({ key: "value" });
    const arrayFn = vi.fn().mockResolvedValue([1, 2, 3]);

    expect(await rateLimiter(numberFn)).toBe(42);
    expect(await rateLimiter(objectFn)).toEqual({ key: "value" });
    expect(await rateLimiter(arrayFn)).toEqual([1, 2, 3]);
  });
});
