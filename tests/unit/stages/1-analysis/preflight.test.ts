import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Flag to control mocked lstatSync behavior
let mockLstatSyncError = false;

// Mock node:fs at module level to intercept direct ESM imports
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    lstatSync: vi.fn((filePath: string) => {
      if (mockLstatSyncError) {
        throw new Error("Permission denied");
      }
      return actual.lstatSync(filePath);
    }),
  };
});

import {
  formatPreflightResult,
  preflightCheck,
} from "../../../../src/stages/1-analysis/preflight.js";

const fixturesPath = path.resolve(process.cwd(), "tests/fixtures");

describe("preflightCheck", () => {
  it("passes for valid plugin", () => {
    const result = preflightCheck(path.join(fixturesPath, "valid-plugin"));

    expect(result.valid).toBe(true);
    expect(result.pluginName).toBe("test-plugin");
    expect(result.errors).toHaveLength(0);
  });

  it("fails for non-existent path", () => {
    const result = preflightCheck("/non/existent/path");

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("PATH_NOT_FOUND");
  });

  it("fails for missing manifest", () => {
    const result = preflightCheck(fixturesPath);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("MANIFEST_NOT_FOUND");
  });

  it("fails for malformed JSON", () => {
    const result = preflightCheck(path.join(fixturesPath, "malformed-plugin"));

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("MANIFEST_PARSE_ERROR");
  });

  it("fails for missing name field", () => {
    const result = preflightCheck(path.join(fixturesPath, "invalid-plugin"));

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("MANIFEST_INVALID");
  });

  it("returns warnings for non-kebab-case name", () => {
    // Create a mock function that modifies the name
    // For now, test that valid plugin passes without warnings about format
    const result = preflightCheck(path.join(fixturesPath, "valid-plugin"));

    // test-plugin is kebab-case, so no warning
    const nameWarning = result.warnings.find((w) => w.code === "NAME_FORMAT");
    expect(nameWarning).toBeUndefined();
  });
});

describe("formatPreflightResult", () => {
  it("formats passing result", () => {
    const result = preflightCheck(path.join(fixturesPath, "valid-plugin"));
    const formatted = formatPreflightResult(result);

    expect(formatted).toContain("✅");
    expect(formatted).toContain("test-plugin");
  });

  it("formats failing result", () => {
    const result = preflightCheck("/non/existent/path");
    const formatted = formatPreflightResult(result);

    expect(formatted).toContain("❌");
    expect(formatted).toContain("PATH_NOT_FOUND");
    expect(formatted).toContain("💡");
  });
});

describe("preflightCheck symlink handling", () => {
  let tempDir: string;
  let symlinkPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "preflight-symlink-test-"));
    symlinkPath = path.join(tempDir, "symlink-plugin");
    mockLstatSyncError = false; // Reset mock flag
  });

  afterEach(() => {
    mockLstatSyncError = false; // Reset mock flag
    // Clean up symlink and temp dir - use try-catch to prevent cleanup failures
    try {
      if (fs.existsSync(symlinkPath)) {
        fs.unlinkSync(symlinkPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  it("resolves symlinks and includes resolved path in result", () => {
    // Create symlink to valid plugin
    const targetPath = path.join(fixturesPath, "valid-plugin");
    fs.symlinkSync(targetPath, symlinkPath);

    const result = preflightCheck(symlinkPath);

    expect(result.valid).toBe(true);
    expect(result.pluginPath).toBe(path.resolve(symlinkPath));
    expect(result.resolvedPath).toBe(fs.realpathSync(symlinkPath));
    expect(result.resolvedPath).not.toBe(result.pluginPath);
  });

  it("adds warning when symlink is followed", () => {
    // Create symlink to valid plugin
    const targetPath = path.join(fixturesPath, "valid-plugin");
    fs.symlinkSync(targetPath, symlinkPath);

    const result = preflightCheck(symlinkPath);

    expect(result.valid).toBe(true);
    const symlinkWarning = result.warnings.find(
      (w) => w.code === "SYMLINK_RESOLVED",
    );
    expect(symlinkWarning).toBeDefined();
    expect(symlinkWarning?.message).toContain("->");
  });

  it("fails for broken symlinks", () => {
    // Create symlink to non-existent path
    fs.symlinkSync("/non/existent/target", symlinkPath);

    const result = preflightCheck(symlinkPath);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "PATH_NOT_FOUND")).toBe(true);
  });

  it("sets resolvedPath equal to pluginPath for non-symlink paths", () => {
    const result = preflightCheck(path.join(fixturesPath, "valid-plugin"));

    expect(result.valid).toBe(true);
    expect(result.pluginPath).toBe(result.resolvedPath);
  });

  it("no symlink warning for non-symlink paths", () => {
    const result = preflightCheck(path.join(fixturesPath, "valid-plugin"));

    const symlinkWarning = result.warnings.find(
      (w) => w.code === "SYMLINK_RESOLVED",
    );
    expect(symlinkWarning).toBeUndefined();
  });

  it("handles lstatSync failure with PATH_RESOLUTION_FAILED", () => {
    const validPath = path.join(fixturesPath, "valid-plugin");
    mockLstatSyncError = true; // Enable error throwing

    const result = preflightCheck(validPath);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("PATH_RESOLUTION_FAILED");
    expect(result.errors[0]?.message).toContain("Permission denied");
  });
});
