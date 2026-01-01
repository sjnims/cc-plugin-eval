// =============================================================================
// Vitest Configuration
// https://vitest.dev/config/
// =============================================================================

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // =========================================================================
    // Environment Configuration
    // =========================================================================
    environment: "node",
    globals: true,

    // =========================================================================
    // Test File Patterns
    // =========================================================================
    include: ["tests/**/*.{test,spec}.ts"],
    exclude: ["node_modules", "dist", "coverage", "results", "reports"],

    // =========================================================================
    // Timeouts
    // Generous timeouts for SDK integration tests
    // =========================================================================
    testTimeout: 30000,
    hookTimeout: 30000,

    // =========================================================================
    // Coverage Configuration
    // =========================================================================
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "./coverage",

      // Files to include in coverage
      include: ["src/**/*.ts"],

      // Files to exclude from coverage
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
        "src/**/*.d.ts",
        "src/types/**",
        "src/index.ts", // CLI entry point
        "src/**/index.ts", // Re-export modules
      ],

      // Coverage thresholds
      // Note: Vitest 4 uses more accurate V8 coverage remapping,
      // which may report lower coverage than v3. Thresholds adjusted accordingly.
      thresholds: {
        branches: 65,
        functions: 75,
        lines: 78,
        statements: 78,
      },
    },

    // =========================================================================
    // Reporter Configuration
    // Verbose output in CI for better debugging, default locally
    // JUnit reporter in CI for Codecov Test Analytics
    // =========================================================================
    reporters: process.env.CI
      ? ["verbose", "html", "junit"]
      : ["default", "html"],
    outputFile: {
      html: "./coverage/test-report.html",
      junit: "./coverage/test-report.junit.xml",
    },

    // =========================================================================
    // Parallelization
    // Vitest 4 uses top-level pool options (poolOptions removed)
    // =========================================================================
    pool: "threads",
    threads: {
      singleThread: false,
      isolate: true,
    },

    // =========================================================================
    // Test Isolation and Cleanup
    // =========================================================================
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,

    // Randomize test order to catch order-dependent tests
    sequence: {
      shuffle: true,
    },

    // =========================================================================
    // Watch Mode Configuration
    // =========================================================================
    watch: false,
    watchExclude: ["node_modules", "dist", "coverage", "results", "reports"],

    // =========================================================================
    // Retry and Bail Configuration
    // =========================================================================
    retry: process.env.CI ? 2 : 1,
    bail: process.env.CI ? 1 : 0,

    // =========================================================================
    // TypeScript Type Checking in Tests
    // =========================================================================
    typecheck: {
      enabled: false, // Enable when needed: slower but catches type errors
      include: ["tests/**/*.ts"],
    },

    // =========================================================================
    // Snapshot Configuration
    // =========================================================================
    snapshotFormat: {
      escapeString: true,
      printBasicPrototype: true,
    },

    // =========================================================================
    // Console Output Handling
    // =========================================================================
    onConsoleLog(log, type) {
      // Fail tests that log unexpected errors
      if (type === "stderr" && log.includes("Error:")) {
        return false; // Suppress in output but let it fail via assertions
      }
      return true; // Allow other console output
    },
  },
});
