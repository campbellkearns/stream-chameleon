import { test, expect, type Page } from '@playwright/test';

/**
 * Apply history recording (C-1, F-PR-1)
 *
 * The apply verb must leave a wire-truth record behind:
 * - a stored record equals the intercepted PATCH body exactly (title, tags,
 *   gameId) — history can never drift from what Twitch received;
 * - appending past 100 records prunes the oldest (newest 100 always kept);
 * - a forced-failure apply records result 'failed' with an error string and
 *   no success row — failed attempts are evidence, never actionable.
 *
 * Pattern: seed the auth token and a real-category profile via
 * addInitScript (the manual-category-payload pattern) and intercept the
 * channels PATCH with page.route.
 */

const SEEDED_PROFILE = {
  id: 'seed-history-profile',
  name: 'History Wire Truth',
  category: { id: '509670', name: 'Science & Technology' },
  title: 'History Wire Truth Title',
  tags: ['English', 'Programming'],
};

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

async function seedProfileAndAuth(page: Page): Promise<void> {
  await page.addInitScript(() => {
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
        const tx = db.transaction(['profiles', 'auth'], 'readwrite');
        tx.objectStore('profiles').put({
          id: 'seed-history-profile',
          name: 'History Wire Truth',
          category: { id: '509670', name: 'Science & Technology' },
          title: 'History Wire Truth Title',
          tags: ['English', 'Programming'],
          createdAt: now,
          updatedAt: now,
        });
        const token = {
          access_token: 'playwright-test-token',
          token_type: 'bearer',
          expires_in: 3600,
          scope: ['channel:manage:broadcast'],
          obtainedAt: now,
          expiresAt: new Date(now.getTime() + 3_600_000),
          userId: '987654321',
        };
        tx.objectStore('auth').put({ key: 'token', value: token, updatedAt: now });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error ?? new Error('seeding failed'));
      };
      open.onerror = () => reject(open.error ?? new Error('db open failed'));
    });
  });
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

test.describe('Apply history recording', () => {
  test.beforeEach(async ({ page }) => {
    await seedProfileAndAuth(page);

    // Mock the Twitch Helix endpoints used by the dashboard health check and
    // the authenticated user lookup so Apply stays enabled and succeeds.
    await page.route('**/api.twitch.tv/helix/games*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
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
  });

  test('stored record equals the intercepted PATCH wire body', async ({ page }) => {
    const channelUpdateBodies: Array<Record<string, unknown>> = [];

    await page.route('**/api.twitch.tv/helix/channels**', async (route) => {
      // Only the apply verb is the wire truth under test — the channel-status
      // card's GET must not enter the capture list (postDataJSON() is null on GETs).
      if (route.request().method() !== 'PATCH') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        return;
      }
      const body = route.request().postDataJSON() as Record<string, unknown>;
      channelUpdateBodies.push(body);
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/presets');
    await expect(page.getByRole('heading', { name: SEEDED_PROFILE.name })).toBeVisible({ timeout: 15000 });

    page.on('dialog', (dialog) => dialog.accept());
    await page.locator('[data-testid="preset-card"]').first().getByRole('button', { name: /apply to stream/i }).click();

    // The PATCH must actually have been made, else the assertions below are vacuous
    await expect
      .poll(() => channelUpdateBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    // The record is appended before the success alert fires, so it must
    // already exist by the time the PATCH landed.
    await expect.poll(async () => (await readHistory(page)).length, { timeout: 15_000 }).toBe(1);

    const wireBody = channelUpdateBodies[0];
    const [record] = await readHistory(page);

    // Record === wire truth: every stored payload field matches the body
    // Twitch actually received, field for field.
    expect(record.payload.title).toBe(wireBody.title);
    expect(record.payload.tags).toEqual(wireBody.tags);
    expect(record.payload.gameId).toBe(wireBody.game_id);

    // Record metadata
    expect(record.result).toBe('success');
    expect(record.error).toBeUndefined();
    expect(record.source).toBe('apply');
    expect(record.profileId).toBe(SEEDED_PROFILE.id);
    expect(record.profileName).toBe(SEEDED_PROFILE.name);
    expect(record.payload.categoryName).toBe(SEEDED_PROFILE.category.name);
    expect(record.appliedAt).toBeGreaterThan(0);
  });

  test('101 applies keep the newest 100 and prune the oldest', async ({ page }) => {
    // Pruning is a repository contract: exercise the real append path 101
    // times with strictly increasing appliedAt values so the prune order is
    // deterministic (no real-clock ties).
    await page.goto('/presets');

    const names = await page.evaluate(async (): Promise<string[]> => {
      const { getApplyHistoryRepository } = await import('/src/repositories/ApplyHistoryRepository.ts');
      const { createApplyRecord } = await import('/src/types/ProfileUtils.ts');
      const repo = getApplyHistoryRepository();

      const base = Date.now() - 1_000_000;
      for (let i = 1; i <= 101; i++) {
        const record = createApplyRecord({
          profileId: 'seed-history-profile',
          profileName: `Prune Probe ${i}`,
          payload: {
            title: `Prune Probe ${i}`,
            tags: [],
            gameId: '509670',
            categoryName: 'Science & Technology',
          },
          source: 'apply',
          result: 'success',
        });
        record.appliedAt = base + i; // strictly increasing, deterministic prune order

        const appended = await repo.append(record);
        if (!appended.success) {
          throw new Error(`append ${i} failed: ${appended.error?.message ?? 'unknown'}`);
        }
      }

      const result = await repo.getAll();
      if (!result.success || !result.data) {
        throw new Error(`history read failed: ${result.error?.message ?? 'unknown'}`);
      }
      return result.data.map((r) => r.profileName);
    });

    // Newest 100 kept, ordered newest first; the globally oldest row pruned
    expect(names.length).toBe(100);
    expect(names[0]).toBe('Prune Probe 101');
    expect(names[99]).toBe('Prune Probe 2');
    expect(names).not.toContain('Prune Probe 1');
  });

  test('forced-failure apply records result failed with an error and no success row', async ({ page }) => {
    let patchCount = 0;

    await page.route('**/api.twitch.tv/helix/channels**', async (route) => {
      if (route.request().method() !== 'PATCH') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        return;
      }
      patchCount += 1;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Internal Server Error',
          message: 'Forced test failure',
          status: 500,
        }),
      });
    });

    await page.goto('/presets');
    await expect(page.getByRole('heading', { name: SEEDED_PROFILE.name })).toBeVisible({ timeout: 15000 });

    await page.locator('[data-testid="preset-card"]').first().getByRole('button', { name: /apply to stream/i }).click();

    await expect.poll(() => patchCount, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect.poll(async () => (await readHistory(page)).length, { timeout: 15_000 }).toBe(1);

    const [record] = await readHistory(page);

    // The failed attempt is recorded as evidence — result failed, with the
    // error string the API layer surfaced. Failed rows expose no actions
    // downstream (the Dashboard strip gates actions on result === 'success').
    expect(record.result).toBe('failed');
    expect(typeof record.error).toBe('string');
    expect(record.error).toContain('Forced test failure');
    expect(record.source).toBe('apply');
    expect(record.profileId).toBe(SEEDED_PROFILE.id);
    expect(record.payload.title).toBe(SEEDED_PROFILE.title);
    expect(record.payload.gameId).toBe(SEEDED_PROFILE.category.id);
  });
});
