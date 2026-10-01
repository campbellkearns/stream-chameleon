import { test, expect, BrowserContext, Page } from '@playwright/test';

/**
 * Offline Mode Tests
 * Tests IndexedDB storage, offline profile CRUD, and sync functionality
 */

/** Select a category from the search dropdown */
async function selectCategory(page: Page, query: string) {
  const categoryInput = page.locator('input[placeholder*="Search for a category" i]');
  await categoryInput.fill(query);
  await page.waitForTimeout(500);
  await page.locator(`button[role="option"]:has-text("${query}")`).first().click();
}

/**
 * Simulate offline at the route level instead of context.setOffline():
 * the app reacts to fetch failures only (it never reads navigator.onLine —
 * zero hits in src/), so aborting external origins is behaviorally
 * equivalent to a network cut while leaving the localhost document fetch
 * alone. setOffline(true) kills the document fetch itself, and with no
 * service worker in dev there is nothing to serve a page.reload() from.
 */
function simulateOffline(context: BrowserContext): void {
  context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1).*$/, (route) => route.abort('failed'));
}

/**
 * Seed a valid auth token into the IndexedDB auth store — the exact record
 * shape storeToken writes (twitchAuth.ts), keyed 'token' in the 'auth'
 * store. Health is optimistic while unauthenticated, so the banner and
 * disabled-Apply assertions need a stored token to be reachable at all;
 * expiresAt is now + 1h, clearing the 5-minute validity buffer.
 */
async function seedAuthToken(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const now = Date.now();
    const token = {
      access_token: 'playwright_seed_token',
      token_type: 'bearer',
      expires_in: 3600,
      scope: ['channel:manage:broadcast'],
      obtainedAt: new Date(now),
      expiresAt: new Date(now + 60 * 60 * 1000),
      userId: 'playwright_test_user',
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('StreamChameleonDB');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['auth'], 'readwrite');
      transaction.objectStore('auth').put({
        key: 'token',
        value: token,
        updatedAt: new Date(now),
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  });
}

