/**
 * Apply History Repository
 *
 * Handles all apply-history data operations using the repository pattern.
 * Records every apply attempt (success and failure) as wire truth and prunes
 * to the newest APPLY_HISTORY_LIMIT records so the store cannot grow unbounded.
 */

import type { ApplyRecord } from '@/types/Profile';
import { STORAGE_KEYS, ERROR_CODES } from '@/types/constants';
import { getDB } from '@/lib/db/indexedDB';
import type { RepositoryResult } from './ProfileRepository';

/**
 * Records kept after pruning — newest wins, regardless of result
 */
const APPLY_HISTORY_LIMIT = 100;

/**
 * Apply History Repository Implementation
 */
export class ApplyHistoryRepository {
  private readonly storeName = STORAGE_KEYS.APPLY_HISTORY_STORE;

  /**
   * Get all records, newest first (ordered by appliedAt descending)
   */
  async getAll(): Promise<RepositoryResult<ApplyRecord[]>> {
    try {
      const db = await getDB();
      const records = await db.getAll<ApplyRecord>(this.storeName);

      const sortedRecords = records.sort((a, b) => b.appliedAt - a.appliedAt);

      return {
        success: true,
        data: sortedRecords
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to fetch apply history',
          code: ERROR_CODES.STORAGE_ERROR,
          details: error
        }
      };
    }
  }

  /**
   * Append a record, then prune to the newest APPLY_HISTORY_LIMIT records
   */
  async append(record: ApplyRecord): Promise<RepositoryResult<ApplyRecord>> {
    try {
      const db = await getDB();
      await db.add(this.storeName, record);

      await this.pruneToLimit();

      return {
        success: true,
        data: record
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to record apply history',
          code: ERROR_CODES.STORAGE_ERROR,
          details: error
        }
      };
    }
  }

  /**
   * Clear all records (useful for testing/reset)
   */
  async clear(): Promise<RepositoryResult<void>> {
    try {
      const db = await getDB();
      await db.clear(this.storeName);

      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to clear apply history',
          code: ERROR_CODES.STORAGE_ERROR,
          details: error
        }
      };
    }
  }

  /**
   * Check if repository is ready
   */
  async isReady(): Promise<boolean> {
    try {
      const db = await getDB();
      return db.isReady();
    } catch {
      return false;
    }
  }

  /**
   * Keep only the newest APPLY_HISTORY_LIMIT records — prune ignores result,
   * so failed attempts age out exactly like successful ones
   */
  private async pruneToLimit(): Promise<void> {
    const db = await getDB();
    const records = await db.getAll<ApplyRecord>(this.storeName);

    if (records.length <= APPLY_HISTORY_LIMIT) {
      return;
    }

    const excess = records
      .sort((a, b) => b.appliedAt - a.appliedAt)
      .slice(APPLY_HISTORY_LIMIT);

    for (const record of excess) {
      await db.delete(this.storeName, record.id);
    }
  }
}

// Singleton instance
let repositoryInstance: ApplyHistoryRepository | null = null;

/**
 * Get the apply history repository instance
 */
export const getApplyHistoryRepository = (): ApplyHistoryRepository => {
  if (!repositoryInstance) {
    repositoryInstance = new ApplyHistoryRepository();
  }
  return repositoryInstance;
};

/**
 * Reset the repository instance (useful for testing)
 */
export const resetApplyHistoryRepository = (): void => {
  repositoryInstance = null;
};
