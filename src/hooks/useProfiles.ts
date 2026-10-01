/**
 * Profile Management Hooks
 * 
 * React hooks for managing stream profiles with comprehensive error handling,
 * loading states, and offline-first operations.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { StreamProfile, CreateProfileInput, UpdateProfileInput } from '@/types/Profile';
import { getProfileRepository, type RepositoryResult } from '@/repositories/ProfileRepository';
import { processTitle } from '@/types/ProfileUtils';

/**
 * Loading state interface
 */
interface LoadingState {
  isLoading: boolean;
  error: string | null;
}

/**
 * Main profiles management hook
 * 
 * Provides comprehensive CRUD operations for stream profiles with optimistic updates,
 * error handling, and local state management.
 */
export const useProfiles = () => {
  const [profiles, setProfiles] = useState<StreamProfile[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: true, // Start as loading
    error: null
  });

  const profileRepository = getProfileRepository();

  /**
   * Load all profiles from the repository
   */
  const loadProfiles = useCallback(async () => {
    setLoadingState(prev => ({ ...prev, isLoading: true }));
    
    try {
      const result = await profileRepository.getAll();
      
      if (result.success && result.data) {
        setProfiles(result.data);
        setLoadingState({ isLoading: false, error: null });
      } else {
        setLoadingState({
          isLoading: false,
          error: result.error?.message || 'Failed to load profiles'
        });
      }
    } catch (error) {
      setLoadingState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred'
      });
    }
  }, [profileRepository]);

  /**
   * Create a new profile with optimistic updates
   */
  const createProfile = useCallback(async (profileData: CreateProfileInput): Promise<StreamProfile | null> => {
    setLoadingState(prev => ({ ...prev, isLoading: true }));
    
    try {
      const result = await profileRepository.create(profileData);
      
      if (result.success && result.data) {
        // Optimistic update: add to beginning of list
        setProfiles(prev => [result.data!, ...prev]);
        setLoadingState({ isLoading: false, error: null });
        return result.data;
      } else {
        setLoadingState({
          isLoading: false,
          error: result.error?.message || 'Failed to create profile'
        });
        return null;
      }
    } catch (error) {
      setLoadingState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred'
      });
      return null;
    }
  }, [profileRepository]);

  /**
   * Update an existing profile with optimistic updates
   */
  const updateProfile = useCallback(async (id: string, updates: UpdateProfileInput): Promise<StreamProfile | null> => {
    setLoadingState(prev => ({ ...prev, isLoading: true }));
    
    try {
      const result = await profileRepository.update(id, updates);
      
      if (result.success && result.data) {
        // Optimistic update: update profile in place
        setProfiles(prev => 
          prev.map(profile => 
            profile.id === id ? result.data! : profile
          )
        );
        setLoadingState({ isLoading: false, error: null });
        return result.data;
      } else {
        setLoadingState({
          isLoading: false,
          error: result.error?.message || 'Failed to update profile'
        });
        return null;
      }
    } catch (error) {
      setLoadingState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred'
      });
      return null;
    }
  }, [profileRepository]);

  /**
   * Delete a profile with optimistic updates
   */
  const deleteProfile = useCallback(async (id: string): Promise<boolean> => {
    setLoadingState(prev => ({ ...prev, isLoading: true }));
    
    // Store the profile for potential rollback
    const profileToDelete = profiles.find(p => p.id === id);
    
    // Optimistic update: remove immediately
    setProfiles(prev => prev.filter(profile => profile.id !== id));
    
    try {
      const result = await profileRepository.delete(id);
      
      if (result.success) {
        setLoadingState({ isLoading: false, error: null });
        return true;
      } else {
        // Rollback on failure
        if (profileToDelete) {
          setProfiles(prev => [...prev, profileToDelete].sort((a, b) => 
            b.updatedAt.getTime() - a.updatedAt.getTime()
          ));
        }
        setLoadingState({
          isLoading: false,
          error: result.error?.message || 'Failed to delete profile'
        });
        return false;
      }
    } catch (error) {
      // Rollback on error
      if (profileToDelete) {
        setProfiles(prev => [...prev, profileToDelete].sort((a, b) => 
          b.updatedAt.getTime() - a.updatedAt.getTime()
        ));
      }
      setLoadingState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred'
      });
      return false;
    }
  }, [profiles, profileRepository]);

  /**
   * Get a specific profile by ID
   */
  const getProfile = useCallback(async (id: string): Promise<StreamProfile | null> => {
    try {
      const result = await profileRepository.getById(id);
      return result.success && result.data ? result.data : null;
    } catch (error) {
      console.error('Failed to get profile:', error);
      return null;
    }
  }, [profileRepository]);

  /**
   * Search profiles by query
   */
  const searchProfiles = useCallback(async (query: string): Promise<StreamProfile[]> => {
    try {
      const result = await profileRepository.search(query);
      return result.success && result.data ? result.data : [];
    } catch (error) {
      console.error('Failed to search profiles:', error);
      return [];
    }
  }, [profileRepository]);

  /**
   * Clear any errors
   */
  const clearError = useCallback(() => {
    setLoadingState(prev => ({ ...prev, error: null }));
  }, []);

  /**
   * Refresh profiles (reload from database)
   */
  const refreshProfiles = useCallback(() => {
    loadProfiles();
  }, [loadProfiles]);

  // Computed values
  const computedValues = useMemo(() => ({
    profileCount: profiles.length,
    hasProfiles: profiles.length > 0,
    isEmpty: profiles.length === 0,
    categories: [...new Set(profiles.map(p => p.category.name))],
    mostRecentProfile: profiles[0] || null,
    profilesWithTemplates: profiles.filter(p => 
      p.title.includes('{YYYY-MM-DD}') || p.title.includes('{DAY}')
    ).length
  }), [profiles]);

  // Load profiles on hook initialization
  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  return {
    // Data
    profiles,
    
    // Loading state
    isLoading: loadingState.isLoading,
    error: loadingState.error,
    
    // Operations
    createProfile,
    updateProfile,
    deleteProfile,
    getProfile,
    searchProfiles,
    refreshProfiles,
    
    // Utils
    clearError,
    
    // Computed values
    ...computedValues
  };
};

