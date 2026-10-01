/**
 * Repository Index
 * 
 * Central export point for all repository classes and interfaces.
 * Provides clean imports for data layer components.
 */

// Profile Repository
export { 
  ProfileRepository, 
  getProfileRepository, 
  resetProfileRepository 
} from './ProfileRepository';

// Category Repository  
export { 
  CategoryRepository, 
  getCategoryRepository, 
  resetCategoryRepository 
} from './CategoryRepository';

// Apply History Repository
export {
  ApplyHistoryRepository,
  getApplyHistoryRepository,
  resetApplyHistoryRepository
} from './ApplyHistoryRepository';

// Repository Result Type (shared interface)
export type { RepositoryResult } from './ProfileRepository';

// Import the functions for internal use
import { getProfileRepository, resetProfileRepository } from './ProfileRepository';
import { getCategoryRepository, resetCategoryRepository } from './CategoryRepository';
import { getApplyHistoryRepository, resetApplyHistoryRepository } from './ApplyHistoryRepository';

// Convenience exports for common operations
export const repositories = {
  profiles: getProfileRepository,
  categories: getCategoryRepository,
  applyHistory: getApplyHistoryRepository
} as const;

/**
 * Initialize all repositories
 * Useful for app startup to ensure all databases are ready
 */
export async function initializeRepositories(): Promise<{
  profilesReady: boolean;
  categoriesReady: boolean;
  allReady: boolean;
}> {
  try {
    const profileRepo = getProfileRepository();
    const categoryRepo = getCategoryRepository();
    
    const [profilesReady, categoriesReady] = await Promise.all([
      profileRepo.isReady(),
      // Categories don't have an isReady method, assume ready if no error
      Promise.resolve(true)
    ]);
    
    return {
      profilesReady,
      categoriesReady,
      allReady: profilesReady && categoriesReady
    };
  } catch (error) {
    console.error('Failed to initialize repositories:', error);
    return {
      profilesReady: false,
      categoriesReady: false,
      allReady: false
    };
  }
}

/**
 * Reset all repositories (useful for testing)
 */
export function resetAllRepositories(): void {
  resetProfileRepository();
  resetCategoryRepository();
  resetApplyHistoryRepository();
}
