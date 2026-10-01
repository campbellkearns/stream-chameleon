/**
 * Category Repository
 * 
 * Handles caching of Twitch categories for offline use.
 * Implements 24-48 hour cache strategy as defined in the PRD.
 */

import type { StreamCategory } from '@/types/Profile';
import { STORAGE_KEYS, CACHE_SETTINGS } from '@/types/constants';
import { getDB } from '@/lib/db/indexedDB';
import type { RepositoryResult } from './ProfileRepository';

/**
 * Cached category with metadata
 */
interface CachedCategory extends StreamCategory {
  cachedAt: Date;
  lastFetched: Date;
}

/**
 * Category search result for API responses
 */
interface CategorySearchResult {
  categories: StreamCategory[];
  hasMore: boolean;
  cursor?: string;
}

/**
 * Category Repository Implementation
 */
export class CategoryRepository {
  private readonly storeName = STORAGE_KEYS.CATEGORIES_STORE;

  /**
   * Get all cached categories
   */
  async getAll(): Promise<RepositoryResult<StreamCategory[]>> {
    try {
      const db = await getDB();
      const cachedCategories = await db.getAll<CachedCategory>(this.storeName);
      
      // Convert cached categories to stream categories
      const categories = cachedCategories.map(cached => ({
        id: cached.id,
        name: cached.name,
        boxArtUrl: cached.boxArtUrl
      }));

      return {
        success: true,
        data: categories
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to fetch cached categories',
          code: 'STORAGE_ERROR',
          details: error
        }
      };
    }
  }

  /**
   * Get cached categories, most recently cached first
   */
  async getRecent(limit: number): Promise<RepositoryResult<StreamCategory[]>> {
    try {
      const db = await getDB();
      const cachedCategories = await db.getAll<CachedCategory>(this.storeName);

      const categories = cachedCategories
        .sort((a, b) => new Date(b.cachedAt).getTime() - new Date(a.cachedAt).getTime())
        .slice(0, limit)
        .map(cached => ({
          id: cached.id,
          name: cached.name,
          boxArtUrl: cached.boxArtUrl
        }));

      return {
        success: true,
        data: categories
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to fetch recent categories',
          code: 'STORAGE_ERROR',
          details: error
        }
      };
    }
  }

  /**
   * Search categories by name (cached first, then API if needed)
   */
  async search(query: string, limit?: number): Promise<RepositoryResult<StreamCategory[]>> {
    try {
      // First, search in cache
      const cachedResult = await this.searchCached(query, limit);

      if (cachedResult.success && cachedResult.data && cachedResult.data.length > 0) {
        return cachedResult;
      }

      // If no cached results, search via Twitch API
      const { getTwitchAPI } = await import('@/lib/api/twitchAPI');
      const apiResult = await getTwitchAPI().searchCategories(query, limit);

      if (apiResult.success && apiResult.data && apiResult.data.length > 0) {
        // Convert TwitchGameResponse to StreamCategory
        const categories: StreamCategory[] = apiResult.data.map(game => ({
          id: game.id,
          name: game.name,
          boxArtUrl: game.box_art_url
        }));

        return {
          success: true,
          data: categories
        };
      }

      // If API also returns no results, fallback to searching default categories
      const defaultCategories = this.getDefaultCategories();
      const filteredDefaults = defaultCategories.filter(category =>
        category.name.toLowerCase().includes(query.toLowerCase())
      );

      if (limit !== undefined && limit > 0) {
        return {
          success: true,
          data: filteredDefaults.slice(0, limit)
        };
      }

      return {
        success: true,
        data: filteredDefaults
      };
    } catch (error) {
      // On error, try to return default categories as fallback
      try {
        const defaultCategories = this.getDefaultCategories();
        const filteredDefaults = defaultCategories.filter(category =>
          category.name.toLowerCase().includes(query.toLowerCase())
        );

        return {
          success: true,
          data: limit !== undefined && limit > 0 ? filteredDefaults.slice(0, limit) : filteredDefaults
        };
      } catch {
        return {
          success: false,
          error: {
            message: 'Failed to search categories',
            code: 'STORAGE_ERROR',
            details: error
          }
        };
      }
    }
  }

  /**
   * Search only in cached categories (public for use by TwitchAPIClient)
   */
  async searchCached(query: string, limit?: number): Promise<RepositoryResult<StreamCategory[]>> {
    try {
      const allResult = await this.getAll();

      if (!allResult.success || !allResult.data) {
        return allResult;
      }

      let filteredCategories = allResult.data.filter(category =>
        category.name.toLowerCase().includes(query.toLowerCase())
      );

      // Apply limit if specified
      if (limit !== undefined && limit > 0) {
        filteredCategories = filteredCategories.slice(0, limit);
      }

      return {
        success: true,
        data: filteredCategories
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to search cached categories',
          code: 'STORAGE_ERROR',
          details: error
        }
      };
    }
  }

  /**
   * Get a category by ID
   */
  async getById(id: string): Promise<RepositoryResult<StreamCategory>> {
    try {
      const db = await getDB();
      const cached = await db.get<CachedCategory>(this.storeName, id);

      if (!cached) {
        return {
          success: false,
          error: {
            message: 'Category not found',
            code: 'CATEGORY_NOT_FOUND'
          }
        };
      }

      const category: StreamCategory = {
        id: cached.id,
        name: cached.name,
        boxArtUrl: cached.boxArtUrl
      };

      return {
        success: true,
        data: category
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to fetch category',
          code: 'STORAGE_ERROR',
          details: error
        }
      };
    }
  }

  /**
   * Cache a single category
   */
  async cache(category: StreamCategory): Promise<RepositoryResult<void>> {
    try {
      const db = await getDB();
      const now = new Date();

      const cachedCategory: CachedCategory = {
        ...category,
        cachedAt: now,
        lastFetched: now
      };

      await db.put(this.storeName, cachedCategory);

      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to cache category',
          code: 'STORAGE_ERROR',
          details: error
        }
      };
    }
  }

  /**
   * Cache categories from API response
   */
  async cacheCategories(categories: StreamCategory[]): Promise<RepositoryResult<void>> {
    try {
      const db = await getDB();
      const now = new Date();

      for (const category of categories) {
        const cachedCategory: CachedCategory = {
          ...category,
          cachedAt: now,
          lastFetched: now
        };

        await db.put(this.storeName, cachedCategory);
      }

      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to cache categories',
          code: 'STORAGE_ERROR',
          details: error
        }
      };
    }
  }

  /**
   * Check if cache needs refresh (24-48 hours old)
   */
  async needsRefresh(): Promise<boolean> {
    try {
      const db = await getDB();
      const categories = await db.getAll<CachedCategory>(this.storeName);

      if (categories.length === 0) {
        return true; // No cache, needs refresh
      }

      // Check if oldest category is beyond TTL
      const oldestCategory = categories.reduce((oldest, current) => {
        return new Date(current.cachedAt) < new Date(oldest.cachedAt) ? current : oldest;
      });

      const cacheAge = Date.now() - new Date(oldestCategory.cachedAt).getTime();
      return cacheAge > CACHE_SETTINGS.CATEGORIES_TTL;
    } catch {
      return true; // Error means we should refresh
    }
  }

  /**
   * Clear all cached categories
   */
  async clearCache(): Promise<RepositoryResult<void>> {
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
          message: 'Failed to clear category cache',
          code: 'STORAGE_ERROR',
          details: error
        }
      };
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<RepositoryResult<{
    totalCategories: number;
    oldestCache: Date | null;
    newestCache: Date | null;
    needsRefresh: boolean;
  }>> {
    try {
      const db = await getDB();
      const categories = await db.getAll<CachedCategory>(this.storeName);

      if (categories.length === 0) {
        return {
          success: true,
          data: {
            totalCategories: 0,
            oldestCache: null,
            newestCache: null,
            needsRefresh: true
          }
        };
      }

      const dates = categories.map(c => new Date(c.cachedAt));
      const oldestCache = new Date(Math.min(...dates.map(d => d.getTime())));
      const newestCache = new Date(Math.max(...dates.map(d => d.getTime())));
      const needsRefresh = await this.needsRefresh();

      return {
        success: true,
        data: {
          totalCategories: categories.length,
          oldestCache,
          newestCache,
          needsRefresh
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to get cache stats',
          code: 'STORAGE_ERROR',
          details: error
        }
      };
    }
  }

  /**
   * Get popular/default categories for initial setup
   */
  getDefaultCategories(): StreamCategory[] {
    return [
      { id: '509658', name: 'Just Chatting' },
      { id: '26936', name: 'Music' },
      { id: '509660', name: 'Art' },
      { id: '509670', name: 'Science & Technology' },
      { id: '509659', name: 'ASMR' },
      { id: '488191', name: 'Podcast' },
      { id: '417752', name: 'Talk Shows & Podcasts' },
      { id: '509663', name: 'Special Events' },
      { id: '21548', name: 'World of Warcraft' },
      { id: '32982', name: 'Grand Theft Auto V' },
      { id: '511224', name: 'Apex Legends' },
      { id: '33214', name: 'Fortnite' }
    ];
  }

  /**
   * Seed the cache with the default categories (used when the cache is
   * empty, e.g. on a fresh install)
   */
  async seedDefaults(categories: StreamCategory[]): Promise<RepositoryResult<void>> {
    return this.cacheCategories(categories);
  }
}

// Singleton instance
let categoryRepositoryInstance: CategoryRepository | null = null;

/**
 * Get the category repository instance
 */
export const getCategoryRepository = (): CategoryRepository => {
  if (!categoryRepositoryInstance) {
    categoryRepositoryInstance = new CategoryRepository();
  }
  return categoryRepositoryInstance;
};

/**
 * Reset the category repository instance (useful for testing)
 */
export const resetCategoryRepository = (): void => {
  categoryRepositoryInstance = null;
};
