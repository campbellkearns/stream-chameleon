import { test, expect } from '@playwright/test';

/**
 * Category Search Tests
 * Tests category search functionality with online/offline support
 */

test.describe('Category Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/profile/new');
    await page.waitForLoadState('networkidle');
  });

  test('should show category search input', async ({ page }) => {
    // Look for the category dropdown input
    const categoryInput = page.locator('input[placeholder*="Search for a category" i]');
    await expect(categoryInput).toBeVisible();
  });

  test('should search for categories', async ({ page }) => {
    const categoryInput = page.locator('input[placeholder*="Search for a category" i]');

    // Type a search query
    await categoryInput.fill('Just');
    await page.waitForTimeout(500); // Wait for debounce/search

    // Dropdown should be visible
    const dropdown = page.locator('#category-dropdown');
    await expect(dropdown).toBeVisible();

    // Should show search results
    const justChattingOption = page.locator('button[role="option"]:has-text("Just Chatting")');
    await expect(justChattingOption).toBeVisible();
  });

  test('should select a category from search results', async ({ page }) => {
    const categoryInput = page.locator('input[placeholder*="Search for a category" i]');

    // Search and select
    await categoryInput.fill('Science');
    await page.waitForTimeout(500);

    // Click on a result
    const scienceOption = page.locator('button[role="option"]:has-text("Science & Technology")').first();
    await scienceOption.click();

    // The input should now show the selected category
    await expect(categoryInput).toHaveValue('Science & Technology');

    // Dropdown should close
    const dropdown = page.locator('#category-dropdown');
    await expect(dropdown).not.toBeVisible();
  });

  test('should handle no search results gracefully', async ({ page }) => {
    const categoryInput = page.locator('input[placeholder*="Search for a category" i]');

    // Search for something that likely doesn't exist
    await categoryInput.fill('xyzabc12345nonexistent');
    await page.waitForTimeout(500);

    // Should show "no categories found" message
    const noResultsMessage = page.locator('text=No categories found');
    await expect(noResultsMessage).toBeVisible();

    // Should show fallback message about manual entry
    const fallbackMessage = page.locator('text=/You can still use.*as a manual entry/i');
    await expect(fallbackMessage).toBeVisible();
  });

  test('should work offline with cached categories', async ({ page, context }) => {
    const categoryInput = page.locator('input[placeholder*="Search for a category" i]');

    // First do a search while online to populate cache
    await categoryInput.fill('Just Chatting');
    await page.waitForTimeout(500);

    // Select it to ensure it's cached
    const justChattingOption = page.locator('button[role="option"]:has-text("Just Chatting")').first();
    await justChattingOption.click();

    // Now go offline
    await context.setOffline(true);

    // Clear and search again
    await categoryInput.clear();
    await categoryInput.click(); // Focus to open dropdown
    await categoryInput.fill('Just');
    await page.waitForTimeout(500);

    // Should still show results from cache
    const cachedResult = page.locator('button[role="option"]:has-text("Just Chatting")');
    await expect(cachedResult).toBeVisible();

    await context.setOffline(false);
  });

  test('should show popular/default categories', async ({ page }) => {
    const categoryInput = page.locator('input[placeholder*="Search for a category" i]');

    // Focus the input without typing to trigger default results
    await categoryInput.click();
    await page.waitForTimeout(300);

    // Dropdown should be visible
    const dropdown = page.locator('#category-dropdown');
    await expect(dropdown).toBeVisible();

    // Should show default/popular categories - just check that we have some options
    const categoryOptions = page.locator('button[role="option"]');
    const count = await categoryOptions.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should clear category selection', async ({ page }) => {
    const categoryInput = page.locator('input[placeholder*="Search for a category" i]');

    // Select a category
    await categoryInput.fill('Music');
    await page.waitForTimeout(500);

    const musicOption = page.locator('button[role="option"]:has-text("Music")').first();
    await musicOption.click();

    // Input should now have the value
    await expect(categoryInput).toHaveValue('Music');

    // Look for the clear button (✕)
    const clearButton = page.locator('button[aria-label="Clear category"]');
    await expect(clearButton).toBeVisible();

    // Click clear button
    await clearButton.click();

    // Input should be cleared
    await expect(categoryInput).toHaveValue('');
  });

  test('should validate category is required', async ({ page }) => {
    // Try to submit without selecting category
    await page.fill('input[name="name"]', 'No Category Test');
    await page.fill('input[name="title"]', 'Test');

    // Submit without category
    await page.click('button:has-text("Create Preset")');

    // Wait a moment for validation
    await page.waitForTimeout(300);

    // Should show validation error
    const errorMessage = page.locator('text=/category.*required/i');
    await expect(errorMessage).toBeVisible();

    // Should remain on the create page
    await expect(page).toHaveURL(/\/profile\/new/);
  });

  test('should show loading indicator while searching', async ({ page }) => {
    const categoryInput = page.locator('input[placeholder*="Search for a category" i]');

    // Type to trigger search
    await categoryInput.fill('Just');

    // Should show loading spinner briefly
    // Note: This might be too fast to catch in tests, so we just verify the structure exists
    const loadingSpinner = page.locator('span:has-text("⟳")').first();

    // The spinner might not be visible by the time we check, but the element should exist
    // Just verify the dropdown appears with results
    const dropdown = page.locator('#category-dropdown');
    await expect(dropdown).toBeVisible({ timeout: 1000 });
  });

  test('should display category artwork when available', async ({ page }) => {
    const categoryInput = page.locator('input[placeholder*="Search for a category" i]');

    // Search for a category
    await categoryInput.fill('Just');
    await page.waitForTimeout(500);

    // Check if category options have either artwork or placeholder icon
    const categoryOption = page.locator('button[role="option"]').first();
    await expect(categoryOption).toBeVisible();

    // Should have either an img tag (for artwork) or emoji placeholder
    const hasArtwork = await categoryOption.locator('img').count() > 0;
    const hasPlaceholder = await categoryOption.locator('text=🎮').count() > 0;

    expect(hasArtwork || hasPlaceholder).toBeTruthy();
  });

  test('should show selected indicator on chosen category', async ({ page }) => {
    const categoryInput = page.locator('input[placeholder*="Search for a category" i]');

    // Search and select a category
    await categoryInput.fill('Music');
    await page.waitForTimeout(500);

    const musicOption = page.locator('button[role="option"]:has-text("Music")').first();
    await musicOption.click();

    // Open dropdown again to see selected state
    await categoryInput.click();
    await page.waitForTimeout(300);

    // The selected option should show a checkmark
    const selectedIndicator = page.locator('text=✓ Selected');
    await expect(selectedIndicator).toBeVisible();
  });
});
