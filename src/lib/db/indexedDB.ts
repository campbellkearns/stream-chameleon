/**
 * IndexedDB wrapper for Stream Chameleon
 * Provides a clean interface for local data storage with proper error handling
 */

import { STORAGE_KEYS } from '@/types/constants';

export class IndexedDBWrapper {
  private db: IDBDatabase | null = null
  private isInitialized = false

  constructor(
    private dbName: string = STORAGE_KEYS.DB_NAME,
    private version: number = STORAGE_KEYS.DB_VERSION
  ) {}

  /**
   * Initialize the database connection
   */
  async init(): Promise<void> {
    if (this.isInitialized && this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        reject(new Error(`Failed to open database: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create profiles store with proper indexes
        if (!db.objectStoreNames.contains(STORAGE_KEYS.PROFILES_STORE)) {
          const profileStore = db.createObjectStore(STORAGE_KEYS.PROFILES_STORE, { keyPath: 'id' });
          profileStore.createIndex('name', 'name', { unique: false });
          profileStore.createIndex('createdAt', 'createdAt', { unique: false });
          profileStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          profileStore.createIndex('category', 'category.name', { unique: false });
        }

        // Create categories cache store
        if (!db.objectStoreNames.contains(STORAGE_KEYS.CATEGORIES_STORE)) {
          const categoryStore = db.createObjectStore(STORAGE_KEYS.CATEGORIES_STORE, { keyPath: 'id' });
          categoryStore.createIndex('name', 'name', { unique: false });
          categoryStore.createIndex('cachedAt', 'cachedAt', { unique: false });
        }

        // Create auth store
        if (!db.objectStoreNames.contains(STORAGE_KEYS.AUTH_STORE)) {
          db.createObjectStore(STORAGE_KEYS.AUTH_STORE, { keyPath: 'key' });
        }

        // Create preferences store
        if (!db.objectStoreNames.contains(STORAGE_KEYS.PREFERENCES_STORE)) {
          db.createObjectStore(STORAGE_KEYS.PREFERENCES_STORE, { keyPath: 'key' });
        }

        // Create apply history store (added in DB v2 — additive migration:
        // guarded create so v1 databases upgrade without touching existing
        // stores, and fresh installs get every store in one pass)
        if (!db.objectStoreNames.contains(STORAGE_KEYS.APPLY_HISTORY_STORE)) {
          const historyStore = db.createObjectStore(STORAGE_KEYS.APPLY_HISTORY_STORE, { keyPath: 'id' });
          historyStore.createIndex('appliedAt', 'appliedAt', { unique: false });
          historyStore.createIndex('profileId', 'profileId', { unique: false });
        }
      };

      request.onblocked = () => {
        // Another connection holds an older version and blocks the upgrade;
        // the open can still succeed once it closes, so only log.
        console.warn(`IndexedDB open blocked for "${this.dbName}": close other tabs using an older version`);
      };
    });
  }

  /**
   * Get a transaction for the specified stores
   */
  private getTransaction(storeNames: string[], mode: IDBTransactionMode = 'readonly'): IDBTransaction {
    if (!this.db || !this.isInitialized) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return this.db.transaction(storeNames, mode);
  }

  /**
   * Check if database is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.db !== null;
  }

  /**
   * Get all records from a store
   */
  async getAll<T>(storeName: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.getTransaction([storeName])
      const store = transaction.objectStore(storeName)
      const request = store.getAll()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  /**
   * Get a record by key
   */
  async get<T>(storeName: string, key: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const transaction = this.getTransaction([storeName])
      const store = transaction.objectStore(storeName)
      const request = store.get(key)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  /**
   * Add a record to a store
   */
  async add<T>(storeName: string, data: T): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.getTransaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.add(data)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  /**
   * Update a record in a store
   */
  async put<T>(storeName: string, data: T): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.getTransaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.put(data)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  /**
   * Delete a record from a store
   */
  async delete(storeName: string, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.getTransaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.delete(key)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  /**
   * Clear all records from a store
   */
  async clear(storeName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.getTransaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.clear()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}

// Singleton instance and initialization promise
let dbInstance: IndexedDBWrapper | null = null;
let initPromise: Promise<IndexedDBWrapper> | null = null;

/**
 * Get the database instance
 */
export const getDB = async (): Promise<IndexedDBWrapper> => {
  // Return existing instance if already initialized
  if (dbInstance) {
    return dbInstance;
  }

  // If initialization is in progress, wait for it
  if (initPromise) {
    return initPromise;
  }

  // Start new initialization
  initPromise = (async () => {
    const instance = new IndexedDBWrapper();
    await instance.init();
    dbInstance = instance;
    return instance;
  })();

  try {
    const instance = await initPromise;
    return instance;
  } finally {
    // Always clear the in-flight promise once it settles. On success this
    // preserves the old behavior (dbInstance is set anyway); on a failed open
    // it prevents the rejection from being cached forever, so the next
    // getDB() call re-attempts initialization instead of rejecting too.
    initPromise = null;
  }
};

/**
 * Reset the database instance (useful for testing)
 */
export const resetDB = (): void => {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  initPromise = null;
};
