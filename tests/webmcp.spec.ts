import { test, expect, type Page } from '@playwright/test';

/**
 * WebMCP end-to-end coverage (spec deliverable 5, art_H22sCdEk).
 *
 * No real WebMCP-capable browser runs in CI, so these specs stand in for the browser's side of
 * the contract: `navigator.modelContext` is replaced — via `addInitScript`, before the app's own
 * script runs — with a minimal registry that records whatever `useWebMCP` registers. "The agent
 * calls a tool" is then invoking the captured `execute` function directly: exactly what a real
 * WebMCP browser does when the user's agent invokes a tool the page registered by name.
 *
 * Assertions poll `window.__webmcpTools` directly rather than the Settings/Layout availability
 * hint, so these specs hold across every project in `playwright.config.ts` (including the mobile
 * viewports, where the hint only renders once the nav menu is opened).
 */

const TOOL_NAMES = ['activate_stream_profile', 'list_stream_profiles', 'update_stream_details'];

type MockTool = { name: string; execute: (input: Record<string, unknown>) => Promise<unknown> };

/** Installs the mock `navigator.modelContext` registry `useWebMCP` registers tools into. */
async function mockModelContext(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const tools = new Map<string, MockTool>();
    (window as unknown as { __webmcpTools: Map<string, MockTool> }).__webmcpTools = tools;

    Object.defineProperty(window.navigator, 'modelContext', {
      configurable: true,
      value: {
        registerTool: (tool: MockTool) => {
          tools.set(tool.name, tool);
        },
        unregisterTool: (name: string) => {
          tools.delete(name);
        },
      },
    });
  });
}

/** Mocks the Twitch Helix calls every authenticated mount makes: the health check and user lookup. */
async function mockTwitchSession(page: Page): Promise<void> {
  await page.route('**/api.twitch.tv/helix/games*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
  });
  await page.route('**/api.twitch.tv/helix/users*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: '987654321',
            login: 'playwrightstreamer',
            display_name: 'Playwright Streamer',
            broadcaster_type: '',
            description: '',
            profile_image_url: '',
            offline_image_url: '',
            view_count: 0,
            created_at: '2020-01-01T00:00:00Z',
          },
        ],
      }),
    });
  });
}

interface SeededProfile {
  id: string;
  name: string;
  category: { id: string; name: string };
  title: string;
  tags: string[];
}

/**
 * Seeds the IndexedDB schema (StreamChameleonDB v1) with an auth token and, optionally, one
 * profile — before the app's first paint, so `useAuthState`/`useProfiles` see them on mount.
 * Schema mirrors what `manual-category-payload.spec.ts` seeds for auth.
 */
async function seedFixtures(
  page: Page,
  params: { tokenObtainedAtMs: number; tokenExpiresAtMs: number; profile?: SeededProfile },
): Promise<void> {
  await page.addInitScript((seed) => {
    return new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('StreamChameleonDB', 1);
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('profiles')) {
          const profiles = db.createObjectStore('profiles', { keyPath: 'id' });
          profiles.createIndex('name', 'name');
          profiles.createIndex('createdAt', 'createdAt');
          profiles.createIndex('updatedAt', 'updatedAt');
          profiles.createIndex('category', 'category.name');
        }
        if (!db.objectStoreNames.contains('categories')) {
          const categories = db.createObjectStore('categories', { keyPath: 'id' });
          categories.createIndex('name', 'name');
          categories.createIndex('cachedAt', 'cachedAt');
        }
        if (!db.objectStoreNames.contains('auth')) {
          db.createObjectStore('auth', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('preferences')) {
          db.createObjectStore('preferences', { keyPath: 'key' });
        }
      };
      open.onsuccess = () => {
        const db = open.result;
        const now = new Date();
        const token = {
          access_token: 'playwright-webmcp-token',
          token_type: 'bearer',
          expires_in: Math.round((seed.tokenExpiresAtMs - seed.tokenObtainedAtMs) / 1000),
          scope: ['channel:manage:broadcast'],
          obtainedAt: new Date(seed.tokenObtainedAtMs),
          expiresAt: new Date(seed.tokenExpiresAtMs),
          userId: '987654321',
        };

        const stores = seed.profile ? ['auth', 'profiles'] : ['auth'];
        const tx = db.transaction(stores, 'readwrite');
        tx.objectStore('auth').put({ key: 'token', value: token, updatedAt: now });
        if (seed.profile) {
          tx.objectStore('profiles').put({ ...seed.profile, createdAt: now, updatedAt: now });
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error ?? new Error('fixture seeding failed'));
      };
      open.onerror = () => reject(open.error ?? new Error('db open failed'));
    });
  }, params);
}

/**
 * Mocks `helix/channels` for both call sites that share the URL: the PATCH under test, and the
 * unrelated GET the "Now on your channel" status card fires on every authenticated mount. Only
 * PATCH bodies are captured — the status card's GET must not be mistaken for the profile apply.
 */
