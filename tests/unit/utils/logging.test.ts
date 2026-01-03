import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";

import {
  configureLogger,
  debug,
  error,
  failure,
  info,
  logger,
  progress,
  stageHeader,
  success,
  table,
  warn,
} from "../../../src/utils/logging.js";

describe("configureLogger", () => {
  afterEach(() => {
    // Reset to defaults
    configureLogger({ level: "info", timestamps: false, colors: true });
  });

  it("updates logger configuration", () => {
    configureLogger({ level: "debug" });

    // Verify by testing that debug messages now appear
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(vi.fn());
    debug("test");
    expect(debugSpy).toHaveBeenCalled();
    debugSpy.mockRestore();
  });

  it("merges partial configuration", () => {
    configureLogger({ timestamps: true });

    const infoSpy = vi.spyOn(console, "info").mockImplementation(vi.fn());
    info("test");

    expect(infoSpy).toHaveBeenCalled();
    // Timestamp format check - should contain ISO date format
    const call = infoSpy.mock.calls[0]?.[0] as string;
    expect(call).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
    infoSpy.mockRestore();
  });
});

describe("log level filtering", () => {
  let debugSpy: MockInstance;
  let infoSpy: MockInstance;
  let warnSpy: MockInstance;
  let errorSpy: MockInstance;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, "debug").mockImplementation(vi.fn());
    infoSpy = vi.spyOn(console, "info").mockImplementation(vi.fn());
    warnSpy = vi.spyOn(console, "warn").mockImplementation(vi.fn());
    errorSpy = vi.spyOn(console, "error").mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    configureLogger({ level: "info", timestamps: false, colors: true });
  });

  it("filters messages below configured level", () => {
    configureLogger({ level: "warn" });

    debug("debug message");
    info("info message");
    warn("warn message");
    error("error message");

    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("shows all messages at debug level", () => {
    configureLogger({ level: "debug" });

    debug("debug message");
    info("info message");
    warn("warn message");
    error("error message");

    expect(debugSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("only shows errors at error level", () => {
    configureLogger({ level: "error" });

    debug("debug message");
    info("info message");
    warn("warn message");
    error("error message");

    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe("message formatting", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    configureLogger({ level: "info", timestamps: false, colors: true });
  });

  describe("with colors enabled", () => {
    beforeEach(() => {
      configureLogger({ colors: true });
    });

    it("formats debug messages with gray color", () => {
      configureLogger({ level: "debug" });
      const spy = vi.spyOn(console, "debug").mockImplementation(vi.fn());

      debug("test message");

      expect(spy).toHaveBeenCalled();
      const message = spy.mock.calls[0]?.[0] as string;
      expect(message).toContain("[DEBUG]");
      expect(message).toContain("test message");
    });

    it("formats info messages with blue color", () => {
      const spy = vi.spyOn(console, "info").mockImplementation(vi.fn());

      info("test message");

      expect(spy).toHaveBeenCalled();
      const message = spy.mock.calls[0]?.[0] as string;
      expect(message).toContain("[INFO]");
      expect(message).toContain("test message");
    });

    it("formats warn messages with yellow color", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(vi.fn());

      warn("test message");

      expect(spy).toHaveBeenCalled();
      const message = spy.mock.calls[0]?.[0] as string;
      expect(message).toContain("[WARN]");
    });

    it("formats error messages with red color", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(vi.fn());

      error("test message");

      expect(spy).toHaveBeenCalled();
      const message = spy.mock.calls[0]?.[0] as string;
      expect(message).toContain("[ERROR]");
    });
  });

  describe("with colors disabled", () => {
    beforeEach(() => {
      configureLogger({ colors: false });
    });

    it("formats messages without ANSI codes", () => {
      configureLogger({ level: "debug" });
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(vi.fn());
      const infoSpy = vi.spyOn(console, "info").mockImplementation(vi.fn());
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(vi.fn());
      const errorSpy = vi.spyOn(console, "error").mockImplementation(vi.fn());

      debug("debug msg");
      info("info msg");
      warn("warn msg");
      error("error msg");

      // Check that messages don't contain ANSI escape codes
      const ansiRegex = /\x1b\[[0-9;]*m/;

      expect(debugSpy.mock.calls[0]?.[0]).not.toMatch(ansiRegex);
      expect(infoSpy.mock.calls[0]?.[0]).not.toMatch(ansiRegex);
      expect(warnSpy.mock.calls[0]?.[0]).not.toMatch(ansiRegex);
      expect(errorSpy.mock.calls[0]?.[0]).not.toMatch(ansiRegex);
    });

    it("formats debug level correctly without colors", () => {
      configureLogger({ level: "debug" });
      const spy = vi.spyOn(console, "debug").mockImplementation(vi.fn());

      debug("test");

      const message = spy.mock.calls[0]?.[0] as string;
      expect(message).toBe("[DEBUG] test");
    });

    it("formats info level correctly without colors", () => {
      const spy = vi.spyOn(console, "info").mockImplementation(vi.fn());

      info("test");

      const message = spy.mock.calls[0]?.[0] as string;
      expect(message).toBe("[INFO] test");
    });

    it("formats warn level correctly without colors", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(vi.fn());

      warn("test");

      const message = spy.mock.calls[0]?.[0] as string;
      expect(message).toBe("[WARN] test");
    });

    it("formats error level correctly without colors", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(vi.fn());

      error("test");

      const message = spy.mock.calls[0]?.[0] as string;
      expect(message).toBe("[ERROR] test");
    });
  });

  describe("with timestamps", () => {
    it("includes ISO timestamp in messages", () => {
      configureLogger({ timestamps: true, colors: false });
      const spy = vi.spyOn(console, "info").mockImplementation(vi.fn());

      info("test message");

      const message = spy.mock.calls[0]?.[0] as string;
      // Should match: [2024-01-15T10:30:00.000Z] [INFO] test message
      expect(message).toMatch(
        /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] test message$/,
      );
    });
  });
});

