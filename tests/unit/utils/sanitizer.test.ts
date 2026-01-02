import { describe, expect, it } from "vitest";

import {
  createSanitizer,
  DEFAULT_REDACTION_PATTERNS,
  sanitizeContent,
  sanitizeTranscriptEvent,
  type RedactionPattern,
  type SanitizationConfig,
} from "../../../src/utils/sanitizer.js";

describe("DEFAULT_REDACTION_PATTERNS", () => {
  it("includes common PII patterns", () => {
    expect(DEFAULT_REDACTION_PATTERNS.length).toBeGreaterThan(0);

    const patternNames = DEFAULT_REDACTION_PATTERNS.map((p) => p.name);
    expect(patternNames).toContain("anthropic_api_key");
    expect(patternNames).toContain("generic_api_key");
    expect(patternNames).toContain("email");
    expect(patternNames).toContain("phone_us");
    expect(patternNames).toContain("bearer_token");
    expect(patternNames).toContain("jwt_token");
  });
});

describe("sanitizeContent", () => {
  describe("API key patterns", () => {
    it("redacts Anthropic API keys", () => {
      const input = "My key is sk-ant-api03-abc123xyz456-789";
      const result = sanitizeContent(input);
      expect(result).toBe("My key is [REDACTED_ANTHROPIC_KEY]");
      expect(result).not.toContain("sk-ant-");
    });

    it("redacts generic API keys (32+ chars)", () => {
      const input = "API key: sk-abcdefghijklmnopqrstuvwxyz123456";
      const result = sanitizeContent(input);
      expect(result).toBe("API key: [REDACTED_API_KEY]");
    });

    it("handles multiple API keys in same string", () => {
      const input = "Key1: sk-ant-api03-abc123 and Key2: sk-ant-api03-def456";
      const result = sanitizeContent(input);
      expect(result).not.toContain("sk-ant-");
      expect(result.match(/\[REDACTED_ANTHROPIC_KEY\]/g)?.length).toBe(2);
    });
  });

  describe("email patterns", () => {
    it("redacts email addresses", () => {
      const input = "Contact user@example.com for support";
      const result = sanitizeContent(input);
      expect(result).toBe("Contact [REDACTED_EMAIL] for support");
    });

    it("redacts emails with subdomains", () => {
      const input = "Email: test.user+tag@mail.example.co.uk";
      const result = sanitizeContent(input);
      expect(result).toBe("Email: [REDACTED_EMAIL]");
    });

    it("handles multiple emails", () => {
      const input = "From: alice@test.com To: bob@example.org";
      const result = sanitizeContent(input);
      expect(result.match(/\[REDACTED_EMAIL\]/g)?.length).toBe(2);
    });
  });

  describe("phone patterns", () => {
    it("redacts US phone numbers with dashes", () => {
      const input = "Call 555-123-4567 for help";
      const result = sanitizeContent(input);
      expect(result).toBe("Call [REDACTED_PHONE] for help");
    });

    it("redacts phone numbers with dots", () => {
      const input = "Phone: 555.123.4567";
      const result = sanitizeContent(input);
      expect(result).toBe("Phone: [REDACTED_PHONE]");
    });

    it("redacts phone numbers without separators", () => {
      const input = "Number is 5551234567";
      const result = sanitizeContent(input);
      expect(result).toBe("Number is [REDACTED_PHONE]");
    });
  });

  describe("bearer token patterns", () => {
    it("redacts Bearer tokens", () => {
      const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.token";
      const result = sanitizeContent(input);
      expect(result).toBe("Authorization: Bearer [REDACTED_TOKEN]");
    });

    it("is case insensitive for Bearer keyword", () => {
      const input = "BEARER abc123.def456";
      const result = sanitizeContent(input);
      expect(result).toBe("Bearer [REDACTED_TOKEN]");
    });
  });

  describe("JWT token patterns", () => {
    it("redacts JWT tokens", () => {
      const jwt =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N";
      const input = `Token: ${jwt}`;
      const result = sanitizeContent(input);
      expect(result).toBe("Token: [REDACTED_JWT]");
    });
  });

  describe("SSN patterns", () => {
    it("redacts SSN format XXX-XX-XXXX", () => {
      const input = "SSN: 123-45-6789";
      const result = sanitizeContent(input);
      expect(result).toBe("SSN: [REDACTED_SSN]");
    });
  });

  describe("credit card patterns", () => {
    it("redacts credit card numbers with spaces", () => {
      const input = "Card: 4111 1111 1111 1111";
      const result = sanitizeContent(input);
      expect(result).toBe("Card: [REDACTED_CARD]");
    });

    it("redacts credit card numbers with dashes", () => {
      const input = "Card: 4111-1111-1111-1111";
      const result = sanitizeContent(input);
      expect(result).toBe("Card: [REDACTED_CARD]");
    });
  });

  describe("edge cases", () => {
    it("returns empty string for empty input", () => {
      expect(sanitizeContent("")).toBe("");
    });

    it("returns unchanged content when no patterns match", () => {
      const input = "This is just normal text without sensitive data.";
      expect(sanitizeContent(input)).toBe(input);
    });

    it("handles multiline content", () => {
      const input = `Line 1: user@test.com
Line 2: 555-123-4567
Line 3: sk-ant-api03-key123`;
      const result = sanitizeContent(input);
      expect(result).toContain("[REDACTED_EMAIL]");
      expect(result).toContain("[REDACTED_PHONE]");
      expect(result).toContain("[REDACTED_ANTHROPIC_KEY]");
    });
  });
});

