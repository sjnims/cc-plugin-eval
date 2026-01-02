/**
 * Retry utility with exponential backoff.
 * Handles transient API errors gracefully.
 */

import { DEFAULT_TUNING } from "../config/defaults.js";

import type { TuningConfig } from "../types/index.js";

/**
 * Retry options.
 */
export interface RetryOptions {
  /** Maximum number of retries */
  maxRetries: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Jitter factor (0-1) to add randomness */
  jitterFactor: number;
  /** Function to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Callback on retry */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/**
 * Default retry options.
 * Values are sourced from DEFAULT_TUNING for centralized configuration.
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: DEFAULT_TUNING.retry.max_retries,
  initialDelayMs: DEFAULT_TUNING.timeouts.retry_initial_ms,
  maxDelayMs: DEFAULT_TUNING.timeouts.retry_max_ms,
  backoffMultiplier: DEFAULT_TUNING.retry.backoff_multiplier,
  jitterFactor: DEFAULT_TUNING.retry.jitter_factor,
  isRetryable: isTransientError,
};

/**
 * Create retry options from tuning configuration.
 *
 * @param tuning - Tuning configuration
 * @returns Retry options based on tuning config
 */
export function createRetryOptionsFromTuning(
  tuning: TuningConfig,
): RetryOptions {
  return {
    maxRetries: tuning.retry.max_retries,
    initialDelayMs: tuning.timeouts.retry_initial_ms,
    maxDelayMs: tuning.timeouts.retry_max_ms,
    backoffMultiplier: tuning.retry.backoff_multiplier,
    jitterFactor: tuning.retry.jitter_factor,
    isRetryable: isTransientError,
  };
}

/**
 * Determine if an error is transient and retryable.
 *
 * @param error - The error to check
 * @returns True if the error is transient
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Rate limiting
    if (
      message.includes("rate limit") ||
      message.includes("too many requests")
    ) {
      return true;
    }

    // Server errors (5xx)
    if (
      message.includes("500") ||
      message.includes("502") ||
      message.includes("503") ||
      message.includes("504")
    ) {
      return true;
    }

    // Network errors
    if (
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("econnreset") ||
      message.includes("econnrefused") ||
      message.includes("socket hang up")
    ) {
      return true;
    }

    // Anthropic-specific transient errors
    if (
      message.includes("overloaded") ||
      message.includes("temporarily unavailable")
    ) {
      return true;
    }
  }

  // Check for status code in error object
  const errorWithStatus = error as { status?: number; statusCode?: number };
  const status = errorWithStatus.status ?? errorWithStatus.statusCode;
  if (typeof status === "number") {
    // Retry on rate limit (429) and server errors (5xx)
    return status === 429 || (status >= 500 && status < 600);
  }

  return false;
}

/**
 * Calculate delay for a retry attempt with exponential backoff and jitter.
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param options - Retry options
 * @returns Delay in milliseconds
 */
export function calculateDelay(attempt: number, options: RetryOptions): number {
  // Exponential backoff
  const exponentialDelay =
    options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);

  // Add jitter
  const jitter = cappedDelay * options.jitterFactor * Math.random();

  return Math.floor(cappedDelay + jitter);
}

/**
 * Sleep for a given duration.
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the delay
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic.
 *
 * @param fn - Function to execute
 * @param options - Retry options (optional)
 * @returns Result of the function
 * @throws Last error if all retries are exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const shouldRetry =
        attempt < opts.maxRetries &&
        (opts.isRetryable?.(error) ?? isTransientError(error));

      if (!shouldRetry) {
        throw error;
      }

      // Calculate delay
      const delayMs = calculateDelay(attempt, opts);

      // Call retry callback
      opts.onRetry?.(error, attempt + 1, delayMs);

      // Wait before retrying
      await sleep(delayMs);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Create a retry wrapper with preset options.
 *
 * @param options - Retry options
 * @returns Function that wraps another function with retry logic
 */
export function createRetryWrapper(
  options: Partial<RetryOptions> = {},
): <T>(fn: () => Promise<T>) => Promise<T> {
  return async <T>(fn: () => Promise<T>): Promise<T> => withRetry(fn, options);
}
