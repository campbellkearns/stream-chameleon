import { test, expect } from '@playwright/test';

/**
 * Timezone agreement tests for dynamic title templating (C-7)
 *
 * {DAY} has always been formatted from local time, while {YYYY-MM-DD} was
 * formatted from UTC (toISOString). Near local midnight in a non-UTC timezone
 * the two placeholders could disagree by a full calendar day. Both must render
 * from the same local calendar day.
 */

test.describe('Date/day templating timezone agreement', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('should render {YYYY-MM-DD} and {DAY} on the same local calendar day near midnight', async ({ page }) => {
    // 23:30 on Jan 14 in Los Angeles (PST, UTC-8) is 07:30 UTC on Jan 15.
    // Local calendar day: Wednesday 2026-01-14. UTC calendar day: 2026-01-15.
    await page.clock.setFixedTime(new Date('2026-01-14T23:30:00-08:00'));

    await page.goto('/presets');
    await page.waitForSelector('h1:has-text("Presets")', { timeout: 10000 });

    // Create a profile templated with both placeholders
    await page.locator('a[href="/profile/new"]').filter({ visible: true }).first().click();
    await page.fill('input[name="name"]', 'Midnight Agreement Test');
    await page.fill('input[name="title"]', '{DAY} Stream - {YYYY-MM-DD}');

    const categoryInput = page.locator('input[placeholder*="Search for a category" i]');
    await categoryInput.fill('Just Chatting');
    await page.waitForTimeout(500);
    await page.locator('button[role="option"]:has-text("Just Chatting")').first().click();
    await page.click('button[type="submit"]');
    await page.waitForURL('/presets');

    // Both placeholders must agree on the local calendar day (Wednesday, 2026-01-14),
    // not one rendering from the UTC day (2026-01-15)
    const profileCard = page.locator('[data-testid="preset-card"]', { hasText: 'Midnight Agreement Test' });
    await expect(profileCard.locator('text=Wednesday Stream - 2026-01-14')).toBeVisible();
  });
});
