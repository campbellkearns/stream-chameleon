import { test, expect, Page } from '@playwright/test';

/**
 * Dynamic Title Templating Tests
 * Tests {DAY} and {YYYY-MM-DD} template variable replacement
 */

/** Select a category from the search dropdown */
async function selectCategory(page: Page, query: string) {
  const categoryInput = page.locator('input[placeholder*="Search for a category" i]');
  await categoryInput.fill(query);
  await page.waitForTimeout(500);
  await page.locator(`button[role="option"]:has-text("${query}")`).first().click();
}

test.describe('Dynamic Title Templating', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/presets');
    await page.waitForSelector('h1:has-text("Presets")', { timeout: 10000 });
  });

  test('should replace {DAY} with current day of week', async ({ page }) => {
    // Get current day
    const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    // Create profile with {DAY} template
    await page.locator('a[href="/profile/new"]').filter({ visible: true }).first().click();
    await page.fill('input[name="name"]', 'Day Template Test');
    await page.fill('input[name="title"]', 'Streaming on {DAY}');
    await selectCategory(page, 'Just Chatting');
    await page.click('button[type="submit"]');
    await page.waitForURL('/presets');

    // Check that the profile card shows the processed title
    const profileCard = page.locator('[data-testid="preset-card"]', { hasText: 'Day Template Test' });
    await expect(profileCard.locator(`text=Streaming on ${currentDay}`)).toBeVisible();
  });

  test('should replace {YYYY-MM-DD} with current date', async ({ page }) => {
    // Get current date in YYYY-MM-DD format
    // Local calendar day, matching processTitle (a UTC date drifts a day in the evening west of UTC)
    const now = new Date();
    const currentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Create profile with {YYYY-MM-DD} template
    await page.locator('a[href="/profile/new"]').filter({ visible: true }).first().click();
    await page.fill('input[name="name"]', 'Date Template Test');
    await page.fill('input[name="title"]', 'Stream {YYYY-MM-DD}');
    await selectCategory(page, 'Just Chatting');
    await page.click('button[type="submit"]');
    await page.waitForURL('/presets');

    // Check that the profile card shows the processed title
    const profileCard = page.locator('[data-testid="preset-card"]', { hasText: 'Date Template Test' });
    await expect(profileCard.locator(`text=Stream ${currentDate}`)).toBeVisible();
  });

  test('should handle multiple template variables in one title', async ({ page }) => {
    const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    // Local calendar day, matching processTitle (a UTC date drifts a day in the evening west of UTC)
    const now = new Date();
    const currentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Create profile with both templates
    await page.locator('a[href="/profile/new"]').filter({ visible: true }).first().click();
    await page.fill('input[name="name"]', 'Multiple Templates Test');
    await page.fill('input[name="title"]', '{DAY} Stream - {YYYY-MM-DD}');
    await selectCategory(page, 'Just Chatting');
    await page.click('button[type="submit"]');
    await page.waitForURL('/presets');

    // Check that both are replaced
    const profileCard = page.locator('[data-testid="preset-card"]', { hasText: 'Multiple Templates Test' });
    await expect(profileCard.locator(`text=${currentDay} Stream - ${currentDate}`)).toBeVisible();
  });

  test('should not replace invalid template syntax', async ({ page }) => {
    // Create profile with invalid template
    await page.locator('a[href="/profile/new"]').filter({ visible: true }).first().click();
    await page.fill('input[name="name"]', 'Invalid Template Test');
    await page.fill('input[name="title"]', 'Stream {INVALID} {day}');
    await selectCategory(page, 'Just Chatting');
    await page.click('button[type="submit"]');
    await page.waitForURL('/presets');

    // Invalid templates should remain unchanged
    const profileCard = page.locator('[data-testid="preset-card"]', { hasText: 'Invalid Template Test' });
    await expect(profileCard.locator('text=Stream {INVALID} {day}')).toBeVisible();
  });

  test('should show original template on hover/tooltip', async ({ page }) => {
    // Create profile with template
    await page.locator('a[href="/profile/new"]').filter({ visible: true }).first().click();
    await page.fill('input[name="name"]', 'Tooltip Test');
    await page.fill('input[name="title"]', 'Daily {DAY} Stream');
    await selectCategory(page, 'Just Chatting');
    await page.click('button[type="submit"]');
    await page.waitForURL('/presets');

    // Check if title element has a tooltip showing original template
    const profileCard = page.locator('[data-testid="preset-card"]', { hasText: 'Tooltip Test' });
    const titleElement = profileCard.locator('[title*="Daily {DAY} Stream"]');

    // The title attribute should contain the original template
    // Wait for the async render instead of racing it with a bare count()
    await expect(titleElement).toBeVisible();
  });

  test('should process templates when profile is edited', async ({ page }) => {
    const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    // Create profile without template
    await page.locator('a[href="/profile/new"]').filter({ visible: true }).first().click();
    await page.fill('input[name="name"]', 'Edit Template Test');
    await page.fill('input[name="title"]', 'Regular Title');
    await selectCategory(page, 'Just Chatting');
    await page.click('button[type="submit"]');
    await page.waitForURL('/presets');

    // Edit to add template
    const profileCard = page.locator('[data-testid="preset-card"]', { hasText: 'Edit Template Test' });
    await profileCard.hover();
    await profileCard.locator('a[title*="Edit" i]').click();

    await page.fill('input[name="title"]', '{DAY} Updated Title');
    await page.click('button[type="submit"]');
    await page.waitForURL('/presets');

    // Should show processed template
    await expect(page.locator(`text=${currentDay} Updated Title`)).toBeVisible();
  });
});