describe("success and failure", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    configureLogger({ level: "info", timestamps: false, colors: true });
  });

  describe("success", () => {
    it("logs success message with emoji when colors enabled", () => {
      configureLogger({ colors: true });
      const spy = vi.spyOn(console, "log").mockImplementation(vi.fn());

      success("Operation complete");

      expect(spy).toHaveBeenCalled();
      const message = spy.mock.calls[0]?.[0] as string;
      expect(message).toContain("✅");
      expect(message).toContain("Operation complete");
    });

    it("logs success message with prefix when colors disabled", () => {
      configureLogger({ colors: false });
      const spy = vi.spyOn(console, "log").mockImplementation(vi.fn());

      success("Operation complete");

      const message = spy.mock.calls[0]?.[0] as string;
      expect(message).toBe("[SUCCESS] Operation complete");
    });

    it("respects log level filtering", () => {
      configureLogger({ level: "error" });
      const spy = vi.spyOn(console, "log").mockImplementation(vi.fn());

      success("Should not appear");

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("failure", () => {
    it("logs failure message with emoji when colors enabled", () => {
      configureLogger({ colors: true });
      const spy = vi.spyOn(console, "log").mockImplementation(vi.fn());

      failure("Operation failed");

      expect(spy).toHaveBeenCalled();
      const message = spy.mock.calls[0]?.[0] as string;
      expect(message).toContain("❌");
      expect(message).toContain("Operation failed");
    });

    it("logs failure message with prefix when colors disabled", () => {
      configureLogger({ colors: false });
      const spy = vi.spyOn(console, "log").mockImplementation(vi.fn());

      failure("Operation failed");

      const message = spy.mock.calls[0]?.[0] as string;
      expect(message).toBe("[FAILURE] Operation failed");
    });
  });
});

describe("stageHeader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    configureLogger({ level: "info", timestamps: false, colors: true });
  });

  it("logs stage header with separator lines when colors enabled", () => {
    configureLogger({ colors: true });
    const spy = vi.spyOn(console, "log").mockImplementation(vi.fn());

    stageHeader("Analysis");

    expect(spy).toHaveBeenCalledTimes(3);
    // Check separator
    const separator = spy.mock.calls[0]?.[0] as string;
    expect(separator).toContain("=".repeat(60));
    // Check stage name
    const header = spy.mock.calls[1]?.[0] as string;
    expect(header).toContain("STAGE: ANALYSIS");
  });

  it("logs stage header without colors", () => {
    configureLogger({ colors: false });
    const spy = vi.spyOn(console, "log").mockImplementation(vi.fn());

    stageHeader("Generation");

    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy.mock.calls[0]?.[0]).toBe("=".repeat(60));
    expect(spy.mock.calls[1]?.[0]).toBe("STAGE: GENERATION");
    expect(spy.mock.calls[2]?.[0]).toBe("=".repeat(60));
  });

  it("includes item count when provided", () => {
    configureLogger({ colors: false });
    const spy = vi.spyOn(console, "log").mockImplementation(vi.fn());

    stageHeader("Execution", 42);

    const header = spy.mock.calls[1]?.[0] as string;
    expect(header).toBe("STAGE: EXECUTION (42 items)");
  });

  it("handles zero item count", () => {
    configureLogger({ colors: false });
    const spy = vi.spyOn(console, "log").mockImplementation(vi.fn());

    stageHeader("Test", 0);

    const header = spy.mock.calls[1]?.[0] as string;
    expect(header).toBe("STAGE: TEST (0 items)");
  });
});