describe("createSanitizer", () => {
  it("creates a sanitizer with default patterns", () => {
    const sanitizer = createSanitizer();
    const result = sanitizer("Email: test@example.com");
    expect(result).toBe("Email: [REDACTED_EMAIL]");
  });

  it("uses custom patterns when provided", () => {
    const customPatterns: RedactionPattern[] = [
      {
        name: "custom_secret",
        pattern: /SECRET-\w+/g,
        replacement: "[CUSTOM_REDACTED]",
      },
    ];
    const sanitizer = createSanitizer({ patterns: customPatterns });

    // Custom pattern should work
    expect(sanitizer("Code: SECRET-abc123")).toBe("Code: [CUSTOM_REDACTED]");

    // Default patterns should NOT be applied when custom patterns provided
    expect(sanitizer("Email: test@example.com")).toBe(
      "Email: test@example.com",
    );
  });

  it("merges custom patterns with defaults when mergeWithDefaults is true", () => {
    const customPatterns: RedactionPattern[] = [
      {
        name: "custom_secret",
        pattern: /SECRET-\w+/g,
        replacement: "[CUSTOM_REDACTED]",
      },
    ];
    const sanitizer = createSanitizer({
      patterns: customPatterns,
      mergeWithDefaults: true,
    });

    // Both custom and default patterns should work
    expect(sanitizer("Code: SECRET-abc123")).toBe("Code: [CUSTOM_REDACTED]");
    expect(sanitizer("Email: test@example.com")).toBe(
      "Email: [REDACTED_EMAIL]",
    );
  });

  it("returns identity function when disabled", () => {
    const sanitizer = createSanitizer({ enabled: false });
    const sensitiveInput = "My key is sk-ant-api03-secret123";
    expect(sanitizer(sensitiveInput)).toBe(sensitiveInput);
  });

  it("accepts SanitizationConfig from config.yaml format", () => {
    const config: SanitizationConfig = {
      enabled: true,
      custom_patterns: [
        { pattern: "INTERNAL-\\w+", replacement: "[INTERNAL]" },
      ],
    };
    const sanitizer = createSanitizer({
      enabled: config.enabled,
      patterns: config.custom_patterns?.map((p) => ({
        name: "custom",
        pattern: new RegExp(p.pattern, "g"),
        replacement: p.replacement,
      })),
      mergeWithDefaults: true,
    });

    expect(sanitizer("Code: INTERNAL-abc123")).toBe("Code: [INTERNAL]");
    expect(sanitizer("Email: test@example.com")).toBe(
      "Email: [REDACTED_EMAIL]",
    );
  });
});

