/**
 * Category Management Hook
 * 
 * React hook for managing Twitch categories with caching and search functionality.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { StreamCategory } from '@/types/Profile';
import { getCategoryRepository } from '@/repositories/CategoryRepository';

/**
 * Loading state for categories
 */
interface CategoryLoadingState {
  isLoading: boolean;
  error: string | null;
  isSearching: boolean;
}

/**
 * Categories management hook
 */
export const useCategories = () => {
  const [categories, setCategories] = useState<StreamCategory[]>([]);
  const [loadingState, setLoadingState] = useState<CategoryLoadingState>({
    isLoading: true,
    error: null,
    isSearching: false
  });

  const categoryRepository = getCategoryRepository();

  /**
   * Load all cached categories
   */
  const loadCategories = useCallback(async () => {
    setLoadingState(prev => ({ ...prev, isLoading: true }));
    
    try {
      const result = await categoryRepository.getAll();
      
      if (result.success && result.data && result.data.length > 0) {
        setCategories(result.data);
        setLoadingState({ isLoading: false, error: null, isSearching: false });
      } else {
        // Empty cache is a miss on a fresh install: seed the defaults so
        // they persist, then show them. A storage error also lands here —
        // show the defaults and surface the failure.
        const defaultCategories = categoryRepository.getDefaultCategories();
        const seeded = await categoryRepository.seedDefaults(defaultCategories);
        setCategories(defaultCategories);
        setLoadingState({
          isLoading: false,
          error: (!seeded.success && seeded.error?.message) || result.error?.message || null,
          isSearching: false
        });
      }
    } catch (error) {
      // Fallback to default categories on error
      const defaultCategories = categoryRepository.getDefaultCategories();
      setCategories(defaultCategories);
      setLoadingState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load categories',
        isSearching: false
      });
    }
  }, [categoryRepository]);

  /**
   * Search categories by name
   */
  const searchCategories = useCallback(async (query: string): Promise<StreamCategory[]> => {
    if (!query.trim()) {
      return categories;
    }

    setLoadingState(prev => ({ ...prev, isSearching: true }));
    
    try {
      const result = await categoryRepository.search(query);
      
      if (result.success && result.data) {
        setLoadingState(prev => ({ ...prev, isSearching: false }));
        return result.data;
      } else {
        setLoadingState(prev => ({ 
          ...prev, 
          isSearching: false,
          error: result.error?.message || 'Search failed'
        }));
        return [];
      }
    } catch (error) {
      setLoadingState(prev => ({ 
        ...prev, 
        isSearching: false,
        error: error instanceof Error ? error.message : 'Search failed'
      }));
      return [];
    }
  }, [categories, categoryRepository]);

  /**
   * Get a specific category by ID
   */
  const getCategoryById = useCallback(async (id: string): Promise<StreamCategory | null> => {
    try {
      const result = await categoryRepository.getById(id);
      return result.success && result.data ? result.data : null;
    } catch (error) {
      console.error('Failed to get category:', error);
      return null;
    }
  }, [categoryRepository]);

  /**
   * Get cache statistics
   */
  const getCacheStats = useCallback(async () => {
    try {
      const result = await categoryRepository.getCacheStats();
      return result.success ? result.data : null;
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return null;
    }
  }, [categoryRepository]);

  /**
   * Clear category cache
   */
  const clearCache = useCallback(async (): Promise<boolean> => {
    try {
      const result = await categoryRepository.clearCache();
      if (result.success) {
        // Reload with defaults after clearing
        await loadCategories();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to clear cache:', error);
      return false;
    }
  }, [categoryRepository, loadCategories]);

  /**
   * Clear any errors
   */
  const clearError = useCallback(() => {
    setLoadingState(prev => ({ ...prev, error: null }));
  }, []);

  // Computed values
  const computedValues = useMemo(() => ({
    categoryCount: categories.length,
    hasCategories: categories.length > 0,
    isEmpty: categories.length === 0,
    popularCategories: categories.slice(0, 6), // First 6 for quick selection
    gameCategories: categories.filter(cat => 
      !['Just Chatting', 'Music', 'Art', 'Science & Technology', 'ASMR'].includes(cat.name)
    ),
    nonGameCategories: categories.filter(cat => 
      ['Just Chatting', 'Music', 'Art', 'Science & Technology', 'ASMR'].includes(cat.name)
    )
  }), [categories]);

  // Load categories on hook initialization
  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  return {
    // Data
    categories,
    
    // Loading state
    isLoading: loadingState.isLoading,
    error: loadingState.error,
    isSearching: loadingState.isSearching,
    
    // Operations
    searchCategories,
    getCategoryById,
    getCacheStats,
    clearCache,
    refreshCategories: loadCategories,
    
    // Utils
    clearError,
    
    // Computed values
    ...computedValues
  };
};

/**
 * Hook for category search with debouncing
 */
export const useCategorySearch = (debounceMs: number = 300) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StreamCategory[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { searchCategories, categories } = useCategories();

  // Debounced search effect
  useEffect(() => {
    // Discard stale responses: when the query changes (or the component
    // unmounts), this effect's cleanup flips `ignore`, so an earlier, slower
    // search can no longer overwrite the latest query's results.
    let ignore = false;

    if (!query.trim()) {
      setResults(categories.slice(0, 10)); // Show first 10 when no query
      setIsSearching(false); // No search is in flight for an empty query
      return;
    }

    setIsSearching(true);
    const timeoutId = setTimeout(async () => {
      try {
        const searchResults = await searchCategories(query);
        if (ignore) return;
        setResults(searchResults.slice(0, 10)); // Limit results
      } catch (error) {
        console.error('Search error:', error);
        if (ignore) return;
        setResults([]);
      } finally {
        if (!ignore) {
          setIsSearching(false);
        }
      }
    }, debounceMs);

    return () => {
      ignore = true;
      clearTimeout(timeoutId);
    };
  }, [query, searchCategories, categories, debounceMs]);

  return {
    query,
    setQuery,
    results,
    isSearching,
    hasResults: results.length > 0,
    clearQuery: () => setQuery('')
  };
};

/**
 * Hook for category validation
 */
export const useCategoryValidation = () => {
  const { getCategoryById } = useCategories();

  const validateCategory = useCallback(async (category: StreamCategory): Promise<boolean> => {
    if (!category.id || !category.name) {
      return false;
    }

    // Check if category exists in cache or defaults
    const existingCategory = await getCategoryById(category.id);
    return existingCategory !== null;
  }, [getCategoryById]);

  return {
    validateCategory
  };
};
