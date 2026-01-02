/**
 * Sanitizer utility for PII filtering in verbose transcript logging.
 *
 * Provides pattern-based redaction of sensitive data from logs and transcripts.
 * Designed for defense-in-depth in security-conscious environments.
 *
 * @module
 */

import type {
  AssistantEvent,
  ToolResultEvent,
  TranscriptEvent,
  UserEvent,
} from "../types/transcript.js";

/**
 * A redaction pattern with name, regex, and replacement string.
 */
export interface RedactionPattern {
  /** Human-readable name for the pattern */
  name: string;
  /** Regex pattern to match (should have 'g' flag) */
  pattern: RegExp;
  /** Replacement string for matches */
  replacement: string;
}

/**
 * Configuration for custom patterns in config.yaml format.
 */
export interface CustomPatternConfig {
  /** Regex pattern string (will be compiled with 'g' flag) */
  pattern: string;
  /** Replacement string for matches */
  replacement: string;
}

/**
 * Sanitization configuration from config.yaml.
 */
export interface SanitizationConfig {
  /** Enable/disable sanitization (default: false for backwards compatibility) */
  enabled: boolean;
  /** Custom redaction patterns to apply */
  custom_patterns?: CustomPatternConfig[];
}

/**
 * Options for creating a sanitizer function.
 */
export interface CreateSanitizerOptions {
  /** Enable/disable sanitization (default: true) */
  enabled?: boolean;
  /** Custom patterns to use (replaces defaults unless mergeWithDefaults) */
  patterns?: RedactionPattern[];
  /** Merge custom patterns with defaults (default: false) */
  mergeWithDefaults?: boolean;
}

/**
 * A sanitizer function that redacts sensitive data from strings.
 */
export type SanitizerFunction = (content: string) => string;

/**
 * Default redaction patterns for common PII types.
 *
 * Patterns are applied in order - more specific patterns should come first.
 */
export const DEFAULT_REDACTION_PATTERNS: RedactionPattern[] = [
  // Anthropic API keys (most specific first)
  {
    name: "anthropic_api_key",
    pattern: /sk-ant-[a-zA-Z0-9_-]+/g,
    replacement: "[REDACTED_ANTHROPIC_KEY]",
  },

  // Generic API keys (32+ alphanumeric chars after sk-)
  {
    name: "generic_api_key",
    pattern: /sk-[a-zA-Z0-9]{32,}/g,
    replacement: "[REDACTED_API_KEY]",
  },

  // JWT tokens (three base64 parts separated by dots)
  {
    name: "jwt_token",
    pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    replacement: "[REDACTED_JWT]",
  },

  // Bearer tokens (case-insensitive)
  {
    name: "bearer_token",
    pattern: /[Bb][Ee][Aa][Rr][Ee][Rr]\s+[a-zA-Z0-9._-]+/g,
    replacement: "Bearer [REDACTED_TOKEN]",
  },

  // Email addresses
  {
    name: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: "[REDACTED_EMAIL]",
  },

  // US phone numbers (XXX-XXX-XXXX, XXX.XXX.XXXX, XXXXXXXXXX)
  {
    name: "phone_us",
    pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    replacement: "[REDACTED_PHONE]",
  },

  // Social Security Numbers (XXX-XX-XXXX)
  {
    name: "ssn",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: "[REDACTED_SSN]",
  },

  // Credit card numbers (XXXX XXXX XXXX XXXX or XXXX-XXXX-XXXX-XXXX)
  {
    name: "credit_card",
    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    replacement: "[REDACTED_CARD]",
  },
];

/**
 * Create a sanitizer function with the specified options.
 *
 * @param options - Configuration options
 * @returns A function that sanitizes strings
 *
 * @example
 * ```typescript
 * // Use default patterns
 * const sanitizer = createSanitizer();
 * console.log(sanitizer("Email: user@example.com"));
 * // Output: "Email: [REDACTED_EMAIL]"
 *
 * // Use custom patterns
 * const customSanitizer = createSanitizer({
 *   patterns: [{ name: "secret", pattern: /SECRET-\w+/g, replacement: "[HIDDEN]" }],
 *   mergeWithDefaults: true
 * });
 * ```
 */
