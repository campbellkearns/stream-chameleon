/**
 * Adapter over the WebMCP `navigator.modelContext` API (webmachinelearning/webmcp draft).
 *
 * Every reference to `navigator.modelContext` in the app lives in this one file. Callers use
 * `isModelContextSupported` / `registerModelContextTool` / `unregisterModelContextTool` and never
 * touch `navigator.modelContext` directly — so when the 2026-08-19 draft reshape lands
 * (`getTools()` / `executeTool()` on a normative `ModelContext`), only this module's internals
 * need to change.
 *
 * The API is still a browser draft (Chrome 146 Canary, stable pencilled for Chrome 157 /
 * 2026-11-03) and unsupported elsewhere, so every export here is a silent no-op — never a
 * throw — when `navigator.modelContext` is absent or doesn't match the expected shape.
 */

/** A single agent-callable tool, in the shape `navigator.modelContext.registerTool` expects. */
export interface ModelContextTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
}

/** The slice of the current draft's `navigator.modelContext` surface this adapter depends on. */
interface ModelContextRegistry {
  registerTool: (tool: ModelContextTool) => void;
  unregisterTool: (name: string) => void;
}

/**
 * Returns the browser's tool registry when it matches the shape this adapter targets, or
 * `undefined` otherwise (no `navigator`, no `modelContext`, or a future/incompatible shape).
 */
function getModelContextRegistry(): ModelContextRegistry | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }

  const candidate = (navigator as Navigator & { modelContext?: unknown }).modelContext;
  if (typeof candidate !== "object" || candidate === null) {
    return undefined;
  }

  const registry = candidate as Partial<ModelContextRegistry>;
  if (typeof registry.registerTool !== "function" || typeof registry.unregisterTool !== "function") {
    return undefined;
  }

  return registry as ModelContextRegistry;
}

/** True when the current browser exposes a WebMCP-shaped `navigator.modelContext`. */
export function isModelContextSupported(): boolean {
  return getModelContextRegistry() !== undefined;
}

/**
 * Registers a tool with the browser's model context. Silent no-op (no throw) when WebMCP is
 * unsupported.
 */
export function registerModelContextTool(tool: ModelContextTool): void {
  getModelContextRegistry()?.registerTool(tool);
}

/**
 * Unregisters a tool by name from the browser's model context. Silent no-op (no throw) when
 * WebMCP is unsupported.
 */
export function unregisterModelContextTool(name: string): void {
  getModelContextRegistry()?.unregisterTool(name);
}
