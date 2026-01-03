import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  basename,
  dirname,
  ensureDir,
  extname,
  fileExists,
  generateRunId,
  getResultsDir,
  joinPath,
  parseFrontmatter,
  readJson,
  readText,
  readYaml,
  relativePath,
  resolvePath,
  writeJson,
  writeText,
  writeYaml,
} from "../../../src/utils/file-io.js";

describe("ensureDir", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "file-io-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates a new directory", () => {
    const newDir = path.join(tempDir, "newdir");
    expect(fileExists(newDir)).toBe(false);

    ensureDir(newDir);

    expect(fileExists(newDir)).toBe(true);
  });

  it("creates nested directories", () => {
    const nestedDir = path.join(tempDir, "a", "b", "c");
    expect(fileExists(nestedDir)).toBe(false);

    ensureDir(nestedDir);

    expect(fileExists(nestedDir)).toBe(true);
  });

  it("does nothing if directory exists", () => {
    const existingDir = path.join(tempDir, "existing");
    mkdirSync(existingDir);

    // Should not throw
    ensureDir(existingDir);

    expect(fileExists(existingDir)).toBe(true);
  });
});

describe("readJson / writeJson", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "file-io-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes and reads JSON with pretty formatting", () => {
    const filePath = path.join(tempDir, "test.json");
    const data = { name: "test", count: 42 };

    writeJson(filePath, data);
    const result = readJson(filePath);

    expect(result).toEqual(data);
  });

  it("writes compact JSON when pretty is false", () => {
    const filePath = path.join(tempDir, "compact.json");
    const data = { a: 1, b: 2 };

    writeJson(filePath, data, false);
    const content = readText(filePath);

    expect(content).toBe('{"a":1,"b":2}');
  });

  it("creates parent directories when writing", () => {
    const filePath = path.join(tempDir, "sub", "dir", "test.json");
    const data = { nested: true };

    writeJson(filePath, data);

    expect(fileExists(filePath)).toBe(true);
    expect(readJson(filePath)).toEqual(data);
  });

  it("throws for non-existent file", () => {
    const filePath = path.join(tempDir, "nonexistent.json");

    expect(() => readJson(filePath)).toThrow();
  });

  it("throws for invalid JSON", () => {
    const filePath = path.join(tempDir, "invalid.json");
    writeFileSync(filePath, "not valid json {", "utf-8");

    expect(() => readJson(filePath)).toThrow();
  });
});

describe("readYaml / writeYaml", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "file-io-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes and reads YAML", () => {
    const filePath = path.join(tempDir, "test.yaml");
    const data = { name: "test", items: ["a", "b", "c"] };

    writeYaml(filePath, data);
    const result = readYaml(filePath);

    expect(result).toEqual(data);
  });

  it("creates parent directories when writing", () => {
    const filePath = path.join(tempDir, "nested", "test.yaml");
    const data = { key: "value" };

    writeYaml(filePath, data);

    expect(fileExists(filePath)).toBe(true);
    expect(readYaml(filePath)).toEqual(data);
  });

  it("throws for non-existent file", () => {
    const filePath = path.join(tempDir, "nonexistent.yaml");

    expect(() => readYaml(filePath)).toThrow();
  });
});

describe("readText / writeText", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "file-io-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes and reads text content", () => {
    const filePath = path.join(tempDir, "test.txt");
    const content = "Hello, World!\nLine 2";

    writeText(filePath, content);
    const result = readText(filePath);

    expect(result).toBe(content);
  });

  it("creates parent directories when writing", () => {
    const filePath = path.join(tempDir, "sub", "test.txt");
    const content = "nested content";

    writeText(filePath, content);

    expect(fileExists(filePath)).toBe(true);
    expect(readText(filePath)).toBe(content);
  });

  it("handles empty content", () => {
    const filePath = path.join(tempDir, "empty.txt");

    writeText(filePath, "");
    const result = readText(filePath);

    expect(result).toBe("");
  });
});

describe("fileExists", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "file-io-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns true for existing file", () => {
    const filePath = path.join(tempDir, "exists.txt");
    writeFileSync(filePath, "content", "utf-8");

    expect(fileExists(filePath)).toBe(true);
  });

  it("returns true for existing directory", () => {
    expect(fileExists(tempDir)).toBe(true);
  });

  it("returns false for non-existent path", () => {
    const filePath = path.join(tempDir, "nonexistent.txt");

    expect(fileExists(filePath)).toBe(false);
  });
});

