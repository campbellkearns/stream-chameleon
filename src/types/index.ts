/**
 * Type Definitions Index
 * 
 * Central export point for all type definitions used throughout the application.
 * This enables clean imports and maintains a clear API surface.
 */

// Profile Domain Types
export type {
  StreamProfile,
  StreamCategory,
  StreamTags,
  CreateProfileInput,
  UpdateProfileInput,
  ProfileValidationResult,
  ProfileValidationError,
  ProcessedTitle,
  ProfileExport,
  SentChannelPayload,
  ApplyRecord
} from './Profile';

export {
  PROFILE_VALIDATION_ERRORS,
  TITLE_TEMPLATES
} from './Profile';

// Twitch API Types
export type {
  TwitchAuthToken,
  StoredAuthToken,
  OAuthState,
  TwitchGameResponse,
  CachedCategory,
  TwitchChannelResponse,
  UpdateChannelRequest,
  TwitchGamesSearchResponse,
  TwitchChannelInfoResponse,
  TwitchUserResponse,
  TwitchUserInfoResponse,
  TwitchAPIError,
  TwitchRateLimit,
  TwitchAPIConfig,
  TwitchAPIHealthCheck
} from './TwitchAPI';

export {
  TWITCH_SCOPES,
  TWITCH_ENDPOINTS,
  CACHE_CONFIG
} from './TwitchAPI';

// Common Application Types
export interface AppError {
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Error severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Additional context data */
  context?: Record<string, unknown>;
  /** Original error if this wraps another error */
  cause?: Error;
  /** Timestamp when error occurred */
  timestamp: Date;
}

export interface LoadingState {
  /** Whether operation is in progress */
  isLoading: boolean;
  /** Optional loading message */
  message?: string;
  /** Progress percentage (0-100) */
  progress?: number;
}

export interface AsyncOperationResult<T> {
  /** Whether operation succeeded */
  success: boolean;
  /** Result data if successful */
  data?: T;
  /** Error if operation failed */
  error?: AppError;
  /** Loading state */
  loading: LoadingState;
}

export interface PaginatedResult<T> {
  /** Array of items for current page */
  items: T[];
  /** Total number of items across all pages */
  total: number;
  /** Current page number (0-indexed) */
  page: number;
  /** Number of items per page */
  pageSize: number;
  /** Whether there are more pages */
  hasMore: boolean;
  /** Cursor for next page (if cursor-based pagination) */
  nextCursor?: string;
}

export interface SearchOptions {
  /** Search query string */
  query: string;
  /** Maximum number of results */
  limit?: number;
  /** Search in specific fields only */
  fields?: string[];
  /** Case-sensitive search */
  caseSensitive?: boolean;
}

export interface SortOptions<T> {
  /** Field to sort by */
  field: keyof T;
  /** Sort direction */
  direction: 'asc' | 'desc';
}

export interface FilterOptions<T> {
  /** Field to filter by */
  field: keyof T;
  /** Filter operator */
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'gte' | 'lte';
  /** Value to filter against */
  value: unknown;
}

/**
 * Network connectivity states
 */
export type NetworkStatus = 'online' | 'offline' | 'unknown';

/**
 * Application-wide configuration
 */
export interface AppConfig {
  /** Twitch application client ID */
  twitchClientId: string;
  /** OAuth redirect URI */
  redirectUri: string;
  /** API request timeout in milliseconds */
  apiTimeout: number;
  /** Enable debug logging */
  debug: boolean;
  /** Application version */
  version: string;
}

/**
 * User preferences/settings
 */
export interface UserPreferences {
  /** Preferred theme */
  theme: 'light' | 'dark' | 'system';
  /** Enable notifications */
  notifications: boolean;
  /** Auto-apply profiles on stream start */
  autoApply: boolean;
  /** Default profile to apply */
  defaultProfileId?: string;
  /** Confirmation dialogs enabled */
  confirmActions: boolean;
}

/**
 * Route parameter types for React Router
 */
export interface RouteParams {
  /** Profile ID parameter */
  profileId?: string;
}

/**
 * Navigation breadcrumb item
 */
export interface BreadcrumbItem {
  /** Display label */
  label: string;
  /** Navigation path */
  path?: string;
  /** Whether this is the current page */
  active: boolean;
}

/**
 * Form field validation state
 */
export interface FieldValidation {
  /** Whether field is valid */
  isValid: boolean;
  /** Validation error message */
  error?: string;
  /** Whether field has been touched by user */
  touched: boolean;
  /** Whether field is currently being validated */
  validating: boolean;
}

/**
 * Form state management
 */
export interface FormState<T> {
  /** Current form values */
  values: T;
  /** Validation state for each field */
  validation: Record<keyof T, FieldValidation>;
  /** Whether form is currently submitting */
  isSubmitting: boolean;
  /** Whether form has been submitted */
  submitted: boolean;
  /** Whether form data has changed */
  isDirty: boolean;
}

// Re-export profile utilities for convenience
export * from './ProfileUtils';

// Re-export constants
export * from './constants';
