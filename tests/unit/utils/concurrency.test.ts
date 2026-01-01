import { describe, expect, it, vi } from "vitest";

import {
  batch,
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