describe("path utilities", () => {
  describe("relativePath", () => {
    it("returns relative path between two paths", () => {
      const from = "/a/b/c";
      const to = "/a/b/d/e.txt";

      const result = relativePath(from, to);

      expect(result).toBe("../d/e.txt");
    });
  });

  describe("joinPath", () => {
    it("joins path segments", () => {
      const result = joinPath("a", "b", "c.txt");

      expect(result).toBe(path.join("a", "b", "c.txt"));
    });
  });

  describe("resolvePath", () => {
    it("resolves to absolute path", () => {
      const result = resolvePath("./relative/path");

      expect(path.isAbsolute(result)).toBe(true);
    });
  });

  describe("dirname", () => {
    it("returns directory name", () => {
      const result = dirname("/a/b/c.txt");

      expect(result).toBe("/a/b");
    });
  });

  describe("basename", () => {
    it("returns base name", () => {
      const result = basename("/a/b/c.txt");

      expect(result).toBe("c.txt");
    });

    it("removes extension when provided", () => {
      const result = basename("/a/b/c.txt", ".txt");

      expect(result).toBe("c");
    });
  });

  describe("extname", () => {
    it("returns file extension", () => {
      const result = extname("/a/b/c.txt");

      expect(result).toBe(".txt");
    });

    it("returns empty string for no extension", () => {
      const result = extname("/a/b/c");

      expect(result).toBe("");
    });
  });
});

describe("parseFrontmatter", () => {
  it("parses valid YAML frontmatter", () => {
    const content = `---
title: Test
count: 42
---
Body content here.`;

    const result = parseFrontmatter(content);

    expect(result.frontmatter).toEqual({ title: "Test", count: 42 });
    expect(result.body).toBe("Body content here.");
  });

  it("handles frontmatter with complex YAML", () => {
    const content = `---
items:
  - one
  - two
nested:
  key: value
---
The body`;

    const result = parseFrontmatter(content);

    expect(result.frontmatter).toEqual({
      items: ["one", "two"],
      nested: { key: "value" },
    });
    expect(result.body).toBe("The body");
  });

  it("returns empty frontmatter when no frontmatter present", () => {
    const content = "Just regular content without frontmatter.";

    const result = parseFrontmatter(content);

    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(content);
  });

  it("returns empty frontmatter for content without closing delimiter", () => {
    const content = `---
incomplete: true
No closing delimiter`;

    const result = parseFrontmatter(content);

    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(content);
  });

  it("returns empty frontmatter for invalid YAML", () => {
    const content = `---
invalid: yaml: content: [broken
---
Body text`;

    const result = parseFrontmatter(content);

    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(content);
  });

  it("handles empty body after frontmatter", () => {
    const content = `---
key: value
---`;

    const result = parseFrontmatter(content);

    expect(result.frontmatter).toEqual({ key: "value" });
    expect(result.body).toBe("");
  });

  it("handles empty frontmatter section", () => {
    // Note: the regex requires at least one newline between delimiters
    const content = `---

---
Body after empty frontmatter`;

    const result = parseFrontmatter(content);

    // parseYaml returns null for empty YAML, but we coalesce to {}
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe("Body after empty frontmatter");
  });

  it("treats adjacent delimiters as no frontmatter", () => {
    // Adjacent delimiters (no newline between) don't match the pattern
    const content = `---
---
Body text`;

    const result = parseFrontmatter(content);

    // Doesn't match frontmatter pattern, so returns original content as body
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(content);
  });
});

describe("generateRunId", () => {
  it("generates unique IDs", () => {
    const id1 = generateRunId();
    const id2 = generateRunId();

    expect(id1).not.toBe(id2);
  });

  it("uses default prefix", () => {
    const id = generateRunId();

    expect(id).toMatch(/^run-\d+-[a-z0-9]+$/);
  });

  it("uses custom prefix", () => {
    const id = generateRunId("custom");

    expect(id).toMatch(/^custom-\d+-[a-z0-9]+$/);
  });

  it("includes timestamp component", () => {
    const before = Date.now();
    const id = generateRunId();
    const after = Date.now();

    // Extract timestamp from ID (format: prefix-timestamp-random)
    const timestampStr = id.split("-")[1];
    const timestamp = Number(timestampStr);

    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });
});

describe("getResultsDir", () => {
  it("returns base directory without runId", () => {
    const result = getResultsDir("my-plugin");

    expect(result).toBe(path.join(process.cwd(), "results", "my-plugin"));
  });

  it("returns run-specific directory with runId", () => {
    const result = getResultsDir("my-plugin", "run-123");

    expect(result).toBe(
      path.join(process.cwd(), "results", "my-plugin", "run-123"),
    );
  });

  it("handles plugin names with special characters", () => {
    const result = getResultsDir("@scope/plugin-name");

    expect(result).toBe(
      path.join(process.cwd(), "results", "@scope/plugin-name"),
    );
  });
});
