import { test, expect } from '@playwright/test';

/**
 * Manual category payload and styled validation regression tests
 *
 * C-9: Submitting the create form without a category must render the app's
 *      styled "Category is required" message — a native `required` attribute
 *      on the dropdown input must not block the submit event.
 * C-4: A manually-typed category carries a synthetic id. Applying a profile
 *      with a manual category must never send that synthetic id to Twitch as
 *      game_id — the PATCH body must omit it entirely.
 */

const PROFILE_NAME = 'Manual Payload Profile';
const MANUAL_CATEGORY = 'My Made Up Category';

test.describe('Manual category payload and styled validation', () => {
  test.beforeEach(async ({ page }) => {
    // Seed a valid Twitch auth token so the Apply flow is authenticated and
    // the PATCH wire can be observed. Replicates the IndexedDB schema the app
    // creates (StreamChameleonDB v1).
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
          const token = {
            access_token: 'playwright-test-token',
            token_type: 'bearer',
            expires_in: 3600,
            scope: ['channel:manage:broadcast'],
            obtainedAt: now,
            expiresAt: new Date(now.getTime() + 3_600_000),
            userId: '987654321',
          };
          const tx = db.transaction('auth', 'readwrite');
          tx.objectStore('auth').put({ key: 'token', value: token, updatedAt: now });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error ?? new Error('token seeding failed'));
        };
        open.onerror = () => reject(open.error ?? new Error('db open failed'));
      });
    });

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

  test('empty submit shows the styled category error (validateForm owns messaging)', async ({ page }) => {
    await page.goto('/profile/new');

    await page.fill('input[name="name"]', 'Styled Error Check');
    await page.fill('input[name="title"]', 'Styled Error Check Title');

    // Submit without selecting a category
    await page.click('button:has-text("Create Preset")');

    // The app's styled validation message must render — a native validation
    // bubble blocking the submit event would leave it invisible
    const errorMessage = page.locator('text=/category.*required/i');
    await expect(errorMessage).toBeVisible();

    // And the form must not have navigated away
    await expect(page).toHaveURL(/\/profile\/new/);
  });

  test('applying a manual category never sends a synthetic game_id to Twitch', async ({ page }) => {
    const channelUpdateBodies: Array<Record<string, unknown>> = [];

    // Intercept the channel-update call — this is the wire the constraint
    // protects: no synthetic id may ride it as game_id. The C2 status card
    // also GETs this endpoint on mount; that read carries no body, so only
    // writes are recorded as wire truth and the GET gets a valid empty
    // channels response.
    await page.route('**/api.twitch.tv/helix/channels**', async (route) => {
      if (route.request().method() !== 'PATCH') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [] }),
        });
        return;
      }
      const body = route.request().postDataJSON() as Record<string, unknown>;
      channelUpdateBodies.push(body);
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/profile/new');

    await page.fill('input[name="name"]', PROFILE_NAME);
    await page.fill('input[name="title"]', 'Manual Category Title');

    // Type a category that does not exist in Twitch results, then blur so the
    // dropdown's manual-entry fallback stores it
    const categoryInput = page.locator('input[placeholder*="Search for a category" i]');
    await categoryInput.fill(MANUAL_CATEGORY);
    await categoryInput.blur();
    await page.waitForTimeout(400); // blur fallback commits after a 200ms delay

    // Save the profile
    await page.click('button:has-text("Create Preset")');
    await expect(page).toHaveURL('/presets', { timeout: 10_000 });
    // Scope to the card heading: the name also appears in the Quick Morph chips
    await expect(page.locator('[data-testid="preset-card"]').getByRole('heading', { name: PROFILE_NAME })).toBeVisible();

    // Apply it to the (mocked) Twitch channel
    page.on('dialog', (dialog) => dialog.accept());
    await page.locator('[data-testid="preset-card"]').first().getByRole('button', { name: /apply to stream/i }).click();

    // The PATCH must actually have been made, else the assertions below are vacuous
    await expect
      .poll(() => channelUpdateBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    for (const body of channelUpdateBodies) {
      const gameId = body.game_id as string | undefined;

      // No non-numeric game_id may ever appear on the wire
      if (gameId !== undefined) {
        expect(gameId, `non-numeric game_id reached Twitch: ${gameId}`).toMatch(/^\d+$/);
      }

      // This profile's category is manual — its synthetic id must be omitted
      expect(body, 'manual category must not send game_id to Twitch').not.toHaveProperty('game_id');
      expect(typeof body.title).toBe('string');
    }
  });
});