/**
 * Hook for managing a single profile (useful for edit forms)
 */
export const useProfile = (id: string | null) => {
  const [profile, setProfile] = useState<StreamProfile | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: false,
    error: null
  });

  const profileRepository = getProfileRepository();

  const loadProfile = useCallback(async () => {
    if (!id) {
      setProfile(null);
      setLoadingState({ isLoading: false, error: null });
      return;
    }

    setLoadingState({ isLoading: true, error: null });
    
    try {
      const result = await profileRepository.getById(id);
      
      if (result.success && result.data) {
        setProfile(result.data);
        setLoadingState({ isLoading: false, error: null });
      } else {
        setProfile(null);
        setLoadingState({
          isLoading: false,
          error: result.error?.message || 'Profile not found'
        });
      }
    } catch (error) {
      setProfile(null);
      setLoadingState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred'
      });
    }
  }, [id, profileRepository]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  return {
    profile,
    isLoading: loadingState.isLoading,
    error: loadingState.error,
    reload: loadProfile,
    exists: profile !== null
  };
};

/**
 * Hook for profile validation
 */
export const useProfileValidation = () => {
  const { validateProfile } = require('@/types/ProfileUtils');
  
  const validateInput = useCallback((input: CreateProfileInput) => {
    return validateProfile(input);
  }, []);

  return {
    validateInput
  };
};

/**
 * Hook for profile statistics and analytics
 */
export const useProfileStats = () => {
  const [stats, setStats] = useState({
    total: 0,
    byCategory: {} as Record<string, number>,
    withTemplates: 0,
    mostUsedTags: [] as Array<{ tag: string; count: number }>,
    recentlyUpdated: [] as StreamProfile[]
  });

  const { profiles, isLoading } = useProfiles();

  useEffect(() => {
    if (!isLoading && profiles.length > 0) {
      const { getProfileStats } = require('@/types/ProfileUtils');
      setStats(getProfileStats(profiles));
    }
  }, [profiles, isLoading]);

  return stats;
};

/**
 * Hook for checking repository health
 */
export const useRepositoryHealth = () => {
  const [isHealthy, setIsHealthy] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  
  const profileRepository = getProfileRepository();

  const checkHealth = useCallback(async () => {
    setIsChecking(true);
    try {
      const healthy = await profileRepository.isReady();
      setIsHealthy(healthy);
    } catch {
      setIsHealthy(false);
    } finally {
      setIsChecking(false);
    }
  }, [profileRepository]);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  return {
    isHealthy,
    isChecking,
    checkHealth
  };
};