test.describe('Offline Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/presets');
    await page.waitForSelector('h1:has-text("Presets")', { timeout: 10000 });
  });

  test('should store profiles in IndexedDB', async ({ page }) => {
    // Create a profile
    await page.locator('a[href="/profile/new"]').filter({ visible: true }).first().click();
    await page.fill('input[name="name"]', 'Offline Test Profile');
    await page.fill('input[name="title"]', 'Testing offline storage');
    await selectCategory(page, 'Just Chatting');
    await page.click('button[type="submit"]');
    await page.waitForURL('/presets');

    // Check IndexedDB for the profile
    const hasProfile = await page.evaluate(async () => {
      const request = indexedDB.open('StreamChameleonDB');

      return new Promise((resolve) => {
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction(['profiles'], 'readonly');
          const store = transaction.objectStore('profiles');
          const getAllRequest = store.getAll();

          getAllRequest.onsuccess = () => {
            const profiles = getAllRequest.result;
            const hasOfflineProfile = profiles.some((p: any) =>
              p.name === 'Offline Test Profile'
            );
            resolve(hasOfflineProfile);
          };
        };
      });
    });

    expect(hasProfile).toBeTruthy();
  });

  test('should create profiles while offline', async ({ page, context }) => {
    // Cut external origins; SPA navigation and IndexedDB writes stay local
    simulateOffline(context);

    // Try to create a profile
    await page.locator('a[href="/profile/new"]').filter({ visible: true }).first().click();
    await page.fill('input[name="name"]', 'Offline Created Profile');
    await page.fill('input[name="title"]', 'Created while offline');
    await selectCategory(page, 'Just Chatting');

    // Submit should work (stored locally)
    await page.click('button[type="submit"]');

    // Should redirect even when offline
    await expect(page).toHaveURL('/presets', { timeout: 5000 });

    // Profile should appear in the list (from IndexedDB)
    await expect(page.locator('[data-testid="preset-card"]', { hasText: 'Offline Created Profile' })).toBeVisible();
  });

  test('should edit profiles while offline', async ({ page, context }) => {
    // First create a profile while online
    await page.locator('a[href="/profile/new"]').filter({ visible: true }).first().click();
    await page.fill('input[name="name"]', 'Profile for Offline Edit');
    await page.fill('input[name="title"]', 'Original offline title');
    await selectCategory(page, 'Just Chatting');
    await page.click('button[type="submit"]');
    await page.waitForURL('/presets');

    // Cut external origins; SPA navigation and IndexedDB writes stay local
    simulateOffline(context);

    // Edit the profile
    const profileCard = page.locator('[data-testid="preset-card"]', { hasText: 'Profile for Offline Edit' });
    await profileCard.hover();
    await profileCard.locator('a[title*="Edit" i]').click();

    // Update while offline
    await page.fill('input[name="title"]', 'Updated while offline');
    await page.click('button[type="submit"]');

    // Should work
    await expect(page).toHaveURL('/presets');
    await expect(page.locator('text=Updated while offline')).toBeVisible();
  });

  test('should list profiles while offline', async ({ page, context }) => {
    // Ensure we have at least one profile
    const hasProfiles = await page.locator('[data-testid="preset-card"]').count() > 0;

    if (!hasProfiles) {
      await page.locator('a[href="/profile/new"]').filter({ visible: true }).first().click();
      await page.fill('input[name="name"]', 'Offline Listing Test');
      await page.fill('input[name="title"]', 'For offline listing');
      await selectCategory(page, 'Just Chatting');
      await page.click('button[type="submit"]');
      await page.waitForURL('/presets');
    }

    // Card render is async after the redirect — wait for it before counting
    await expect(page.locator('[data-testid="preset-card"]').first()).toBeVisible();
    const initialCount = await page.locator('[data-testid="preset-card"]').count();

    // Cut external origins; the localhost document still reloads
    simulateOffline(context);

    // Reload the page
    await page.reload();
    await page.waitForSelector('h1:has-text("Presets")');

    // Should still show profiles from IndexedDB
    await expect(page.locator('[data-testid="preset-card"]')).toHaveCount(initialCount);
  });

  test('should handle API unavailability gracefully', async ({ page, context }) => {
    // Health is only pessimistic with a stored token: unauthenticated,
    // checkAPIHealth deliberately short-circuits to isAvailable: true
    await seedAuthToken(page);

    // Cut external origins; the localhost document still reloads
    simulateOffline(context);

    // Reload to simulate app starting offline
    await page.reload();
    await page.waitForSelector('h1:has-text("Presets")');

    // The warning banner appears when the health check fails
    await expect(page.getByText("Can't reach Twitch right now")).toBeVisible();

    // App should still be functional for local operations — New Profile stays navigable
    const newProfileLink = page.locator('a[href="/profile/new"]').filter({ visible: true }).first();
    await expect(newProfileLink).toBeVisible();
    await expect(newProfileLink).toHaveAttribute('href', '/profile/new');
  });

  test('should disable API-dependent actions when offline', async ({ page, context }) => {
    // Ensure we have a profile
    const hasProfiles = await page.locator('[data-testid="preset-card"]').count() > 0;

    if (!hasProfiles) {
      await page.locator('a[href="/profile/new"]').filter({ visible: true }).first().click();
      await page.fill('input[name="name"]', 'API Test Profile');
      await page.fill('input[name="title"]', 'For API testing');
      await selectCategory(page, 'Just Chatting');
      await page.click('button[type="submit"]');
      await page.waitForURL('/presets');
    }

    // Health is only pessimistic with a stored token (see seedAuthToken)
    await seedAuthToken(page);

    // Cut external origins; the localhost document still reloads
    simulateOffline(context);
    await page.reload();
    await page.waitForSelector('h1:has-text("Presets")');

    // The warning banner appears and "Apply to Stream" is disabled
    await expect(page.getByText("Can't reach Twitch right now")).toBeVisible();

    const applyButton = page.locator('button:has-text("Apply to Stream")').first();
    await expect(applyButton).toBeVisible();
    await expect(applyButton).toBeDisabled();
  });
});
