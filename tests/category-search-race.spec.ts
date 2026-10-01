import { test, expect } from '@playwright/test';

/**
 * Category search race regression (C-6)
 *
 * The debounced search effect in useCategorySearch must discard stale
 * responses: an earlier, slower search that resolves after a later query
 * must not overwrite the later query's results.
 *
 * The app only issues real Twitch search requests when it holds an auth
 * token (unauthenticated searches short-circuit to the local cache), so the
 * test fabricates a token in IndexedDB and intercepts /helix/games to make
 * the first query's response resolve after the second's.
 */

const FIRST_QUERY = 'slow query game';
const SECOND_QUERY = 'fast query game';

const gamesPayload = (id: string, name: string) =>
  JSON.stringify({ data: [{ id, name, box_art_url: '', igdb_id: '' }] });

test.describe('Category search race', () => {
  test('latest query wins when an earlier search resolves after it', async ({ page }) => {
    // Two intercepted searches against the Twitch games endpoint: the first
    // query's response is delayed so it resolves after the second's.
    await page.route(/\/helix\/games/, async (route) => {
      const name = new URL(route.request().url()).searchParams.get('name');
      if (name === FIRST_QUERY) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.fulfill({ status: 200, contentType: 'application/json', body: gamesPayload('9001', 'Slow Game') });
        return;
      }
      if (name === SECOND_QUERY) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: gamesPayload('9002', 'Fast Game') });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
    });

    await page.goto('/profile/new');
    const input = page.locator('input[placeholder*="Search for a category" i]');
    await input.click();

    // Wait for the initial category load to finish (the app creates the
    // IndexedDB schema on first use) before injecting the token.
    await page.waitForFunction(() => {
      const dropdown = document.querySelector('#category-dropdown');
      return !!dropdown && /No categories available|Popular Categories/.test(dropdown.textContent || '');
    });

    // Fabricate an auth token: token validation only checks expiry and
    // searches re-read the token from IndexedDB, so this enables real HTTP
    // searches without going through the OAuth redirect flow.
    await page.evaluate(async () => {
      const token = {
        access_token: 'playwright-token',
        token_type: 'bearer',
        expires_in: 14400,
        obtainedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        userId: '12345678',
      };
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('StreamChameleonDB');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('auth', 'readwrite');
        tx.objectStore('auth').put({ key: 'token', value: token, updatedAt: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    });

    // Issue the first search and let it hang in flight.
    const firstRequest = page.waitForRequest(
      (r) => r.url().includes('/helix/games') && new URL(r.url()).searchParams.get('name') === FIRST_QUERY
    );
    const firstResponse = page.waitForResponse(
      (r) => r.url().includes('/helix/games') && new URL(r.url()).searchParams.get('name') === FIRST_QUERY
    );
    await input.fill(FIRST_QUERY);
    await firstRequest;

    // Type a second query; its response resolves immediately.
    const secondResponse = page.waitForResponse(
      (r) => r.url().includes('/helix/games') && new URL(r.url()).searchParams.get('name') === SECOND_QUERY
    );
    await input.fill(SECOND_QUERY);
    await secondResponse;

    // The latest query's result is shown...
    const fastGame = page.locator('button[role="option"]:has-text("Fast Game")');
    await expect(fastGame).toBeVisible();

    // ...and still is once the slow first response finally lands: the stale
    // response must be discarded instead of overwriting the results.
    await firstResponse;
    await expect(fastGame).toBeVisible();
    await expect(page.locator('button[role="option"]:has-text("Slow Game")')).toHaveCount(0);
  });
});
