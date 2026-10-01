/**
 * Adapter over the WebMCP `document.modelContext` API (webmachinelearning/webmcp).
 *
 * Every reference to the browser's model context lives in this one file. Callers use
 * `isModelContextSupported` / `registerModelContextTool` / `unregisterModelContextTool` and never
 * touch `document.modelContext` directly, so API reshapes only change this module's internals.
 *
 * Per the spec, `registerTool(tool, { signal })` returns a promise that rejects on a duplicate name,
 * and a tool is unregistered by aborting the signal it was registered with. This module keeps one
 * AbortController per tool name so callers can still unregister by name.
 *
 * The API is experimental (a Chrome origin trial) and absent elsewhere, so every export is a silent
 * no-op, never a throw, when `document.modelContext` is missing or doesn't match the expected shape.
 */

/** A single agent-callable tool, in the shape `registerTool` expects. */
export interface ModelContextTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
}

/** The slice of the spec's `ModelContext` this adapter depends on. */
interface ModelContextRegistry {
  registerTool: (tool: ModelContextTool, options?: { signal?: AbortSignal }) => Promise<void>;
}

/** Abort handles for registered tools, keyed by tool name. */
const registrations = new Map<string, AbortController>();

/**
 * Returns the browser's tool registry when it matches the spec's shape, or `undefined` otherwise
 * (no `document`, no `modelContext`, or an incompatible shape).
 */
function getModelContextRegistry(): ModelContextRegistry | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const candidate = (document as Document & { modelContext?: unknown }).modelContext;
  if (typeof candidate !== 'object' || candidate === null) {
    return undefined;
  }

  const registry = candidate as Partial<ModelContextRegistry>;
  return typeof registry.registerTool === 'function' ? (registry as ModelContextRegistry) : undefined;
}

/** True when the current browser exposes a spec-shaped `document.modelContext`. */
export function isModelContextSupported(): boolean {
  return getModelContextRegistry() !== undefined;
}

/**
 * Registers a tool with the browser's model context. Silent no-op (no throw) when WebMCP is
 * unsupported; a rejected registration is logged, not thrown.
 */
export function registerModelContextTool(tool: ModelContextTool): void {
  const registry = getModelContextRegistry();
  if (!registry) {
    return;
  }

  // Re-registering a name we own replaces it; the spec rejects duplicates otherwise
  registrations.get(tool.name)?.abort();
  const controller = new AbortController();
  registrations.set(tool.name, controller);

  const handleFailure = (error: unknown) => {
    if (registrations.get(tool.name) === controller) {
      registrations.delete(tool.name);
    }
    console.warn(`[WebMCP] Failed to register tool "${tool.name}":`, error);
  };

  try {
    Promise.resolve(registry.registerTool(tool, { signal: controller.signal })).catch(handleFailure);
  } catch (error) {
    handleFailure(error);
  }
}

/**
 * Unregisters a tool by name by aborting its registration signal. Silent no-op when the tool isn't
 * registered.
 */
export function unregisterModelContextTool(name: string): void {
  const controller = registrations.get(name);
  if (!controller) {
    return;
  }
  registrations.delete(name);
  controller.abort();
}
