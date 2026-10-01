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

type RegisterOptions = { signal?: AbortSignal };

/**
 * Installs a mock `document.modelContext` matching the spec: async `registerTool(tool, { signal })`
 * that rejects a name that's already registered, unregistered by aborting the signal.
 */
function mockModelContext() {
  const active = new Map<string, AbortSignal>();
  const registry = {
    registerTool: vi.fn(async (tool: ModelContextTool, options?: RegisterOptions) => {
      if (active.has(tool.name)) {
        throw new DOMException(`Tool "${tool.name}" is already registered`, "InvalidStateError");
      }
      const signal = options?.signal;
      if (signal?.aborted) return;
      if (signal) {
        active.set(tool.name, signal);
        signal.addEventListener("abort", () => active.delete(tool.name));
      }
    }),
  };
  Object.defineProperty(document, "modelContext", { value: registry, configurable: true });
  return { registry, active };
}

/** Removes any `document.modelContext` installed by a previous test. */
function clearModelContext() {
  Object.defineProperty(document, "modelContext", { value: undefined, configurable: true });
}

afterEach(() => {
  unregisterModelContextTool(testTool.name);
  clearModelContext();
});

describe("isModelContextSupported", () => {
  it("returns true when document.modelContext matches the spec's shape", () => {
    mockModelContext();
    expect(isModelContextSupported()).toBe(true);
  });

  it("returns false when document.modelContext is absent", () => {
    clearModelContext();
    expect(isModelContextSupported()).toBe(false);
  });

  it("returns false when document.modelContext doesn't match the expected shape", () => {
    Object.defineProperty(document, "modelContext", {
      value: { registerTool: "not-a-function" },
      configurable: true,
    });
    expect(isModelContextSupported()).toBe(false);
  });

  it("ignores a navigator.modelContext (pre-Chrome 150 location)", () => {
    clearModelContext();
    Object.defineProperty(navigator, "modelContext", {
      value: { registerTool: vi.fn(), unregisterTool: vi.fn() },
      configurable: true,
    });
    expect(isModelContextSupported()).toBe(false);
    Object.defineProperty(navigator, "modelContext", { value: undefined, configurable: true });
  });
});

describe("registerModelContextTool", () => {
  it("registers the tool with an abort signal when the API is present", () => {
    const { registry } = mockModelContext();
    registerModelContextTool(testTool);
    expect(registry.registerTool).toHaveBeenCalledWith(testTool, { signal: expect.any(AbortSignal) });
  });

  it("replaces its own earlier registration of the same name instead of colliding", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { registry, active } = mockModelContext();

    registerModelContextTool(testTool);
    registerModelContextTool(testTool);
    await Promise.resolve();

    expect(registry.registerTool).toHaveBeenCalledTimes(2);
    expect(active.has(testTool.name)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("logs a rejected registration instead of throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { registry } = mockModelContext();
    registry.registerTool.mockRejectedValueOnce(new Error("rejected"));

    expect(() => registerModelContextTool(testTool)).not.toThrow();
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    warn.mockRestore();
  });

  it("is a silent no-op when the API is absent", () => {
    clearModelContext();
    expect(() => registerModelContextTool(testTool)).not.toThrow();
  });
});

describe("unregisterModelContextTool", () => {
  it("aborts the signal the tool was registered with", () => {
    const { registry, active } = mockModelContext();
    registerModelContextTool(testTool);
    const { signal } = registry.registerTool.mock.calls[0][1] as { signal: AbortSignal };

    unregisterModelContextTool(testTool.name);

    expect(signal.aborted).toBe(true);
    expect(active.has(testTool.name)).toBe(false);
  });

  it("is a silent no-op for a tool that isn't registered", () => {
    mockModelContext();
    expect(() => unregisterModelContextTool("never_registered")).not.toThrow();
  });

  it("is a silent no-op when the API is absent", () => {
    clearModelContext();
    expect(() => unregisterModelContextTool(testTool.name)).not.toThrow();
  });
});
