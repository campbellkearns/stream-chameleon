import { test, expect, type Page } from '@playwright/test';

/**
 * Recent-applications strip (feature spec C1 surface, F-PR-2)
 *
 * The strip replays stored wire truth:
 * - Revert re-applies the payload of the most recent SUCCESSFUL record
 *   before the newest successful one — two applies → the FIRST record's
 *   payload must be what the intercepted PATCH carries;
 * - with zero or one successful records, Revert renders disabled;
 * - Apply-again re-PATCHes that row's recorded payload as-is — after the
 *   source profile was edited or deleted, the recorded payload (never the
 *   profile's current state) is what reaches the wire;
 * - manual-category records replay with no game_id at all (C-4 invariant);
 * - the strip renders the newest 5 with an expander for older ones;
 * - failed rows render as evidence with no actions;
 * - a successful replay forces the channel-status card to refetch
 *   immediately (bypassing the 30s throttle) so it reflects the change.
 *
 * Pattern: seed the v2 DB (profiles + auth + applyHistory records) via
 * addInitScript and intercept the channels endpoint with page.route.
 */

type HistoryRecord = {
  id: string;
  profileId: string | null;
  profileName: string;
  payload: { title: string; tags: string[]; gameId: string | null; categoryName: string };
  source: string;
  result: string;
  error?: string;
  appliedAt: number;
};

const USER_ID = '987654321';

interface SeedContext {
  userId: string;
  profiles: Array<Record<string, unknown>>;
  records: HistoryRecord[];
}

/**
 * Serialized seeder: the function body carries no closures, everything
 * dynamic (userId, profiles, history records) rides through the JSON context
 * argument — addInitScript serializes the function without its scope.
 */
function seedScript(context: SeedContext): string {
  const seed = (ctx: SeedContext): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('StreamChameleonDB', 2);
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
        if (!db.objectStoreNames.contains('applyHistory')) {
          const history = db.createObjectStore('applyHistory', { keyPath: 'id' });
          history.createIndex('appliedAt', 'appliedAt');
          history.createIndex('profileId', 'profileId');
        }
      };
      open.onsuccess = () => {
        const db = open.result;
        const now = new Date();
        const tx = db.transaction(['profiles', 'auth', 'applyHistory'], 'readwrite');
        for (const profile of ctx.profiles) {
          tx.objectStore('profiles').put(profile);
        }
        tx.objectStore('auth').put({
          key: 'token',
          value: {
            access_token: 'playwright-test-token',
            token_type: 'bearer',
            expires_in: 3600,
            scope: ['channel:manage:broadcast'],
            obtainedAt: now,
            expiresAt: new Date(now.getTime() + 3600000),
            userId: ctx.userId,
          },
          updatedAt: now,
        });
        for (const record of ctx.records) {
          tx.objectStore('applyHistory').put(record);
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error ?? new Error('seeding failed'));
      };
      open.onerror = () => reject(open.error ?? new Error('db open failed'));
    });
  };

  return `(${seed.toString()})(${JSON.stringify(context)});`;
}


/** A real-category profile — present unless a test deliberately omits it. */
const PROFILE = {
  id: 'seed-strip-profile',
  name: 'Morning Pages',
  category: { id: '509670', name: 'Science & Technology' },
  title: 'Edited Live Title',
  tags: ['English'],
  createdAt: new Date('2026-09-01T10:00:00Z'),
  updatedAt: new Date('2026-09-01T10:00:00Z'),
};

function makeRecord(overrides: Partial<HistoryRecord> & { id: string; appliedAt: number }): HistoryRecord {
  return {
    profileId: PROFILE.id,
    profileName: 'Morning Pages',
    payload: {
      title: 'Recorded Wire Title',
      tags: ['English'],
      gameId: '509670',
      categoryName: 'Science & Technology',
    },
    source: 'apply',
    result: 'success',
    ...overrides,
  };
}

async function readHistory(page: Page): Promise<HistoryRecord[]> {
  return page.evaluate(async (): Promise<HistoryRecord[]> => {
    const { getApplyHistoryRepository } = await import('/src/repositories/ApplyHistoryRepository.ts');
    const result = await getApplyHistoryRepository().getAll();
    if (!result.success || !result.data) {
      throw new Error(`history read failed: ${result.error?.message ?? 'unknown'}`);
    }
    return result.data;
  });
}

