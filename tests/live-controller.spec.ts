import { test, expect } from '@playwright/test';

/**
 * Live Controller Tests
 * Tests the Live tab, tab routing, and "Save as Preset" prefill.
 * Runs unauthenticated, so pushing to Twitch stays disabled.
 */

test.describe('Live Controller', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('h1:has-text("Live Controller")', { timeout: 10000 });
  });

  test('should be the default tab and route between tabs', async ({ page }) => {
    const nav = page.locator('nav');
    await expect(nav.locator('a[aria-current="page"]')).toHaveText(/Live/);

    await nav.locator('a:has-text("Presets")').click();
    await expect(page).toHaveURL('/presets');
    await expect(page.locator('h1:has-text("Presets")')).toBeVisible();
    await expect(nav.locator('a[aria-current="page"]')).toHaveText(/Presets/);

    await nav.locator('a:has-text("Live")').click();
    await expect(page).toHaveURL('/');
    await expect(page.locator('h1:has-text("Live Controller")')).toBeVisible();
  });

  test('should prompt to connect Twitch when signed out', async ({ page }) => {
    const monitor = page.locator('[data-testid="channel-monitor"]');
    await expect(monitor).toContainText('Connect Twitch');
    await expect(monitor.locator('a[href="/auth"]')).toBeVisible();

    await expect(page.locator('button:has-text("Push to Twitch")')).toBeDisabled();
  });

  test('should add and remove tags', async ({ page }) => {
    const tagInput = page.locator('#live-tag');
    await tagInput.fill('speedrun');
    await tagInput.press('Enter');
    await tagInput.fill('#retro');
    await page.click('button:has-text("Add")');

    const editor = page.locator('[data-testid="broadcast-editor"]');
    await expect(editor).toContainText('#speedrun');
    await expect(editor).toContainText('#retro');

    // Duplicates are rejected
    await tagInput.fill('Speedrun');
    await tagInput.press('Enter');
    await expect(editor).toContainText('already added');

    await page.click('button[aria-label="Remove tag speedrun"]');
    await expect(editor).not.toContainText('#speedrun');
  });

  test('should preview title templates', async ({ page }) => {
    await page.fill('#live-title', 'Chill stream - {DAY}');
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    await expect(page.locator('[data-testid="broadcast-editor"]')).toContainText(`Goes live as: Chill stream - ${today}`);
  });

  test('should prefill the create form from "Save as Preset"', async ({ page }) => {
    await page.fill('#live-title', 'Late night builds');

    const categoryInput = page.locator('input[placeholder*="Search for a category" i]');
    await categoryInput.fill('Just Chatting');
    await page.waitForTimeout(500);
    await page.locator('button[role="option"]:has-text("Just Chatting")').first().click();

    const tagInput = page.locator('#live-tag');
    await tagInput.fill('coding');
    await tagInput.press('Enter');
    await tagInput.fill('chill');
    await tagInput.press('Enter');

    await page.click('button:has-text("Save as Preset")');

    await expect(page).toHaveURL(/\/profile\/new/);
    await expect(page.locator('input[name="title"]')).toHaveValue('Late night builds');
    await expect(page.locator('input[name="tags"]')).toHaveValue('coding, chill');
    await expect(categoryInput).toHaveValue('Just Chatting');
  });
});