export function createSanitizer(
  options: CreateSanitizerOptions = {},
): SanitizerFunction {
  const { enabled = true, patterns, mergeWithDefaults = false } = options;

  // If disabled, return identity function
  if (!enabled) {
    return (content: string) => content;
  }

  // Determine which patterns to use
  let activePatterns: RedactionPattern[];

  if (patterns && patterns.length > 0) {
    if (mergeWithDefaults) {
      // Custom patterns first, then defaults
      activePatterns = [...patterns, ...DEFAULT_REDACTION_PATTERNS];
    } else {
      // Only custom patterns
      activePatterns = patterns;
    }
  } else {
    // Default patterns only
    activePatterns = DEFAULT_REDACTION_PATTERNS;
  }

  // Return sanitizer function
  return (content: string): string => {
    let sanitized = content;

    for (const { pattern, replacement } of activePatterns) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;
      sanitized = sanitized.replace(pattern, replacement);
    }

    return sanitized;
  };
}

/**
 * Sanitize content using default patterns.
 *
 * Convenience function for one-off sanitization without creating a reusable sanitizer.
 *
 * @param content - String content to sanitize
 * @returns Sanitized string with sensitive data redacted
 *
 * @example
 * ```typescript
 * const clean = sanitizeContent("API key: sk-ant-api03-secret123");
 * // Output: "API key: [REDACTED_ANTHROPIC_KEY]"
 * ```
 */
export function sanitizeContent(content: string): string {
  const sanitizer = createSanitizer();
  return sanitizer(content);
}

/**
 * Type guard for UserEvent.
 */
function isUserEvent(event: TranscriptEvent): event is UserEvent {
  return event.type === "user";
}

/**
 * Type guard for AssistantEvent.
 */
function isAssistantEvent(event: TranscriptEvent): event is AssistantEvent {
  return event.type === "assistant";
}

/**
 * Type guard for ToolResultEvent.
 */
function isToolResultEvent(event: TranscriptEvent): event is ToolResultEvent {
  return event.type === "tool_result";
}

/**
 * Sanitize a transcript event, redacting sensitive data from content.
 *
 * Returns a new event object (does not mutate the original).
 * Preserves event structure, IDs, and metadata.
 *
 * @param event - Transcript event to sanitize
 * @param sanitizer - Optional custom sanitizer function (defaults to default patterns)
 * @returns New event object with sanitized content
 *
 * @example
 * ```typescript
 * const event = {
 *   id: "msg_1",
 *   type: "user",
 *   edit: { message: { role: "user", content: "Email: user@test.com" } }
 * };
 *
 * const sanitized = sanitizeTranscriptEvent(event);
 * // sanitized.edit.message.content === "Email: [REDACTED_EMAIL]"
 * ```
 */
export function sanitizeTranscriptEvent<T extends TranscriptEvent>(
  event: T,
  sanitizer: SanitizerFunction = createSanitizer(),
): T {
  if (isUserEvent(event)) {
    return {
      ...event,
      edit: {
        ...event.edit,
        message: {
          ...event.edit.message,
          content: sanitizer(event.edit.message.content),
        },
      },
    } as T;
  }

  if (isAssistantEvent(event)) {
    return {
      ...event,
      edit: {
        ...event.edit,
        message: {
          ...event.edit.message,
          content: sanitizer(event.edit.message.content),
        },
      },
    } as T;
  }

  if (isToolResultEvent(event)) {
    // Only sanitize if result is a string
    if (typeof event.result === "string") {
      return {
        ...event,
        result: sanitizer(event.result),
      } as T;
    }
    // Non-string results are returned unchanged
    return { ...event } as T;
  }

  // For unknown event types, return a shallow copy unchanged
  return { ...event };
}
