/**
 * Concurrency control utilities.
 * Provides semaphore-based parallel execution.
 */

import { Semaphore } from "async-mutex";

/**
 * Options for parallel execution.
 */
export interface ParallelOptions<T, R> {
  /** Items to process */
  items: T[];
  /** Maximum concurrent executions */
  concurrency: number;
  /** Function to execute for each item */
  fn: (item: T, index: number) => Promise<R>;
  /** Callback on each completion */
  onComplete?: (result: R, index: number, total: number) => void;
  /** Callback on each error */
  onError?: (error: Error, item: T, index: number) => void;
  /** Whether to continue on error */
  continueOnError?: boolean;
}

/**
 * Result of parallel execution.
 */
export interface ParallelResult<R> {
  results: R[];
  errors: { index: number; error: Error }[];
  successCount: number;
  errorCount: number;
}

/**
 * Execute functions in parallel with concurrency control.
 *
 * @param options - Parallel execution options
 * @returns Results and errors
 */
export async function parallel<T, R>(
  options: ParallelOptions<T, R>,
): Promise<ParallelResult<R>> {
  const {
    items,
    concurrency,
    fn,
    onComplete,
    onError,
    continueOnError = true,
  } = options;

  const semaphore = new Semaphore(concurrency);
  const results: (R | undefined)[] = new Array<R | undefined>(items.length);
  const errors: { index: number; error: Error }[] = [];
  let successCount = 0;
  let errorCount = 0;

  const promises = items.map(async (item, index) => {
    const [, release] = await semaphore.acquire();

    try {
      const result = await fn(item, index);
      results[index] = result;
      successCount++;
      onComplete?.(result, index, items.length);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      errors.push({ index, error });
      errorCount++;
      onError?.(error, item, index);

      if (!continueOnError) {
        throw error;
      }
    } finally {
      release();
    }
  });

  if (continueOnError) {
    await Promise.allSettled(promises);
  } else {
    await Promise.all(promises);
  }

  return { results: results as R[], errors, successCount, errorCount };
}

/**
 * Execute functions in parallel, returning only successful results.
 *
 * @param items - Items to process
 * @param fn - Function to execute for each item
 * @param concurrency - Maximum concurrent executions
 * @returns Successful results only
 */
export async function parallelMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const result = await parallel({
    items,
    concurrency,
    fn,
    continueOnError: true,
  });

  // Filter out undefined results from failed items
  return result.results.filter((r): r is R => r !== undefined);
}

/**
 * Execute functions sequentially.
 *
 * @param items - Items to process
 * @param fn - Function to execute for each item
 * @returns Results in order
 */
export async function sequential<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item !== undefined) {
      results.push(await fn(item, i));
    }
  }

  return results;
}

/**
 * Create a rate limiter for API calls.
 *
 * @param requestsPerSecond - Maximum requests per second
 * @returns Function that wraps async functions with rate limiting
 */
export function createRateLimiter(
  requestsPerSecond: number,
): <T>(fn: () => Promise<T>) => Promise<T> {
  const minInterval = 1000 / requestsPerSecond;
  let lastCall = 0;

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall < minInterval) {
      await new Promise((resolve) =>
        setTimeout(resolve, minInterval - timeSinceLastCall),
      );
    }

    lastCall = Date.now();
    return fn();
  };
}

/**
 * Batch items for processing.
 *
 * @param items - Items to batch
 * @param batchSize - Size of each batch
 * @returns Array of batches
 */
export function batch<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  return batches;
}

/**
 * Process items in batches with concurrency control.
 *
 * @param items - Items to process
 * @param batchSize - Items per batch
 * @param fn - Function to process each batch
 * @param concurrency - Maximum concurrent batches
 * @returns Results from all batches
 */
export async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (batch: T[], batchIndex: number) => Promise<R[]>,
  concurrency = 1,
): Promise<R[]> {
  const batches = batch(items, batchSize);
  const batchResults = await parallelMap(batches, fn, concurrency);
  return batchResults.flat();
}
