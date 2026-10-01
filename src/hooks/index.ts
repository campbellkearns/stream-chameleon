/**
 * Hooks Index
 * 
 * Central export point for all custom React hooks.
 * Provides clean imports for components.
 */

// Profile Management Hooks
export { 
  useProfiles, 
  useProfile, 
  useRepositoryHealth
} from './useProfiles';

// Channel Status Hooks

// Category Management Hooks
export { 
  useCategories, 
  useCategorySearch, 
  useCategoryValidation 
} from './useCategories';

// Apply History Hooks
export {
  useApplyHistory
} from './useApplyHistory';

// Authentication Hooks
export {
  useAuth,
  useAuthState,
  withAuth
} from './useAuth';

// Convenience object for all hooks
export const hooks = {
  // Profile hooks
  useProfiles,
  useProfile,
  useRepositoryHealth,
  
  // Category hooks
  useCategories,
  useCategorySearch,
  useCategoryValidation,
  
  // Apply history hooks
  useApplyHistory,
  
  // Auth hooks
  useAuth,
  useAuthState,
  withAuth
} as const;

/**
 * Hook types for external consumption
 */
export type ProfilesHookResult = ReturnType<typeof useProfiles>;
export type ProfileHookResult = ReturnType<typeof useProfile>;
export type CategoriesHookResult = ReturnType<typeof useCategories>;
export type CategorySearchHookResult = ReturnType<typeof useCategorySearch>;
export type AuthHookResult = ReturnType<typeof useAuth>;
export type AuthStateHookResult = ReturnType<typeof useAuthState>;