async function mockChannelsEndpoint(page: Page): Promise<Array<Record<string, unknown> | null>> {
  const patchBodies: Array<Record<string, unknown> | null> = [];
  await page.route('**/api.twitch.tv/helix/channels**', async (route) => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      patchBodies.push(request.postDataJSON() as Record<string, unknown> | null);
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    // GET: the status card's own poll — stub a harmless offline channel so it resolves instead
    // of hanging, without affecting the PATCH assertions below.
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            broadcaster_id: '987654321',
            broadcaster_login: 'playwrightstreamer',
            broadcaster_name: 'Playwright Streamer',
            broadcaster_language: 'en',
            game_id: '',
            game_name: '',
            title: '',
            delay: 0,
            tags: [],
            content_classification_labels: [],
            is_branded_content: false,
          },
        ],
      }),
    });
  });
  return patchBodies;
}

/** Reads the registered tool names, sorted, from the mock registry — `[]` before registration. */
function registeredToolNames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const tools = (window as unknown as { __webmcpTools?: Map<string, MockTool> }).__webmcpTools;
    return tools ? Array.from(tools.keys()).sort() : [];
  });
}

/** Invokes a registered tool exactly as an agent would: by name, with JSON-shaped arguments. */
function callTool(page: Page, name: string, input: Record<string, unknown>): Promise<unknown> {
  return page.evaluate(
    async ({ name: toolName, input: toolInput }) => {
      const tools = (window as unknown as { __webmcpTools?: Map<string, MockTool> }).__webmcpTools;
      const tool = tools?.get(toolName);
      if (!tool) {
        throw new Error(`tool "${toolName}" is not registered`);
      }
      return tool.execute(toolInput);
    },
    { name, input },
  );
}

test.describe('WebMCP agent tools', () => {
  test.beforeEach(async ({ page }) => {
    await mockModelContext(page);
    await mockTwitchSession(page);
  });

  test('registers all three tools once the user is authenticated', async ({ page }) => {
    const now = Date.now();
    await seedFixtures(page, { tokenObtainedAtMs: now, tokenExpiresAtMs: now + 60 * 60 * 1000 });

    await page.goto('/');

    // No tools before auth resolves would be a false pass — assert the transition, not just the
    // end state, so a regression that skips registration entirely can't slip through.
    await expect.poll(() => registeredToolNames(page), { timeout: 15_000 }).toEqual(TOOL_NAMES);
  });

  test('a simulated agent call to activate_stream_profile PATCHes the seeded profile to Twitch', async ({ page }) => {
    const now = Date.now();
    const profile: SeededProfile = {
      id: 'webmcp-e2e-profile',
      name: 'Coding Session',
      category: { id: '509670', name: 'Software and Game Development' },
      title: 'Building Stream Chameleon live',
      tags: ['coding', 'webdev'],
    };
    await seedFixtures(page, { tokenObtainedAtMs: now, tokenExpiresAtMs: now + 60 * 60 * 1000, profile });
    const channelUpdateBodies = await mockChannelsEndpoint(page);

    await page.goto('/');
    await expect.poll(() => registeredToolNames(page), { timeout: 15_000 }).toEqual(TOOL_NAMES);

    // Lower-case, fuzzy-matched query — an agent relaying "activate my coding session" wouldn't
    // reproduce the profile's exact casing.
    const result = await callTool(page, 'activate_stream_profile', { profile: 'coding session' });

    expect(result).toEqual({
      ok: true,
      applied: { title: profile.title, category: profile.category.name, tags: profile.tags },
    });

    // The tool call must actually have reached the wire, else the payload assertions below are
    // vacuous.
    await expect.poll(() => channelUpdateBodies.length, { timeout: 15_000 }).toBe(1);

    const [body] = channelUpdateBodies;
    expect(body.title).toBe(profile.title);
    expect(body.game_id).toBe(profile.category.id);
    expect(body.tags).toEqual(profile.tags);
  });

  test('activating a profile after the token has expired mid-session returns auth_required', async ({ page }) => {
    // Implicit-flow tokens don't refresh (twitchAuth.ts) — a token that ages out mid-session
    // must fail the *next* Twitch call with auth_required, without touching the wire, even
    // though the tools stayed registered from before the expiry (no re-auth event to react to).
    // A real clock can't wait out a token in a test, so the page clock is advanced instead.
    const baseTime = new Date('2026-06-01T12:00:00Z');
    await page.clock.install({ time: baseTime });

    const tokenObtainedAtMs = baseTime.getTime();
    const tokenExpiresAtMs = tokenObtainedAtMs + 10 * 60 * 1000; // valid now; expired in 10 minutes
    const profile: SeededProfile = {
      id: 'webmcp-e2e-expired',
      name: 'Writing Stream',
      category: { id: '509658', name: 'Just Chatting' },
      title: 'Drafting on {DAY}',
      tags: ['writing'],
    };
    await seedFixtures(page, { tokenObtainedAtMs, tokenExpiresAtMs, profile });
    const channelUpdateBodies = await mockChannelsEndpoint(page);

    await page.goto('/');
    await expect.poll(() => registeredToolNames(page), { timeout: 15_000 }).toEqual(TOOL_NAMES);

    // Past expiresAt (10 min) minus the 5-minute validity buffer (twitchAuth.ts) — the token is
    // now invalid, but nothing in the app re-checks it until the next call.
    await page.clock.setFixedTime(new Date(tokenObtainedAtMs + 6 * 60 * 1000));

    const result = await callTool(page, 'activate_stream_profile', { profile: profile.name });

    expect(result).toMatchObject({ ok: false, kind: 'auth_required' });
    expect(channelUpdateBodies).toHaveLength(0);
  });
});
