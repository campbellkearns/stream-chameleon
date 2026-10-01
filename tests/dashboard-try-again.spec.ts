import { test, expect } from '@playwright/test';

/**
 * Dashboard "Try Again" resilience (C-2)
 *
 * When the first profile load fails transiently, the dashboard shows an error
 * banner with a "Try Again" button. The button must re-run the load — not just
 * clear the error flag, which left a permanent "No presets yet" empty state
 * that misrepresented the user's data as absent.
 *
 * The init script monkey-patches indexedDB.open so the FIRST call fails (an
 * async stub request that only fires onerror) and every later call goes
 * through to the real browser IndexedDB. A real profile is seeded through the
 * repository while the banner is up, so "profiles render" proves the retry
 * actually loaded data instead of showing the empty state.
 */

type SeedResult = {
  success: boolean;
  name: string | null;
  message: string | null;
};

test.describe('Dashboard Try Again recovery', () => {
  test('re-runs the profile load and renders profiles after a transient failure', async ({ page }) => {
    await page.addInitScript(() => {
      const originalOpen = indexedDB.open.bind(indexedDB);
      let openCalls = 0;

      indexedDB.open = (...args: Parameters<typeof originalOpen>) => {
        openCalls += 1;
        if (openCalls !== 1) {
          return originalOpen(...args);
        }

        // First open: return a stub request that errors asynchronously,
        // simulating a transient browser-level open failure.
        const openError = new DOMException('Simulated first-open failure', 'UnknownError');
        const stubRequest = {
          error: openError,
          onerror: null as ((event: unknown) => void) | null,
          onsuccess: null as ((event: unknown) => void) | null,
          onupgradeneeded: null as ((event: unknown) => void) | null,
        };

        setTimeout(() => {
          stubRequest.onerror?.({ target: stubRequest, type: 'error' });
        }, 0);

        return stubRequest as unknown as IDBOpenDBRequest;
      };
    });

    // 1. The first open fails: the dashboard must surface the failure with a
    //    "Try Again" affordance instead of a silent empty state.
    await page.goto('/presets');
    await expect(page.getByText('Something went wrong')).toBeVisible({ timeout: 15000 });
    const tryAgain = page.getByRole('button', { name: 'Try Again' });
    await expect(tryAgain).toBeVisible();

    // 2. Seed a real profile through the repository while the banner is up.
    //    This is the SECOND open, which succeeds (the patch fails exactly
    //    once), so the data genuinely exists in IndexedDB before the retry.
    const seeded = await page.evaluate(async (): Promise<SeedResult> => {
      const { getProfileRepository } = await import('/src/repositories/ProfileRepository.ts');
      const result = await getProfileRepository().create({
        name: 'Weekly Dev Stream',
        description: 'Created while the dashboard was showing the error banner',
        category: { id: '509668', name: 'Science & Technology' },
        title: 'Shipping fixes on {YYYY-MM-DD}',
        tags: ['bugfix'],
      });
      return {
        success: result.success,
        name: result.success && result.data ? result.data.name : null,
        message: result.success ? null : (result.error?.message ?? 'unknown error'),
      };
    });

    expect(
      seeded.success,
      `seeding a profile should succeed once opens are allowed again, got: ${seeded.message}`
    ).toBe(true);
    expect(seeded.name).toBe('Weekly Dev Stream');

    // 3. "Try Again" must re-invoke the load. Regression (C-2): the old
    //    handler only cleared the error flag, so the dashboard fell through
    //    to the "No presets yet" empty state even though data existed.
    await tryAgain.click();

    await expect(page.getByText('Something went wrong')).toBeHidden({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'No presets yet' })).toBeHidden({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Weekly Dev Stream' })).toBeVisible();
    await expect(page.getByText('1 preset ready to apply')).toBeVisible();
  });
});