describe("progress", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    configureLogger({ level: "info", timestamps: false, colors: true });
  });

  it("logs progress with bar when colors enabled", () => {
    configureLogger({ colors: true });
    const spy = vi.spyOn(console, "log").mockImplementation(vi.fn());

    progress(5, 10, "Processing item");

    expect(spy).toHaveBeenCalled();
    const message = spy.mock.calls[0]?.[0] as string;
    expect(message).toContain("[5/10]");
    expect(message).toContain("50%");
    expect(message).toContain("Processing item");
    expect(message).toContain("█");
    expect(message).toContain("░");
  });

  it("logs progress without colors", () => {
    configureLogger({ colors: false });
    const spy = vi.spyOn(console, "log").mockImplementation(vi.fn());

    progress(3, 10, "Working");

    const message = spy.mock.calls[0]?.[0] as string;
    // Should not contain ANSI codes
    expect(message).not.toMatch(/\x1b\[[0-9;]*m/);
    expect(message).toContain("[3/10]");
    expect(message).toContain("30%");
    expect(message).toContain("Working");
  });

  it("shows 100% at completion", () => {
    configureLogger({ colors: false });
    const spy = vi.spyOn(console, "log").mockImplementation(vi.fn());

    progress(10, 10, "Done");

    const message = spy.mock.calls[0]?.[0] as string;
    expect(message).toContain("100%");
  });

  it("handles 0/N progress", () => {
    configureLogger({ colors: false });
    const spy = vi.spyOn(console, "log").mockImplementation(vi.fn());

    progress(0, 10, "Starting");

    const message = spy.mock.calls[0]?.[0] as string;
    expect(message).toContain("[0/10]");
    expect(message).toContain("0%");
  });

  it("respects log level filtering", () => {
    configureLogger({ level: "error" });
    const spy = vi.spyOn(console, "log").mockImplementation(vi.fn());

    progress(5, 10, "Should not appear");

    expect(spy).not.toHaveBeenCalled();
  });
});

