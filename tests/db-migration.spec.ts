import { test, expect, type Page } from '@playwright/test';

/**
 * DB v2 additive migration (C-1, F-PR-1)
 *
 * The apply-history feature bumps StreamChameleonDB from v1 to v2 by adding
 * the applyHistory store. The upgrade must be purely additive: seeded v1
 * data (profiles and the other v1 stores) must survive intact, the new store
 * must exist with its appliedAt/profileId indexes, and the upgrade open must
 * never reject.
 *
 * Pattern: seed a v1 database via addInitScript (the idb-init-recovery
 * pattern), then boot the app — getDB() opens under v2 and runs the real
 * onupgradeneeded upgrade path.
 */

type DbProbe = {
  version: number;
  stores: string[];
  profileCount: number;
  historyCount: number;
  historyIndexes: string[];
};

/**
 * Seed a v1-shaped StreamChameleonDB with two profile rows, then close it so
 * the app's own open (under v2) performs the version upgrade.
 */
async function seedV1Database(page: Page): Promise<void> {
  await page.addInitScript(() => {
    return new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('StreamChameleonDB', 1);
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('profiles')) {
          const profiles = db.createObjectStore('profiles', { keyPath: 'id' });
          profiles.createIndex('name', 'name');
          profiles.createIndex('createdAt', 'createdAt');
          profiles.createIndex('updatedAt', 'updatedAt');
          profiles.createIndex('category', 'category.name');
        }
        if (!db.objectStoreNames.contains('categories')) {
          const categories = db.createObjectStore('categories', { keyPath: 'id' });
          categories.createIndex('name', 'name');
          categories.createIndex('cachedAt', 'cachedAt');
        }
        if (!db.objectStoreNames.contains('auth')) {
          db.createObjectStore('auth', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('preferences')) {
          db.createObjectStore('preferences', { keyPath: 'key' });
        }
      };
      open.onsuccess = () => {
        const db = open.result;
        const now = new Date();
        const tx = db.transaction('profiles', 'readwrite');
        tx.objectStore('profiles').put({
          id: 'seed-profile-a',
          name: 'Morning Pages',
          description: 'Seeded migration profile A',
          category: { id: '509670', name: 'Science & Technology' },
          title: 'Morning Pages Title',
          tags: ['English'],
          createdAt: now,
          updatedAt: now,
        });
        tx.objectStore('profiles').put({
          id: 'seed-profile-b',
          name: 'Evening Coding',
          category: { id: '509658', name: 'Just Chatting' },
          title: 'Evening Coding Title',
          tags: [],
          createdAt: now,
          updatedAt: now,
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error ?? new Error('v1 profile seeding failed'));
      };
      open.onerror = () => reject(open.error ?? new Error('v1 seed open failed'));
    });
  });
}

/**
 * Open the database at its current version (no version argument ⇒ never
 * upgrades) and report version, stores, row counts, and history indexes.
 */
async function probeDatabase(page: Page): Promise<DbProbe> {
  return page.evaluate(() => {
    return new Promise<DbProbe>((resolve, reject) => {
      const open = indexedDB.open('StreamChameleonDB');
      open.onerror = () => reject(open.error ?? new Error('probe open failed'));
      open.onsuccess = () => {
        // A synchronous throw here (e.g. a store not existing yet) would leave the
        // promise unsettled and surface as a 30s timeout — reject fast instead.
        try {
          const db = open.result;
          const stores = Array.from(db.objectStoreNames) as string[];
          const tx = db.transaction(['profiles', 'applyHistory'], 'readonly');
          const profileCount = tx.objectStore('profiles').count();
          const historyStore = tx.objectStore('applyHistory');
          const historyCount = historyStore.count();
          const historyIndexes = Array.from(historyStore.indexNames) as string[];
          tx.oncomplete = () => {
            db.close();
            resolve({
              version: db.version,
              stores,
              profileCount: profileCount.result,
              historyCount: historyCount.result,
              historyIndexes,
            });
          };
          tx.onerror = () => reject(tx.error ?? new Error('probe read failed'));
        } catch (error) {
          reject(error instanceof Error ? error : new Error('probe read setup failed'));
        }
      };
    });
  });
}

test.describe('DB v2 additive migration', () => {
  test('v1 database upgrades to v2: applyHistory created, existing stores and rows intact', async ({ page }) => {
    await seedV1Database(page);

    // Booting the app opens the seeded v1 database under v2. If the upgrade
    // rejected, wiped, or dropped stores, every assertion below fails.
    await page.goto('/presets');
    await expect(page.getByRole('heading', { name: 'Morning Pages' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Evening Coding' })).toBeVisible();

    const probe = await probeDatabase(page);

    // The upgrade happened (v1 seed → v2) and was purely additive
    expect(probe.version).toBe(2);
    expect(probe.stores).toContain('applyHistory');
    expect(probe.stores).toEqual(
      expect.arrayContaining(['profiles', 'categories', 'auth', 'preferences'])
    );

    // Existing data survived the upgrade untouched
    expect(probe.profileCount).toBe(2);
    expect(probe.historyCount).toBe(0);

    // The new store carries its ordered-strip indexes
    expect(probe.historyIndexes.sort()).toEqual(['appliedAt', 'profileId']);

    // The app's own data layer reads the pre-upgrade rows
    const profiles = await page.evaluate(async () => {
      const { getProfileRepository } = await import('/src/repositories/ProfileRepository.ts');
      const result = await getProfileRepository().getAll();
      return {
        success: result.success,
        names: result.success && result.data ? result.data.map((p) => p.name) : [],
      };
    });
    expect(profiles.success).toBe(true);
    expect(profiles.names.sort()).toEqual(['Evening Coding', 'Morning Pages']);
  });

  test('fresh install creates every store including applyHistory at v2', async ({ page }) => {
    await page.goto('/presets');
    // The empty state renders only after the profile load resolves, which means the
    // app's own v2 open has completed — probing earlier races it on slow engines
    // (Mobile Safari) and can create a v1 database underneath the probe.
    await expect(page.getByRole('heading', { name: 'No presets yet' })).toBeVisible({
      timeout: 15000,
    });

    const probe = await probeDatabase(page);

    expect(probe.version).toBe(2);
    expect([...probe.stores].sort()).toEqual([
      'applyHistory',
      'auth',
      'categories',
      'preferences',
      'profiles',
    ]);
    expect(probe.historyCount).toBe(0);
  });
});
