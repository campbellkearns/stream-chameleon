import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isModelContextSupported,
  registerModelContextTool,
  unregisterModelContextTool,
  type ModelContextTool,
} from "./modelContext";

const testTool: ModelContextTool = {
  name: "test_tool",
  description: "A tool used only in tests",
  inputSchema: { type: "object", properties: {} },
  execute: async () => ({ ok: true }),
};

/** Installs a mock `navigator.modelContext` matching the draft registry shape. */
function mockModelContext() {
  const registry = {
    registerTool: vi.fn(),
    unregisterTool: vi.fn(),
  };
  Object.defineProperty(navigator, "modelContext", {
    value: registry,
    configurable: true,
  });
  return registry;
}

/** Removes any `navigator.modelContext` installed by a previous test. */
function clearModelContext() {
  Object.defineProperty(navigator, "modelContext", {
    value: undefined,
    configurable: true,
  });
}

afterEach(() => {
  clearModelContext();
});

describe("isModelContextSupported", () => {
  it("returns true when navigator.modelContext matches the expected shape", () => {
    mockModelContext();
    expect(isModelContextSupported()).toBe(true);
  });

  it("returns false when navigator.modelContext is absent", () => {
    clearModelContext();
    expect(isModelContextSupported()).toBe(false);
  });

  it("returns false when navigator.modelContext doesn't match the expected shape", () => {
    Object.defineProperty(navigator, "modelContext", {
      value: { registerTool: "not-a-function" },
      configurable: true,
    });
    expect(isModelContextSupported()).toBe(false);
  });
});

describe("registerModelContextTool", () => {
  it("registers the tool when the API is present", () => {
    const registry = mockModelContext();
    registerModelContextTool(testTool);
    expect(registry.registerTool).toHaveBeenCalledWith(testTool);
  });

  it("is a silent no-op when the API is absent", () => {
    clearModelContext();
    expect(() => registerModelContextTool(testTool)).not.toThrow();
  });
});

describe("unregisterModelContextTool", () => {
  it("removes the tool by name when the API is present", () => {
    const registry = mockModelContext();
    unregisterModelContextTool(testTool.name);
    expect(registry.unregisterTool).toHaveBeenCalledWith(testTool.name);
  });

  it("is a silent no-op when the API is absent", () => {
    clearModelContext();
    expect(() => unregisterModelContextTool(testTool.name)).not.toThrow();
  });
});
