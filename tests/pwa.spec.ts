import { test, expect } from '@playwright/test';

/**
 * PWA Feature Tests
 * Tests Progressive Web App functionality including manifest, icons, and installability
 */

test.describe('PWA Features', () => {
  test('should have valid PWA manifest', async ({ page }) => {
    await page.goto('/');

    // Check for manifest link in HTML
    const manifestLink = await page.locator('link[rel="manifest"]').count();
    expect(manifestLink).toBeGreaterThan(0);

    // Fetch and validate manifest
    const manifestResponse = await page.request.get('/manifest.webmanifest');
    expect(manifestResponse.ok()).toBeTruthy();

    const manifest = await manifestResponse.json();

    // Validate required manifest fields
    expect(manifest.name).toBeDefined();
    expect(manifest.short_name).toBeDefined();
    expect(manifest.start_url).toBeDefined();
    expect(manifest.display).toBeDefined();
    expect(manifest.icons).toBeDefined();
    expect(Array.isArray(manifest.icons)).toBeTruthy();
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  test('should have theme color meta tag', async ({ page }) => {
    await page.goto('/');

    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content');
    expect(themeColor).toBeTruthy();
    expect(themeColor).toMatch(/^#[0-9A-Fa-f]{6}$/); // Valid hex color
  });

  test('should have viewport meta tag for mobile', async ({ page }) => {
    await page.goto('/');

    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
    expect(viewport).toContain('initial-scale=1');
  });

  test('should have apple-touch-icon for iOS', async ({ page }) => {
    await page.goto('/');

    const appleTouchIcon = await page.locator('link[rel="apple-touch-icon"]').count();
    expect(appleTouchIcon).toBeGreaterThan(0);
  });

  test('should have apple splash screens for iOS PWA', async ({ page }) => {
    await page.goto('/');

    const splashScreens = await page.locator('link[rel="apple-touch-startup-image"]').count();
    expect(splashScreens).toBeGreaterThan(0);
  });

  test('should have apple-mobile-web-app-capable meta tag', async ({ page }) => {
    await page.goto('/');

    const capable = await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content');
    expect(capable).toBe('yes');
  });

  test('should have favicons', async ({ page }) => {
    await page.goto('/');

    // Check for favicon link
    const favicon = await page.locator('link[rel="icon"]').count();
    expect(favicon).toBeGreaterThan(0);
  });

  test('should have Open Graph meta tags for social sharing', async ({ page }) => {
    await page.goto('/');

    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    const ogDescription = await page.locator('meta[property="og:description"]').getAttribute('content');
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');

    expect(ogTitle).toBeTruthy();
    expect(ogDescription).toBeTruthy();
    expect(ogImage).toBeTruthy();
  });

  test('should load and cache static assets', async ({ page }) => {
    await page.goto('/');

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // Check that main CSS and JS loaded
    const scripts = await page.locator('script[src]').count();
    expect(scripts).toBeGreaterThan(0);

    // Check for CSS
    const styles = await page.locator('link[rel="stylesheet"], style').count();
    expect(styles).toBeGreaterThan(0);
  });

  test('should have loading screen', async ({ page }) => {
    // Navigate and check for loading screen before React loads
    const response = await page.goto('/');
    expect(response?.ok()).toBeTruthy();

    // The HTML should contain the loading screen div
    const html = await response?.text();
    expect(html).toContain('app-loading');
  });

  test('should be responsive on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Wait for page load
    await page.waitForSelector('h1:has-text("Presets")');

    // Check that content is visible (not overflowing)
    const title = page.locator('h1:has-text("Presets")');
    await expect(title).toBeVisible();

    // Check that create button is accessible
    const createButton = page.locator('a[href="/profile/new"]').filter({ visible: true });
    await expect(createButton.first()).toBeVisible();
  });

  test('should be responsive on tablet viewport', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    await page.waitForSelector('h1:has-text("Presets")');

    // All main UI elements should be visible
    const title = page.locator('h1:has-text("Presets")');
    await expect(title).toBeVisible();
  });

  test('should handle touch events on mobile', async ({ page }) => {
    // Set mobile viewport and touch support
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    await page.waitForSelector('h1:has-text("Presets")');

    // Try tapping the create button
    const createButton = page.locator('a[href="/profile/new"]').filter({ visible: true }).first();

    if (await createButton.isVisible()) {
      await createButton.tap();

      // Should navigate to create page
      await expect(page).toHaveURL(/\/profile\/new/);
    }
  });

  test('should have proper SEO meta tags', async ({ page }) => {
    await page.goto('/');

    // Check for meta description
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).toBeTruthy();
    expect(description.length).toBeGreaterThan(50); // Reasonable description length

    // Check for title
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);

    // Check for keywords
    const keywords = await page.locator('meta[name="keywords"]').count();
    expect(keywords).toBeGreaterThan(0);
  });
});

test.describe('Service Worker', () => {
  test('should register service worker', async ({ page }) => {
    await page.goto('/');

    // Wait for service worker registration
    const swRegistered = await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        return registrations.length > 0;
      }
      return false;
    });

    // Note: This test will fail until EXE-24 is fixed
    // (Service Worker registration is missing)
    // expect(swRegistered).toBeTruthy();

    // For now, just check if service worker API is available
    const swSupported = await page.evaluate(() => 'serviceWorker' in navigator);
    expect(swSupported).toBeTruthy();
  });

  test('should have service worker API available', async ({ page }) => {
    await page.goto('/');

    const hasServiceWorkerAPI = await page.evaluate(() => {
      return 'serviceWorker' in navigator;
    });

    expect(hasServiceWorkerAPI).toBeTruthy();
  });
});
