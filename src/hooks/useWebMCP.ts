/**
 * WebMCP registration lifecycle.
 *
 * `useModelContextTools` is the register-when-available / unregister-when-removed pattern the
 * WebMCP docs prescribe, expressed as a hook: tools are registered while `enabled` is true and
 * removed again on unmount or when `enabled` goes false (sign-out). Registration itself goes
 * through the `modelContext` adapter, so an unsupported browser is a silent no-op here too.
 *
 * `useModelContextTools` is deliberately generic — it knows about tool identity and lifecycle, not
 * about profiles or Twitch. `useWebMCP` composes the stream-profile surface on top of it.
 */

import { useEffect, useMemo, useRef } from 'react';
import type { StreamCategory, StreamProfile } from '@/types/Profile';
import { getTwitchAPI } from '@/lib/api/twitchAPI';
import { getCategoryRepository } from '@/repositories/CategoryRepository';
import {
  registerModelContextTool,
  unregisterModelContextTool,
  type ModelContextTool,
} from '@/lib/webmcp/modelContext';
import type { StreamProfileToolDeps } from '@/lib/webmcp/streamProfileTools';
import { createStreamProfileTools } from '@/lib/webmcp/streamProfileTools';

/** Default `resolveCategory`: the first `CategoryRepository.search` hit, or `null`. */
async function resolveCategoryFromRepository(name: string): Promise<StreamCategory | null> {
  const result = await getCategoryRepository().search(name, 1);
  return result.success && result.data && result.data.length > 0 ? result.data[0] : null;
}

/**
 * Registers `tools` with the browser's model context while `enabled` is true.
 *
 * Pass a referentially stable `tools` array (`useMemo`) — the effect re-runs whenever the array
 * identity changes, which unregisters the previous tools before registering the new ones. Handlers
 * that need fresh data should close over a ref rather than being rebuilt on every render.
 */
export function useModelContextTools(tools: readonly ModelContextTool[], enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    tools.forEach(registerModelContextTool);

    return () => {
      tools.forEach(tool => unregisterModelContextTool(tool.name));
    };
  }, [tools, enabled]);
}

/** What `useWebMCP` needs from the app's auth and profile state. */
export interface UseWebMCPOptions {
  /** Tools exist only for a signed-in user — the agent acts as them, via their Twitch session. */
  isAuthenticated: boolean;
  /** Current profiles; changes are picked up by already-registered tools through a ref. */
  profiles: readonly StreamProfile[];
  /** Override the Twitch call in tests; defaults to the app's existing `applyProfile` path. */
  applyProfile?: StreamProfileToolDeps['applyProfile'];
  /** Override category resolution in tests; defaults to `CategoryRepository.search`. */
  resolveCategory?: StreamProfileToolDeps['resolveCategory'];
  /** Observes every tool execution (for the WebMCP Hub log). Read through a ref, so it needn't be stable. */
  onToolCall?: (call: ToolCall) => void;
}

/** One completed tool execution, as reported to `onToolCall`. */
export interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  result: unknown;
  at: number;
}

/**
 * Exposes the three stream-profile tools to a WebMCP-capable browser while the user is signed in.
 *
 * Profiles are read through a ref at call time, so the tools are built once and stay correct as
 * the user creates or edits profiles — re-registering on every profile change would churn the
 * browser's registry and risk the agent seeing a momentarily empty tool list.
 */
export function useWebMCP({ isAuthenticated, profiles, applyProfile, resolveCategory, onToolCall }: UseWebMCPOptions): void {
  const profilesRef = useRef<readonly StreamProfile[]>(profiles);
  profilesRef.current = profiles;
  const onToolCallRef = useRef(onToolCall);
  onToolCallRef.current = onToolCall;

  const tools = useMemo(
    () =>
      createStreamProfileTools({
        getProfiles: () => profilesRef.current,
        applyProfile: applyProfile ?? (profile => getTwitchAPI().applyProfile(profile)),
        resolveCategory: resolveCategory ?? resolveCategoryFromRepository,
      }).map(tool => ({
        ...tool,
        execute: async (input: Record<string, unknown>) => {
          const result = await tool.execute(input);
          onToolCallRef.current?.({ tool: tool.name, input, result, at: Date.now() });
          return result;
        },
      })),
    [applyProfile, resolveCategory],
  );

  useModelContextTools(tools, isAuthenticated);
}