describe("sanitizeTranscriptEvent", () => {
  it("sanitizes user message content", () => {
    const event = {
      id: "msg_1",
      type: "user" as const,
      edit: {
        message: {
          role: "user" as const,
          content: "My email is test@example.com",
        },
      },
    };

    const result = sanitizeTranscriptEvent(event);

    expect(result.edit.message.content).toBe("My email is [REDACTED_EMAIL]");
    // Verify it's a new object, not mutated
    expect(event.edit.message.content).toBe("My email is test@example.com");
  });

  it("sanitizes assistant message content", () => {
    const event = {
      id: "msg_2",
      type: "assistant" as const,
      edit: {
        message: {
          role: "assistant" as const,
          content: "Your API key sk-ant-api03-abc123 is valid",
          tool_calls: [],
        },
      },
    };

    const result = sanitizeTranscriptEvent(event);

    expect(result.edit.message.content).toBe(
      "Your API key [REDACTED_ANTHROPIC_KEY] is valid",
    );
  });

  it("sanitizes tool_result content when result is a string", () => {
    const event = {
      id: "tool_1",
      type: "tool_result" as const,
      tool_use_id: "tu_1",
      result: "Found user email: user@domain.com",
    };

    const result = sanitizeTranscriptEvent(event);

    expect(result.result).toBe("Found user email: [REDACTED_EMAIL]");
  });

  it("preserves non-string tool_result unchanged", () => {
    const event = {
      id: "tool_2",
      type: "tool_result" as const,
      tool_use_id: "tu_2",
      result: { success: true, count: 42 },
    };

    const result = sanitizeTranscriptEvent(event);

    expect(result.result).toEqual({ success: true, count: 42 });
  });

  it("preserves event structure and IDs", () => {
    const event = {
      id: "msg_123",
      type: "user" as const,
      edit: {
        message: {
          role: "user" as const,
          content: "test@example.com",
        },
      },
    };

    const result = sanitizeTranscriptEvent(event);

    expect(result.id).toBe("msg_123");
    expect(result.type).toBe("user");
    expect(result.edit.message.role).toBe("user");
  });

  it("uses custom sanitizer when provided", () => {
    const customSanitizer = createSanitizer({
      patterns: [
        {
          name: "custom",
          pattern: /SECRET/g,
          replacement: "[HIDDEN]",
        },
      ],
    });

    const event = {
      id: "msg_1",
      type: "user" as const,
      edit: {
        message: {
          role: "user" as const,
          content: "The SECRET is hidden",
        },
      },
    };

    const result = sanitizeTranscriptEvent(event, customSanitizer);

    expect(result.edit.message.content).toBe("The [HIDDEN] is hidden");
  });

  it("handles null/undefined content gracefully", () => {
    // Content as empty string (valid but edge case)
    const event = {
      id: "msg_1",
      type: "user" as const,
      edit: {
        message: {
          role: "user" as const,
          content: "",
        },
      },
    };

    const result = sanitizeTranscriptEvent(event);
    expect(result.edit.message.content).toBe("");
  });

  it("handles unknown event types gracefully", () => {
    // Create an event with a type that doesn't match user/assistant/tool_result
    const unknownEvent = {
      id: "unknown_1",
      type: "system" as const,
      data: { message: "System notification" },
    };

    // Cast to TranscriptEvent to test the fallback path
    const result = sanitizeTranscriptEvent(
      unknownEvent as unknown as Parameters<typeof sanitizeTranscriptEvent>[0],
    );

    // Should return a shallow copy unchanged
    expect(result).toEqual(unknownEvent);
    expect(result).not.toBe(unknownEvent); // Verify it's a new object
  });
});
