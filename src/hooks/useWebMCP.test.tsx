import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { APIResult } from '@/lib/api/twitchAPI';
import type { StreamProfile } from '@/types/Profile';
import type { ModelContextTool } from '@/lib/webmcp/modelContext';
import { useWebMCP, type UseWebMCPOptions } from './useWebMCP';

// React 19 requires this flag for act() to work outside react-dom/test-utils.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

interface MockRegistry {
  registerTool: ReturnType<typeof vi.fn>;
}

/** Installs a mock `document.modelContext` (spec shape: async register, unregister by abort). */
function mockModelContext(): MockRegistry {
  const registry = { registerTool: vi.fn() };
  registry.registerTool.mockResolvedValue(undefined);
  Object.defineProperty(document, 'modelContext', { value: registry, configurable: true });
  return registry;
}

/** Removes any `document.modelContext` installed by a previous test. */
function clearModelContext() {
  Object.defineProperty(document, 'modelContext', { value: undefined, configurable: true });
}

function makeProfile(name: string): StreamProfile {
  const now = new Date('2026-09-03T12:00:00Z');
  return {
    id: name,
    name,
    category: { id: '509670', name: 'Science & Technology' },
    title: `${name} title`,
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Renders a probe component running `useWebMCP`, with re-render/unmount controls. */
function renderUseWebMCP(options: UseWebMCPOptions) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  const Probe = (props: UseWebMCPOptions) => {
    useWebMCP(props);
    return null;
  };

  const harness = {
    rerender(next: UseWebMCPOptions) {
      act(() => {
        root.render(<Probe {...next} />);
      });
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };

  harness.rerender(options);
  return harness;
}

function registeredNames(registry: MockRegistry): string[] {
  return registry.registerTool.mock.calls.map((call: [ModelContextTool]) => call[0].name);
}

/** Tools whose registration signal has been aborted, in registration order. */
function unregisteredNames(registry: MockRegistry): string[] {
  return registry.registerTool.mock.calls
    .filter(call => (call[1] as { signal: AbortSignal }).signal.aborted)
    .map(call => (call[0] as ModelContextTool).name);
}

describe('useWebMCP', () => {
  let registry: MockRegistry;
  let applyProfile: ReturnType<typeof vi.fn>;

  const options = (overrides: Partial<UseWebMCPOptions> = {}): UseWebMCPOptions => ({
    isAuthenticated: true,
    profiles: [makeProfile('Writing Stream')],
    applyProfile: applyProfile as unknown as UseWebMCPOptions['applyProfile'],
    ...overrides,
  });

  beforeEach(() => {
    registry = mockModelContext();
    applyProfile = vi.fn(async (): Promise<APIResult<boolean>> => ({ success: true, data: true }));
  });

  afterEach(() => {
    clearModelContext();
  });

  it('registers the three tools when authenticated', () => {
    renderUseWebMCP(options());

    expect(registeredNames(registry)).toEqual([
      'list_stream_profiles',
      'activate_stream_profile',
      'update_stream_details',
    ]);
  });

  it('registers nothing when signed out', () => {
    renderUseWebMCP(options({ isAuthenticated: false }));

    expect(registry.registerTool).not.toHaveBeenCalled();
  });

  it('unregisters on sign-out', () => {
    const harness = renderUseWebMCP(options());

    harness.rerender(options({ isAuthenticated: false }));

    expect(unregisteredNames(registry)).toEqual([
      'list_stream_profiles',
      'activate_stream_profile',
      'update_stream_details',
    ]);
    expect(registry.registerTool).toHaveBeenCalledTimes(3);
  });

  it('unregisters on unmount', () => {
    const harness = renderUseWebMCP(options());

    harness.unmount();

    expect(unregisteredNames(registry)).toEqual([
      'list_stream_profiles',
      'activate_stream_profile',
      'update_stream_details',
    ]);
  });

  it('is a silent no-op when the browser has no model context', () => {
    clearModelContext();

    expect(() => renderUseWebMCP(options())).not.toThrow();
  });

  it('does not churn the registry when profiles change while signed in', () => {
    const harness = renderUseWebMCP(options());

    harness.rerender(options({ profiles: [makeProfile('Coding Stream')] }));

    expect(registry.registerTool).toHaveBeenCalledTimes(3);
    expect(unregisteredNames(registry)).toEqual([]);
  });

  it('serves current profiles to an already-registered tool', async () => {
    const harness = renderUseWebMCP(options());
    const listTool = registry.registerTool.mock.calls.find(
      (call: [ModelContextTool]) => call[0].name === 'list_stream_profiles',
    )![0] as ModelContextTool;

    harness.rerender(options({ profiles: [makeProfile('Writing Stream'), makeProfile('IRL Stream')] }));

    await expect(listTool.execute({})).resolves.toEqual({
      ok: true,
      profiles: [
        expect.objectContaining({ name: 'Writing Stream' }),
        expect.objectContaining({ name: 'IRL Stream' }),
      ],
    });
  });

  it('routes activation through the injected Twitch apply path', async () => {
    renderUseWebMCP(options());
    const activateTool = registry.registerTool.mock.calls.find(
      (call: [ModelContextTool]) => call[0].name === 'activate_stream_profile',
    )![0] as ModelContextTool;

    await activateTool.execute({ profile: 'writing stream' });

    expect(applyProfile).toHaveBeenCalledTimes(1);
    expect(applyProfile.mock.calls[0][0].name).toBe('Writing Stream');
  });
});
