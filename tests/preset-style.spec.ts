import { test, expect, type Page } from '@playwright/test';

/**
 * Preset icon, accent, and recent categories
 */

async function createPreset(page: Page, name: string, opts: { icon?: string; accent?: string } = {}) {
  await page.goto('/profile/new');
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="title"]', `${name} stream`);

  const categoryInput = page.locator('input[placeholder*="Search for a category" i]');
  await categoryInput.fill('Just Chatting');
  await page.waitForTimeout(500);
  await page.locator('button[role="option"]:has-text("Just Chatting")').first().click();

  if (opts.icon) await page.click(`button[aria-label="Use ${opts.icon} as icon"]`);
  if (opts.accent) await page.click(`button[aria-label="${opts.accent} accent"]`);

  await page.click('button:has-text("Create Preset")');
  await expect(page).toHaveURL('/presets');
}

test.describe('Preset Style', () => {
  test('should default new presets to a gamepad icon and indigo accent', async ({ page }) => {
    await page.goto('/profile/new');
    await expect(page.locator('[data-testid="preset-icon-preview"]')).toHaveText('🎮');
    await expect(page.locator('button[aria-label="Indigo accent"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('should save icon and accent and show them on the card', async ({ page }) => {
    await createPreset(page, 'Code Night', { icon: '💻', accent: 'Emerald' });

    const card = page.locator('[data-testid="preset-card"]', { hasText: 'Code Night' });
    await expect(card).toContainText('💻');

    await card.locator('a[title*="Edit"]').click();
    await expect(page.locator('[data-testid="preset-icon-preview"]')).toHaveText('💻');
    await expect(page.locator('button[aria-label="Emerald accent"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('should accept a custom emoji and reject more than one', async ({ page }) => {
    await page.goto('/profile/new');
    const iconInput = page.locator('input[name="icon"]');

    await iconInput.fill('🦎');
    await expect(page.locator('[data-testid="preset-icon-preview"]')).toHaveText('🦎');

    await page.fill('input[name="name"]', 'Two Icons');
    await page.fill('input[name="title"]', 'Test');
    const categoryInput = page.locator('input[placeholder*="Search for a category" i]');
    await categoryInput.fill('Just Chatting');
    await page.waitForTimeout(500);
    await page.locator('button[role="option"]:has-text("Just Chatting")').first().click();
    await iconInput.fill('🦎🦎');
    await page.click('button:has-text("Create Preset")');
    await expect(page.locator('text=Use a single emoji')).toBeVisible();
    await expect(page).toHaveURL(/\/profile\/new/);
  });

  test('should offer recently used categories', async ({ page }) => {
    await createPreset(page, 'Chatting');

    await page.goto('/profile/new');
    const recent = page.locator('[data-testid="recent-categories"]');
    await expect(recent).toBeVisible();

    await recent.locator('button', { hasText: 'Just Chatting' }).click();
    await expect(page.locator('input[placeholder*="Search for a category" i]')).toHaveValue('Just Chatting');
    await expect(recent.locator('button', { hasText: 'Just Chatting' })).toHaveAttribute('aria-pressed', 'true');
  });
});
