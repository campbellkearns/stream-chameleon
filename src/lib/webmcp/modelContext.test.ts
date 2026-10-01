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

/** Installs a mock `document.modelContext` matching the current spec (signal-based unregister). */
function mockDocumentModelContext(registerImpl?: (tool: ModelContextTool, options?: { signal?: AbortSignal }) => Promise<void>) {
  const signals = new Map<string, AbortSignal>();
  const registry = {
    registerTool: vi.fn(async (tool: ModelContextTool, options?: { signal?: AbortSignal }) => {
      if (options?.signal) signals.set(tool.name, options.signal);
      await registerImpl?.(tool, options);
    }),
  };
  Object.defineProperty(document, "modelContext", { value: registry, configurable: true });
  return { registry, signals };
}

function clearDocumentModelContext() {
  Object.defineProperty(document, "modelContext", { value: undefined, configurable: true });
}

describe("current spec: document.modelContext", () => {
  afterEach(() => {
    clearDocumentModelContext();
  });

  it("is detected, and preferred over a navigator.modelContext", () => {
    const legacy = mockModelContext();
    const { registry } = mockDocumentModelContext();

    expect(isModelContextSupported()).toBe(true);
    registerModelContextTool(testTool);

    expect(registry.registerTool).toHaveBeenCalledWith(testTool, { signal: expect.any(AbortSignal) });
    expect(legacy.registerTool).not.toHaveBeenCalled();
    unregisterModelContextTool(testTool.name);
  });

  it("unregisters by aborting the signal passed at registration", () => {
    const { signals } = mockDocumentModelContext();

    registerModelContextTool(testTool);
    const signal = signals.get(testTool.name)!;
    expect(signal.aborted).toBe(false);

    unregisterModelContextTool(testTool.name);
    expect(signal.aborted).toBe(true);
  });

  it("replaces its own earlier registration of the same name instead of colliding", () => {
    const { registry, signals } = mockDocumentModelContext();

    registerModelContextTool(testTool);
    const first = signals.get(testTool.name)!;
    registerModelContextTool(testTool);

    expect(first.aborted).toBe(true);
    expect(registry.registerTool).toHaveBeenCalledTimes(2);
    unregisterModelContextTool(testTool.name);
  });

  it("logs a rejected registration instead of throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockDocumentModelContext(async () => {
      throw new Error("duplicate name");
    });

    expect(() => registerModelContextTool(testTool)).not.toThrow();
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    warn.mockRestore();
  });

  it("treats a navigator.modelContext without unregisterTool as the signal-based shape", () => {
    const signals = new Map<string, AbortSignal>();
    const registry = {
      registerTool: vi.fn(async (tool: ModelContextTool, options?: { signal?: AbortSignal }) => {
        if (options?.signal) signals.set(tool.name, options.signal);
      }),
    };
    Object.defineProperty(navigator, "modelContext", { value: registry, configurable: true });

    registerModelContextTool(testTool);
    unregisterModelContextTool(testTool.name);

    expect(signals.get(testTool.name)?.aborted).toBe(true);
  });
});