describe("table", () => {
  it("creates formatted table with headers and rows", () => {
    const headers = ["Name", "Value"];
    const rows = [
      ["foo", "123"],
      ["bar", "456"],
    ];

    const result = table(headers, rows);

    expect(result).toContain("Name");
    expect(result).toContain("Value");
    expect(result).toContain("foo");
    expect(result).toContain("123");
    expect(result).toContain("bar");
    expect(result).toContain("456");
  });

  it("aligns columns correctly", () => {
    const headers = ["Short", "LongerHeader"];
    const rows = [
      ["a", "b"],
      ["longvalue", "x"],
    ];

    const result = table(headers, rows);
    const lines = result.split("\n");

    // All lines should have consistent column positions
    expect(lines.length).toBe(4); // header, separator, 2 data rows
  });

  it("handles empty rows", () => {
    const headers = ["Col1", "Col2"];
    const rows: string[][] = [];

    const result = table(headers, rows);
    const lines = result.split("\n");

    expect(lines.length).toBe(2); // header and separator only
    expect(lines[0]).toContain("Col1");
    expect(lines[1]).toContain("-");
  });

  it("handles varying column widths", () => {
    const headers = ["A", "B", "C"];
    const rows = [
      ["short", "verylongvalue", "x"],
      ["y", "z", "mediumvalue"],
    ];

    const result = table(headers, rows);

    // Verify proper padding - columns should be aligned
    const lines = result.split("\n");
    expect(lines[0]).toContain(" | ");
    expect(lines[1]).toContain("-+-");
  });

  it("creates proper separator line", () => {
    const headers = ["Name", "Description"];
    const rows = [["test", "A test item"]];

    const result = table(headers, rows);
    const lines = result.split("\n");
    const separator = lines[1];

    // Separator should contain dashes and plus signs
    expect(separator).toMatch(/^-+-\+-+$/);
  });

  it("handles single column", () => {
    const headers = ["Only"];
    const rows = [["value1"], ["value2"]];

    const result = table(headers, rows);

    expect(result).toContain("Only");
    expect(result).toContain("value1");
    expect(result).toContain("value2");
    expect(result).not.toContain("|");
  });

  it("handles cells with varying lengths", () => {
    const headers = ["ID", "Name", "Status"];
    const rows = [
      ["1", "Short", "OK"],
      ["100", "A Very Long Name Here", "PENDING"],
      ["2", "Mid", "ERROR"],
    ];

    const result = table(headers, rows);
    const lines = result.split("\n");

    // Each row should have the same structure
    lines.forEach((line) => {
      const pipeCount = (line.match(/\|/g) ?? []).length;
      const plusCount = (line.match(/\+/g) ?? []).length;
      // Either 2 pipes (data rows/header) or 2 plus signs (separator)
      expect(pipeCount + plusCount).toBe(2);
    });
  });
});

describe("logger export", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    configureLogger({ level: "info", timestamps: false, colors: true });
  });

  it("exports all logging functions", () => {
    expect(logger.debug).toBe(debug);
    expect(logger.info).toBe(info);
    expect(logger.warn).toBe(warn);
    expect(logger.error).toBe(error);
    expect(logger.success).toBe(success);
    expect(logger.failure).toBe(failure);
    expect(logger.stageHeader).toBe(stageHeader);
    expect(logger.progress).toBe(progress);
    expect(logger.configure).toBe(configureLogger);
  });

  it("can be used as unified interface", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(vi.fn());

    logger.info("test message");

    expect(spy).toHaveBeenCalled();
  });
});

describe("additional arguments", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    configureLogger({ level: "info", timestamps: false, colors: true });
  });

  it("passes additional arguments to console methods", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(vi.fn());
    const extraData = { key: "value" };

    info("message", extraData, 42);

    expect(spy).toHaveBeenCalledWith(expect.any(String), extraData, 42);
  });

  it("works with debug level", () => {
    configureLogger({ level: "debug" });
    const spy = vi.spyOn(console, "debug").mockImplementation(vi.fn());

    debug("debug", "extra", "args");

    expect(spy).toHaveBeenCalledWith(expect.any(String), "extra", "args");
  });
});