test.describe('Recent-applications strip', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the Twitch Helix endpoints the Dashboard mounts against. The
    // channels route is set per-test where the wire is under assertion.
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
              id: USER_ID,
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
  });

  test('Revert replays the FIRST record payload on the wire (two-apply scenario)', async ({ page }) => {
    const patchBodies: Array<Record<string, unknown>> = [];
    await page.route('**/api.twitch.tv/helix/channels**', async (route) => {
      if (route.request().method() !== 'PATCH') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [{ title: 'live', game_name: 'Just Chatting', tags: [] }] }),
        });
        return;
      }
      patchBodies.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    const older = makeRecord({
      id: 'rec-first',
      appliedAt: 1_000,
      payload: { title: 'First Recorded Title', tags: ['English'], gameId: '509670', categoryName: 'Science & Technology' },
    });
    const newest = makeRecord({
      id: 'rec-second',
      appliedAt: 2_000,
      payload: { title: 'Second Recorded Title', tags: ['Chill'], gameId: '509670', categoryName: 'Science & Technology' },
    });

    await page.addInitScript(seedScript({ userId: USER_ID, profiles: [PROFILE], records: [older, newest] }));
    await page.goto('/');
    await expect(page.getByTestId('recent-applications')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('revert-button').click();

    // The PATCH must actually have been made, else the assertions below are vacuous
    await expect.poll(() => patchBodies.length, { timeout: 15_000 }).toBe(1);

    // Revert goes back to the most recent SUCCESSFUL record before the
    // newest — the FIRST record's payload, not the newest one's.
    expect(patchBodies[0].title).toBe('First Recorded Title');
    expect(patchBodies[0].tags).toEqual(['English']);
    expect(patchBodies[0].game_id).toBe('509670');

    // The revert wrote its own history row (source 'revert', success).
    await expect.poll(async () => (await readHistory(page)).length, { timeout: 15_000 }).toBe(3);
    const records = await readHistory(page);
    const revertRow = records.find((r) => r.source === 'revert');
    expect(revertRow).toBeDefined();
    expect(revertRow!.result).toBe('success');
    expect(revertRow!.profileId).toBeNull();
    expect(revertRow!.payload.title).toBe('First Recorded Title');
  });

  test('Revert renders disabled with a single successful record', async ({ page }) => {
    await page.route('**/api.twitch.tv/helix/channels**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ title: 'live', game_name: 'Just Chatting', tags: [] }] }),
      });
    });

    await page.addInitScript(seedScript({ userId: USER_ID, profiles: [PROFILE], records: [makeRecord({ id: 'rec-only', appliedAt: 1_000 })] }));
    await page.goto('/');
    await expect(page.getByTestId('recent-applications')).toBeVisible({ timeout: 15000 });

    // One successful record = nothing to go back to
    await expect(page.getByTestId('revert-button')).toBeDisabled();
  });

  test('manual-category replay sends no game_id (C-4 invariant)', async ({ page }) => {
    const patchBodies: Array<Record<string, unknown>> = [];
    await page.route('**/api.twitch.tv/helix/channels**', async (route) => {
      if (route.request().method() !== 'PATCH') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [{ title: 'live', game_name: '', tags: [] }] }),
        });
        return;
      }
      patchBodies.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    // gameId: null ⇒ manual category: nothing was sent as game_id originally,
    // so the replay must not invent one.
    const manualRecord = makeRecord({
      id: 'rec-manual',
      appliedAt: 1_000,
      payload: { title: 'Manual Category Title', tags: ['English'], gameId: null, categoryName: 'Just Chatting' },
    });

    await page.addInitScript(seedScript({ userId: USER_ID, profiles: [PROFILE], records: [manualRecord] }));
    await page.goto('/');
    await expect(page.getByTestId('recent-applications')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('apply-again-button').click();

    await expect.poll(() => patchBodies.length, { timeout: 15_000 }).toBe(1);
    expect(patchBodies[0].title).toBe('Manual Category Title');
    expect(patchBodies[0]).not.toHaveProperty('game_id');
  });

  test('Apply again replays the recorded payload after the source profile was edited', async ({ page }) => {
    const patchBodies: Array<Record<string, unknown>> = [];
    await page.route('**/api.twitch.tv/helix/channels**', async (route) => {
      if (route.request().method() !== 'PATCH') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [{ title: 'live', game_name: 'Just Chatting', tags: [] }] }),
        });
        return;
      }
      patchBodies.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    // The profile's CURRENT title is "Edited Live Title"; the record's stored
    // payload is the older wire truth. profileId is display metadata, never
    // a lookup key — the replay must send the recorded payload.
    await page.addInitScript(seedScript({ userId: USER_ID, profiles: [PROFILE], records: [makeRecord({ id: 'rec-edit', appliedAt: 1_000 })] }));
    await page.goto('/');
    await expect(page.getByTestId('recent-applications')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('apply-again-button').click();

    await expect.poll(() => patchBodies.length, { timeout: 15_000 }).toBe(1);
    expect(patchBodies[0].title).toBe('Recorded Wire Title');

    const records = await readHistory(page);
    const againRow = records.find((r) => r.source === 'apply-again');
    expect(againRow).toBeDefined();
    expect(againRow!.result).toBe('success');
    expect(againRow!.profileId).toBe(PROFILE.id);
  });

  test('Apply again replays the recorded payload after the source profile was deleted', async ({ page }) => {
    const patchBodies: Array<Record<string, unknown>> = [];
    await page.route('**/api.twitch.tv/helix/channels**', async (route) => {
      if (route.request().method() !== 'PATCH') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [{ title: 'live', game_name: 'Just Chatting', tags: [] }] }),
        });
        return;
      }
      patchBodies.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    // The record points at a profileId that no longer exists.
    const orphaned = makeRecord({
      id: 'rec-orphan',
      appliedAt: 1_000,
      profileId: 'deleted-profile-id',
    });

    await page.addInitScript(seedScript({ userId: USER_ID, profiles: [], records: [orphaned] }));
    await page.goto('/');
    await expect(page.getByTestId('recent-applications')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('apply-again-button').click();

    await expect.poll(() => patchBodies.length, { timeout: 15_000 }).toBe(1);
    expect(patchBodies[0].title).toBe('Recorded Wire Title');
    expect(patchBodies[0].game_id).toBe('509670');
  });

  test('strip renders the newest 5 with an expander for older records', async ({ page }) => {
    await page.route('**/api.twitch.tv/helix/channels**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ title: 'live', game_name: 'Just Chatting', tags: [] }] }),
      });
    });

    const records: HistoryRecord[] = [];
    for (let i = 1; i <= 7; i++) {
      records.push(
        makeRecord({
          id: `rec-expand-${i}`,
          appliedAt: i * 1_000,
          payload: { title: `Expander Title ${i}`, tags: [], gameId: '509670', categoryName: 'Science & Technology' },
        })
      );
    }

    await page.addInitScript(seedScript({ userId: USER_ID, profiles: [PROFILE], records }));
    await page.goto('/');
    await expect(page.getByTestId('recent-applications')).toBeVisible({ timeout: 15000 });

    // Newest 5 only, newest first
    await expect(page.getByTestId('history-row')).toHaveCount(5);
    await expect(page.getByTestId('history-row').first()).toContainText('Expander Title 7');
    await expect(page.getByTestId('history-row').last()).toContainText('Expander Title 3');

    // Expander reveals the rest, then collapses again
    await expect(page.getByTestId('history-expander')).toHaveText('Show all 7 applications');
    await page.getByTestId('history-expander').click();
    await expect(page.getByTestId('history-row')).toHaveCount(7);
    await expect(page.getByTestId('history-expander')).toHaveText('Show fewer');
    await page.getByTestId('history-expander').click();
    await expect(page.getByTestId('history-row')).toHaveCount(5);
  });

  test('failed rows render as evidence with no actions', async ({ page }) => {
    await page.route('**/api.twitch.tv/helix/channels**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ title: 'live', game_name: 'Just Chatting', tags: [] }] }),
      });
    });

    const failedRecord = makeRecord({
      id: 'rec-failed',
      appliedAt: 1_000,
      result: 'failed',
      error: 'Forced test failure',
    });

    await page.addInitScript(seedScript({ userId: USER_ID, profiles: [PROFILE], records: [failedRecord] }));
    await page.goto('/');
    await expect(page.getByTestId('recent-applications')).toBeVisible({ timeout: 15000 });

    const failedRow = page.locator('[data-testid="history-row"][data-result="failed"]');
    await expect(failedRow).toHaveCount(1);
    await expect(failedRow).toContainText('Forced test failure');

    // Failed rows offer no actions at all
    await expect(failedRow.getByTestId('apply-again-button')).toHaveCount(0);
    await expect(page.getByTestId('revert-button')).toBeDisabled();
  });

  test('strip collapses and re-expands from its header toggle', async ({ page }) => {
    await page.route('**/api.twitch.tv/helix/channels**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ title: 'live', game_name: 'Just Chatting', tags: [] }] }),
      });
    });

    await page.addInitScript(seedScript({ userId: USER_ID, profiles: [PROFILE], records: [makeRecord({ id: 'rec-collapse', appliedAt: 1_000 })] }));
    await page.goto('/');
    await expect(page.getByTestId('recent-applications')).toBeVisible({ timeout: 15000 });

    const toggle = page.getByTestId('recent-applications-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('history-row')).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('history-row')).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('history-row')).toBeVisible();
  });

  test('a successful replay forces the channel-status card to refetch immediately', async ({ page }) => {
    let channelGetCount = 0;
    await page.route('**/api.twitch.tv/helix/channels**', async (route) => {
      if (route.request().method() !== 'PATCH') {
        channelGetCount += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [{ title: 'live', game_name: 'Just Chatting', tags: [] }] }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.addInitScript(seedScript({ userId: USER_ID, profiles: [PROFILE], records: [makeRecord({ id: 'rec-refetch', appliedAt: 1_000 })] }));
    await page.goto('/');
    await expect(page.getByTestId('recent-applications')).toBeVisible({ timeout: 15000 });

    // Mount fetch from the status card
    await expect.poll(() => channelGetCount, { timeout: 15_000 }).toBe(1);

    // Replay succeeds → forced status refetch (bypasses the 30s throttle —
    // the replay runs well inside one throttle window after mount).
    await page.getByTestId('apply-again-button').click();
    await expect.poll(() => channelGetCount, { timeout: 15_000 }).toBe(2);
  });
});
