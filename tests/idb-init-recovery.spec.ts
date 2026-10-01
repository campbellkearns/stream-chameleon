import { test, expect } from '@playwright/test';

/**
 * IndexedDB Initialization Recovery (C-5)
 *
 * Regression coverage for the poisoned init promise: when the very first
 * indexedDB.open fails, the singleton getDB() cached that rejection forever,
 * so every later repository operation rejected until a full page reload.
 *
 * The init script below monkey-patches indexedDB.open so the FIRST call fails
 * (an async stub request that only fires onerror) and every later call goes
 * through to the real browser IndexedDB. The test asserts the app surfaces
 * the error instead of hanging, then that a subsequent repository operation
 * succeeds through a re-attempted open.
 */

type RecoveryResult = {
  success: boolean;
  count: number;
  message: string | null;
};

test.describe('IndexedDB initialization recovery', () => {
  test('recovers on the next operation after the first open fails', async ({ page }) => {
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

    // 1. The first open fails: the dashboard must surface the failure instead
    //    of hanging on the loading state.
    await page.goto('/presets');
    await expect(page.getByText('Something went wrong')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();

    // 2. Opens are allowed again from here on; the very next repository
    //    operation must succeed through a re-attempted open rather than
    //    surfacing the cached rejection.
    const recovery = await page.evaluate(async (): Promise<RecoveryResult> => {
      const { getProfileRepository } = await import('/src/repositories/ProfileRepository.ts');
      const result = await getProfileRepository().getAll();
      return {
        success: result.success,
        count: result.success && result.data ? result.data.length : -1,
        message: result.success ? null : (result.error?.message ?? 'unknown error'),
      };
    });

    expect(
      recovery.success,
      `subsequent repository operation should succeed once opens are allowed again, got: ${recovery.message}`
    ).toBe(true);
    expect(recovery.count).toBe(0);
  });
});
