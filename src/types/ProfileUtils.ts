/**
 * Profile Utilities
 * 
 * Helper functions for working with stream profiles, including validation,
 * template processing, and data transformation.
 */

import { 
  StreamProfile, 
  CreateProfileInput, 
  ProfileValidationResult, 
  ProfileValidationError,
  ProcessedTitle,
  StreamCategory,
  ApplyRecord,
  PROFILE_VALIDATION_ERRORS,
  TITLE_TEMPLATES,
  PRESET_ACCENTS
} from '../types/Profile';

/**
 * Manual categories
 *
 * Categories typed by hand in the dropdown have no real Twitch id. They are
 * marked at creation (manual flag + 'manual:' id prefix) so the Twitch API
 * layer can keep synthetic ids off the wire — Twitch rejects non-numeric
 * game_id values.
 */

/** Prefix identifying manually-entered category ids */
export const MANUAL_CATEGORY_ID_PREFIX = 'manual:';

/**
 * Build the synthetic id for a manually-entered category
 */
export function manualCategoryId(name: string): string {
  return `${MANUAL_CATEGORY_ID_PREFIX}${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

/**
 * Check whether a category is a manual entry with no real Twitch id.
 *
 * Beyond the explicit marker, any non-numeric id counts as manual so legacy
 * synthetic entries (created before marking existed) can never reach Twitch.
 */
export function isManualCategory(category: StreamCategory): boolean {
  return (
    category.manual === true ||
    category.id.startsWith(MANUAL_CATEGORY_ID_PREFIX) ||
    !/^\d+$/.test(category.id)
  );
}

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Create a new profile with generated ID and timestamps
 */
export function createProfile(input: CreateProfileInput): StreamProfile {
  const now = new Date();
  
  return {
    id: generateUUID(),
    name: input.name.trim(),
    description: input.description?.trim(),
    category: input.category,
    title: input.title.trim(),
    tags: input.tags.map(tag => tag.trim()).filter(tag => tag.length > 0),
    icon: input.icon?.trim() || undefined,
    accent: input.accent,
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Create an apply-history record with generated ID and timestamp.
 * Mirrors createProfile: the caller supplies the domain fields, this owns
 * the generated ones (UUID v4 id, epoch-ms appliedAt).
 */
export function createApplyRecord(
  input: Omit<ApplyRecord, 'id' | 'appliedAt'>
): ApplyRecord {
  return {
    ...input,
    id: generateUUID(),
    appliedAt: Date.now()
  };
}

/**
 * Update an existing profile with new data
 */
export function updateProfile(
  existing: StreamProfile,
  updates: Partial<CreateProfileInput>
): StreamProfile {
  return {
    ...existing,
    ...updates,
    updatedAt: new Date()
  };
}

/**
 * Validate a profile for creation or update
 */
export function validateProfile(input: CreateProfileInput): ProfileValidationResult {
  const errors: ProfileValidationError[] = [];

  // Validate name
  if (!input.name || input.name.trim().length === 0) {
    errors.push({
      field: 'name',
      message: 'Profile name is required',
      code: PROFILE_VALIDATION_ERRORS.NAME_REQUIRED
    });
  } else if (input.name.trim().length > 100) {
    errors.push({
      field: 'name',
      message: 'Profile name must be 100 characters or less',
      code: PROFILE_VALIDATION_ERRORS.NAME_TOO_LONG
    });
  }

  // Validate title
  if (!input.title || input.title.trim().length === 0) {
    errors.push({
      field: 'title',
      message: 'Stream title is required',
      code: PROFILE_VALIDATION_ERRORS.TITLE_REQUIRED
    });
  } else if (input.title.trim().length > 140) {
    errors.push({
      field: 'title',
      message: 'Stream title must be 140 characters or less',
      code: PROFILE_VALIDATION_ERRORS.TITLE_TOO_LONG
    });
  }

  // Validate category
  if (!input.category || !input.category.id || !input.category.name) {
    errors.push({
      field: 'category',
      message: 'Stream category is required',
      code: PROFILE_VALIDATION_ERRORS.CATEGORY_REQUIRED
    });
  }

  // Validate tags
  if (input.tags.length > 10) {
    errors.push({
      field: 'tags',
      message: 'Maximum 10 tags allowed',
      code: PROFILE_VALIDATION_ERRORS.TAGS_TOO_MANY
    });
  }

  input.tags.forEach((tag, index) => {
    if (tag.length > 25) {
      errors.push({
        field: 'tags',
        message: `Tag ${index + 1} must be 25 characters or less`,
        code: PROFILE_VALIDATION_ERRORS.TAG_TOO_LONG
      });
    }

    // Twitch tag validation: alphanumeric, spaces, and some special chars
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(tag)) {
      errors.push({
        field: 'tags',
        message: `Tag "${tag}" contains invalid characters`,
        code: PROFILE_VALIDATION_ERRORS.TAG_INVALID_CHARS
      });
    }
  });

  // Validate icon: one emoji or character
  if (input.icon !== undefined && countGraphemes(input.icon.trim()) > 1) {
    errors.push({
      field: 'icon',
      message: 'Icon must be a single emoji or character',
      code: PROFILE_VALIDATION_ERRORS.ICON_INVALID
    });
  }

  // Validate accent against the fixed palette
  if (input.accent !== undefined && !(PRESET_ACCENTS as readonly string[]).includes(input.accent)) {
    errors.push({
      field: 'accent',
      message: `Accent must be one of: ${PRESET_ACCENTS.join(', ')}`,
      code: PROFILE_VALIDATION_ERRORS.ACCENT_INVALID
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Count user-perceived characters, so multi-codepoint emoji like 👩‍💻 count as one
 */
export function countGraphemes(text: string): number {
  // Intl.Segmenter isn't in this project's TS lib target, so type the bit we use
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (locale: undefined, options: { granularity: 'grapheme' }) => { segment(input: string): Iterable<unknown> };
  }).Segmenter;
  if (Segmenter) {
    return [...new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length;
  }
  return [...text].length;
}

/**
 * Process a title template with current date/time
 */
export function processTitle(template: string): ProcessedTitle {
  const now = new Date();
  const replacements: Record<string, string> = {};
  
  let processed = template;

  // Replace date template
  if (processed.includes(TITLE_TEMPLATES.DATE)) {
    // Local calendar day so {YYYY-MM-DD} agrees with {DAY} near midnight in non-UTC timezones
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; // YYYY-MM-DD
    replacements[TITLE_TEMPLATES.DATE] = dateStr;
    processed = processed.replace(new RegExp(escapeRegExp(TITLE_TEMPLATES.DATE), 'g'), dateStr);
  }

  // Replace day template
  if (processed.includes(TITLE_TEMPLATES.DAY)) {
    const dayStr = now.toLocaleDateString('en-US', { weekday: 'long' });
    replacements[TITLE_TEMPLATES.DAY] = dayStr;
    processed = processed.replace(new RegExp(escapeRegExp(TITLE_TEMPLATES.DAY), 'g'), dayStr);
  }

  return {
    template,
    processed,
    replacements
  };
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if a title contains dynamic templates
 */
export function titleHasTemplates(title: string): boolean {
  return Object.values(TITLE_TEMPLATES).some(template => 
    title.includes(template)
  );
}

/**
 * Get available template placeholders
 */
export function getAvailableTemplates(): Array<{ placeholder: string; description: string; example: string }> {
  const now = new Date();
  
  return [
    {
      placeholder: TITLE_TEMPLATES.DATE,
      description: 'Current date',
      example: now.toISOString().split('T')[0]
    },
    {
      placeholder: TITLE_TEMPLATES.DAY,
      description: 'Current day of week',
      example: now.toLocaleDateString('en-US', { weekday: 'long' })
    }
  ];
}

/**
 * Search profiles by name or description
 */
export function searchProfiles(profiles: StreamProfile[], query: string): StreamProfile[] {
  if (!query.trim()) {
    return profiles;
  }

  const searchTerm = query.toLowerCase().trim();
  
  return profiles.filter(profile => 
    profile.name.toLowerCase().includes(searchTerm) ||
    profile.description?.toLowerCase().includes(searchTerm) ||
    profile.category.name.toLowerCase().includes(searchTerm) ||
    profile.tags.some(tag => tag.toLowerCase().includes(searchTerm))
  );
}

/**
 * Sort profiles by different criteria
 */
export function sortProfiles(
  profiles: StreamProfile[], 
  sortBy: 'name' | 'category' | 'createdAt' | 'updatedAt',
  direction: 'asc' | 'desc' = 'asc'
): StreamProfile[] {
  const sorted = [...profiles].sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'category':
        comparison = a.category.name.localeCompare(b.category.name);
        break;
      case 'createdAt':
        comparison = a.createdAt.getTime() - b.createdAt.getTime();
        break;
      case 'updatedAt':
        comparison = a.updatedAt.getTime() - b.updatedAt.getTime();
        break;
    }

    return direction === 'desc' ? -comparison : comparison;
  });

  return sorted;
}

/**
 * Export profiles to JSON format
 */
export function exportProfiles(profiles: StreamProfile[]): string {
  const exportData = {
    version: '1.0',
    exportedAt: new Date(),
    profiles
  };
  
  return JSON.stringify(exportData, null, 2);
}

/**
 * Validate and parse imported profile data
 */
export function importProfiles(jsonData: string): StreamProfile[] {
  try {
    const data = JSON.parse(jsonData);
    
    if (!data.profiles || !Array.isArray(data.profiles)) {
      throw new Error('Invalid export format: missing profiles array');
    }

    return data.profiles.map((profile: any) => ({
      ...profile,
      createdAt: new Date(profile.createdAt),
      updatedAt: new Date(profile.updatedAt)
    }));
  } catch (error) {
    throw new Error(`Failed to import profiles: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get profile statistics
 */
export function getProfileStats(profiles: StreamProfile[]): {
  total: number;
  byCategory: Record<string, number>;
  withTemplates: number;
  mostUsedTags: Array<{ tag: string; count: number }>;
  recentlyUpdated: StreamProfile[];
} {
  const byCategory: Record<string, number> = {};
  const tagCounts: Record<string, number> = {};
  let withTemplates = 0;

  profiles.forEach(profile => {
    // Count by category
    byCategory[profile.category.name] = (byCategory[profile.category.name] || 0) + 1;
    
    // Count templates
    if (titleHasTemplates(profile.title)) {
      withTemplates++;
    }
    
    // Count tags
    profile.tags.forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });

  // Get most used tags
  const mostUsedTags = Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Get recently updated profiles (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentlyUpdated = profiles
    .filter(profile => profile.updatedAt > sevenDaysAgo)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  return {
    total: profiles.length,
    byCategory,
    withTemplates,
    mostUsedTags,
    recentlyUpdated
  };
}
