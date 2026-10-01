/**
 * Profile Repository
 * 
 * Handles all profile data operations using the repository pattern.
 * Provides clean separation between UI and data layer with comprehensive
 * error handling and offline-first operations.
 */

import type { 
  StreamProfile, 
  CreateProfileInput, 
  UpdateProfileInput,
  ProfileValidationResult
} from '@/types/Profile';
import { 
  createProfile, 
  updateProfile, 
  validateProfile,
  generateUUID,
  searchProfiles,
  sortProfiles
} from '@/types/ProfileUtils';
import { STORAGE_KEYS, ERROR_CODES, SUCCESS_MESSAGES } from '@/types/constants';
import { getDB } from '@/lib/db/indexedDB';

/**
 * Repository result type for consistent error handling
 */
export interface RepositoryResult<T = void> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code: string;
    details?: unknown;
  };
}

/**
 * Profile Repository Implementation
 */
export class ProfileRepository {
  private readonly storeName = STORAGE_KEYS.PROFILES_STORE;

  /**
   * Get all profiles, sorted by most recently updated
   */
  async getAll(): Promise<RepositoryResult<StreamProfile[]>> {
    try {
      const db = await getDB();
      const profiles = await db.getAll<StreamProfile>(this.storeName);
      
      // Convert date strings back to Date objects (IndexedDB serialization)
      const processedProfiles = profiles.map(profile => ({
        ...profile,
        createdAt: new Date(profile.createdAt),
        updatedAt: new Date(profile.updatedAt)
      }));

      // Sort by most recently updated first
      const sortedProfiles = sortProfiles(processedProfiles, 'updatedAt', 'desc');

      return {
        success: true,
        data: sortedProfiles
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to fetch profiles',
          code: ERROR_CODES.STORAGE_ERROR,
          details: error
        }
      };
    }
  }

  /**
   * Get a profile by ID
   */
  async getById(id: string): Promise<RepositoryResult<StreamProfile>> {
    try {
      if (!id) {
        return {
          success: false,
          error: {
            message: 'Profile ID is required',
            code: ERROR_CODES.VALIDATION_ERROR
          }
        };
      }

      const db = await getDB();
      const profile = await db.get<StreamProfile>(this.storeName, id);

      if (!profile) {
        return {
          success: false,
          error: {
            message: 'Profile not found',
            code: 'PROFILE_NOT_FOUND'
          }
        };
      }

      // Convert date strings back to Date objects
      const processedProfile = {
        ...profile,
        createdAt: new Date(profile.createdAt),
        updatedAt: new Date(profile.updatedAt)
      };

      return {
        success: true,
        data: processedProfile
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to fetch profile',
          code: ERROR_CODES.STORAGE_ERROR,
          details: error
        }
      };
    }
  }

  /**
   * Create a new profile
   */
  async create(profileData: CreateProfileInput): Promise<RepositoryResult<StreamProfile>> {
    try {
      // Validate input data
      const validation = validateProfile(profileData);
      if (!validation.isValid) {
        return {
          success: false,
          error: {
            message: validation.errors.map(e => e.message).join(', '),
            code: ERROR_CODES.VALIDATION_ERROR,
            details: validation.errors
          }
        };
      }

      // Check for duplicate names
      const existingProfiles = await this.getAll();
      if (existingProfiles.success && existingProfiles.data) {
        const duplicateName = existingProfiles.data.find(
          p => p.name.toLowerCase().trim() === profileData.name.toLowerCase().trim()
        );
        if (duplicateName) {
          return {
            success: false,
            error: {
              message: 'A profile with this name already exists',
              code: 'DUPLICATE_NAME'
            }
          };
        }
      }

      // Create the profile using utility function
      const newProfile = createProfile(profileData);

      // Save to database
      const db = await getDB();
      await db.add(this.storeName, newProfile);

      return {
        success: true,
        data: newProfile
      };
    } catch (error) {
      // Handle specific IndexedDB errors
      if (error instanceof Error) {
        if (error.name === 'ConstraintError') {
          return {
            success: false,
            error: {
              message: 'A profile with this ID already exists',
              code: 'DUPLICATE_ID'
            }
          };
        }
        if (error.name === 'QuotaExceededError') {
          return {
            success: false,
            error: {
              message: 'Storage quota exceeded',
              code: ERROR_CODES.STORAGE_QUOTA_EXCEEDED
            }
          };
        }
      }

      return {
        success: false,
        error: {
          message: 'Failed to create profile',
          code: ERROR_CODES.STORAGE_ERROR,
          details: error
        }
      };
    }
  }

  /**
   * Update an existing profile
   */
  async update(id: string, updates: UpdateProfileInput): Promise<RepositoryResult<StreamProfile>> {
    try {
      // Get existing profile
      const existingResult = await this.getById(id);
      if (!existingResult.success || !existingResult.data) {
        return existingResult;
      }

      // Create updated profile data for validation
      const updatedData: CreateProfileInput = {
        name: updates.name ?? existingResult.data.name,
        description: updates.description ?? existingResult.data.description,
        category: updates.category ?? existingResult.data.category,
        title: updates.title ?? existingResult.data.title,
        tags: updates.tags ?? existingResult.data.tags,
        icon: updates.icon ?? existingResult.data.icon,
        accent: updates.accent ?? existingResult.data.accent
      };

      // Validate the updated data
      const validation = validateProfile(updatedData);
      if (!validation.isValid) {
        return {
          success: false,
          error: {
            message: validation.errors.map(e => e.message).join(', '),
            code: ERROR_CODES.VALIDATION_ERROR,
            details: validation.errors
          }
        };
      }

      // Check for duplicate names (excluding current profile)
      if (updates.name && updates.name !== existingResult.data.name) {
        const existingProfiles = await this.getAll();
        if (existingProfiles.success && existingProfiles.data) {
          const duplicateName = existingProfiles.data.find(
            p => p.id !== id && p.name.toLowerCase().trim() === updates.name!.toLowerCase().trim()
          );
          if (duplicateName) {
            return {
              success: false,
              error: {
                message: 'A profile with this name already exists',
                code: 'DUPLICATE_NAME'
              }
            };
          }
        }
      }

      // Create updated profile using utility function
      const updatedProfile = updateProfile(existingResult.data, updates);

      // Save to database
      const db = await getDB();
      await db.put(this.storeName, updatedProfile);

      return {
        success: true,
        data: updatedProfile
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to update profile',
          code: ERROR_CODES.STORAGE_ERROR,
          details: error
        }
      };
    }
  }

  /**
   * Delete a profile
   */
  async delete(id: string): Promise<RepositoryResult<void>> {
    try {
      // Check if profile exists
      const existingResult = await this.getById(id);
      if (!existingResult.success) {
        return {
          success: false,
          error: existingResult.error
        };
      }

      // Delete from database
      const db = await getDB();
      await db.delete(this.storeName, id);

      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to delete profile',
          code: ERROR_CODES.STORAGE_ERROR,
          details: error
        }
      };
    }
  }

  /**
   * Search profiles by query
   */
  async search(query: string): Promise<RepositoryResult<StreamProfile[]>> {
    try {
      const allProfilesResult = await this.getAll();
      if (!allProfilesResult.success || !allProfilesResult.data) {
        return allProfilesResult;
      }

      const results = searchProfiles(allProfilesResult.data, query);

      return {
        success: true,
        data: results
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to search profiles',
          code: ERROR_CODES.STORAGE_ERROR,
          details: error
        }
      };
    }
  }

  /**
   * Get profiles by category
   */
  async getByCategory(categoryId: string): Promise<RepositoryResult<StreamProfile[]>> {
    try {
      const allProfilesResult = await this.getAll();
      if (!allProfilesResult.success || !allProfilesResult.data) {
        return allProfilesResult;
      }

      const results = allProfilesResult.data.filter(
        profile => profile.category.id === categoryId
      );

      return {
        success: true,
        data: results
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to fetch profiles by category',
          code: ERROR_CODES.STORAGE_ERROR,
          details: error
        }
      };
    }
  }

  /**
   * Get profile count
   */
  async getCount(): Promise<RepositoryResult<number>> {
    try {
      const allProfilesResult = await this.getAll();
      if (!allProfilesResult.success || !allProfilesResult.data) {
        return {
          success: false,
          error: allProfilesResult.error || { message: 'Failed to count profiles', code: ERROR_CODES.STORAGE_ERROR }
        };
      }

      return {
        success: true,
        data: allProfilesResult.data.length
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to count profiles',
          code: ERROR_CODES.STORAGE_ERROR,
          details: error
        }
      };
    }
  }

  /**
   * Clear all profiles (useful for testing/reset)
   */
  async deleteAll(): Promise<RepositoryResult<void>> {
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
          message: 'Failed to clear profiles',
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
}

// Singleton instance
let repositoryInstance: ProfileRepository | null = null;

/**
 * Get the profile repository instance
 */
export const getProfileRepository = (): ProfileRepository => {
  if (!repositoryInstance) {
    repositoryInstance = new ProfileRepository();
  }
  return repositoryInstance;
};

/**
 * Reset the repository instance (useful for testing)
 */
export const resetProfileRepository = (): void => {
  repositoryInstance = null;
};
