/**
 * Adapter over the WebMCP model context API (webmachinelearning/webmcp).
 *
 * Every reference to the browser's model context lives in this one file. Callers use
 * `isModelContextSupported` / `registerModelContextTool` / `unregisterModelContextTool` and never
 * touch the browser object directly, so API reshapes only change this module's internals.
 *
 * Two shapes are supported, in order of preference:
 * - **Current spec** (Chrome 150+): `document.modelContext.registerTool(tool, { signal })` returns a
 *   promise that rejects on a duplicate name; a tool is unregistered by aborting its signal. Chrome
 *   150 also kept a deprecated `navigator.modelContext` alias of this shape, removed in later builds.
 * - **Earlier draft** (Chrome 146 Canary): `navigator.modelContext.registerTool(tool)` paired with
 *   `unregisterTool(name)`.
 *
 * The API is still experimental (a Chrome origin trial) and absent elsewhere, so every export is a
 * silent no-op, never a throw, when no supported shape is present.
 */

/** A single agent-callable tool, in the shape `registerTool` expects. */
export interface ModelContextTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
}

/** Current spec: registration is async and unregistered through an AbortSignal. */
interface SignalRegistry {
  registerTool: (tool: ModelContextTool, options?: { signal?: AbortSignal }) => Promise<void> | void;
}

/** Earlier draft: synchronous registration paired with unregister-by-name. */
interface NamedRegistry {
  registerTool: (tool: ModelContextTool) => void;
  unregisterTool: (name: string) => void;
}

type Registry = { kind: 'signal'; api: SignalRegistry } | { kind: 'named'; api: NamedRegistry };

/** Abort handles for tools registered through the signal-based API, keyed by tool name. */
const registrations = new Map<string, AbortController>();

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

/**
 * Finds the browser's tool registry, preferring the current `document.modelContext` shape, or
 * returns `undefined` when neither shape is present.
 */
function getRegistry(): Registry | undefined {
  const fromDocument =
    typeof document === 'undefined' ? undefined : asObject((document as Document & { modelContext?: unknown }).modelContext);
  if (fromDocument && typeof fromDocument.registerTool === 'function') {
    return { kind: 'signal', api: fromDocument as unknown as SignalRegistry };
  }

  const fromNavigator =
    typeof navigator === 'undefined' ? undefined : asObject((navigator as Navigator & { modelContext?: unknown }).modelContext);
  if (fromNavigator && typeof fromNavigator.registerTool === 'function') {
    return typeof fromNavigator.unregisterTool === 'function'
      ? { kind: 'named', api: fromNavigator as unknown as NamedRegistry }
      : { kind: 'signal', api: fromNavigator as unknown as SignalRegistry };
  }

  return undefined;
}

/** True when the current browser exposes a supported WebMCP model context. */
export function isModelContextSupported(): boolean {
  return getRegistry() !== undefined;
}

/**
 * Registers a tool with the browser's model context. Silent no-op (no throw) when WebMCP is
 * unsupported; a rejected registration (for example a duplicate name) is logged, not thrown.
 */
export function registerModelContextTool(tool: ModelContextTool): void {
  const registry = getRegistry();
  if (!registry) {
    return;
  }

  if (registry.kind === 'named') {
    registry.api.registerTool(tool);
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
    Promise.resolve(registry.api.registerTool(tool, { signal: controller.signal })).catch(handleFailure);
  } catch (error) {
    handleFailure(error);
  }
}

/**
 * Unregisters a tool by name from the browser's model context. Silent no-op (no throw) when WebMCP
 * is unsupported or the tool isn't registered.
 */
export function unregisterModelContextTool(name: string): void {
  const controller = registrations.get(name);
  if (controller) {
    registrations.delete(name);
    controller.abort();
    return;
  }

  const registry = getRegistry();
  if (registry?.kind === 'named') {
    registry.api.unregisterTool(name);
  }
}
