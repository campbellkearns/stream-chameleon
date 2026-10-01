/**
 * Application Constants
 * 
 * Centralized configuration and constants for the Stream Profile Manager
 */

/**
 * Application metadata
 */
export const APP_CONFIG = {
  /** Application name */
  NAME: 'Stream Chameleon',
  /** Application version */
  VERSION: '0.1.0',
  /** Application description */
  DESCRIPTION: 'One-click stream profile management for Twitch streamers',
  /** GitHub repository URL */
  /** TODO: update URL when GitHub repo is renamed */
  REPOSITORY: 'https://github.com/campbellkearns/stream-chameleon'
} as const;

/**
 * Twitch API configuration
 */
export const TWITCH_CONFIG = {
  /** OAuth 2.0 authorization URL */
  AUTH_URL: 'https://id.twitch.tv/oauth2/authorize',
  /** Required OAuth scopes */
  REQUIRED_SCOPES: ['channel:manage:broadcast'],
  /** OAuth response type - 'token' for implicit grant flow (client-side apps) */
  RESPONSE_TYPE: 'token',
  /** OAuth redirect URI (dynamic based on environment) */
  get REDIRECT_URI() {
    return `${window.location.origin}/auth/callback`;
  },
  /** Client ID (to be set from environment) */
  CLIENT_ID: import.meta.env.VITE_TWITCH_CLIENT_ID || ''
} as const;

/**
 * Twitch API endpoints
 */
export const TWITCH_ENDPOINTS = {
  /** OAuth token endpoint */
  TOKEN: 'https://id.twitch.tv/oauth2/token',
  /** Token validation endpoint */
  VALIDATE: 'https://id.twitch.tv/oauth2/validate',
  /** Revoke token endpoint */
  REVOKE: 'https://id.twitch.tv/oauth2/revoke',
  /** API base URL */
  API_BASE: 'https://api.twitch.tv/helix',
  /** Channel information */
  CHANNELS: '/channels',
  /** Games/categories */
  GAMES: '/games',
  /** User information */
  USERS: '/users'
} as const;

/**
 * API request configuration
 */
export const API_CONFIG = {
  /** Request timeout in milliseconds */
  TIMEOUT: 10000,
  /** Retry attempts for failed requests */
  RETRY_ATTEMPTS: 3,
  /** Delay between retries in milliseconds */
  RETRY_DELAY: 1000,
  /** Rate limit buffer (requests per minute) */
  RATE_LIMIT_BUFFER: 50,
  /**
   * Minimum interval (ms) between automatic channel-status refreshes
   * (mount / window focus / visibilitychange) — the C2 spec's 30s throttle
   * floor. RATE_LIMIT_BUFFER is a per-minute request quota, not an interval,
   * so the spec's explicit 30s minimum applies.
   */
  CHANNEL_STATUS_MIN_INTERVAL: 30_000
} as const;

/**
 * Local storage keys
 */
export const STORAGE_KEYS = {
  /** IndexedDB database name */
  DB_NAME: 'StreamChameleonDB',
  /** Database version */
  DB_VERSION: 2,
  /** Profiles object store */
  PROFILES_STORE: 'profiles',
  /** Categories cache store */
  CATEGORIES_STORE: 'categories',
  /** Auth tokens store */
  AUTH_STORE: 'auth',
  /** User preferences store */
  PREFERENCES_STORE: 'preferences',
  /** Apply history store (added in DB v2) */
  APPLY_HISTORY_STORE: 'applyHistory'
} as const;

/**
 * Validation constraints
 */
export const VALIDATION_LIMITS = {
  /** Maximum profile name length */
  PROFILE_NAME_MAX: 100,
  /** Maximum profile description length */
  PROFILE_DESCRIPTION_MAX: 500,
  /** Maximum stream title length */
  STREAM_TITLE_MAX: 140,
  /** Maximum number of tags */
  TAGS_MAX: 10,
  /** Maximum tag length */
  TAG_MAX: 25,
  /** Maximum profiles per user */
  PROFILES_MAX: 50
} as const;

/**
 * UI configuration
 */
export const UI_CONFIG = {
  /** Default page size for pagination */
  DEFAULT_PAGE_SIZE: 20,
  /** Debounce delay for search in milliseconds */
  SEARCH_DEBOUNCE: 300,
  /** Animation duration in milliseconds */
  ANIMATION_DURATION: 200,
  /** Toast notification duration in milliseconds */
  TOAST_DURATION: 4000
} as const;

/**
 * Cache configuration
 */
export const CACHE_SETTINGS = {
  /** Categories cache TTL (24 hours) */
  CATEGORIES_TTL: 24 * 60 * 60 * 1000,
  /** User info cache TTL (1 hour) */
  USER_INFO_TTL: 60 * 60 * 1000,
  /** Health check cache TTL (5 minutes) */
  HEALTH_CHECK_TTL: 5 * 60 * 1000,
  /** Token validation cache TTL (10 minutes) */
  TOKEN_VALIDATION_TTL: 10 * 60 * 1000
} as const;

/**
 * Feature flags for development
 */
export const FEATURE_FLAGS = {
  /** Enable debug logging */
  DEBUG_LOGGING: import.meta.env.DEV,
  /** Enable experimental features */
  EXPERIMENTAL: false,
  /** Enable analytics tracking */
  ANALYTICS: false,
  /** Enable service worker */
  SERVICE_WORKER: true
} as const;

/**
 * Error codes for consistent error handling
 */
export const ERROR_CODES = {
  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  
  // Authentication errors
  AUTH_FAILED: 'AUTH_FAILED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INSUFFICIENT_SCOPES: 'INSUFFICIENT_SCOPES',
  
  // API errors
  API_ERROR: 'API_ERROR',
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
  CHANNEL_UPDATE_FAILED: 'CHANNEL_UPDATE_FAILED',
  
  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_PROFILE_DATA: 'INVALID_PROFILE_DATA',
  
  // Storage errors
  STORAGE_ERROR: 'STORAGE_ERROR',
  STORAGE_QUOTA_EXCEEDED: 'STORAGE_QUOTA_EXCEEDED',
  
  // Unknown errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

/**
 * Success message templates
 */
export const SUCCESS_MESSAGES = {
  PROFILE_CREATED: 'Profile created successfully!',
  PROFILE_UPDATED: 'Profile updated successfully!',
  PROFILE_DELETED: 'Profile deleted successfully!',
  PROFILE_APPLIED: 'Stream profile applied successfully!',
  AUTH_SUCCESS: 'Successfully connected to Twitch!',
  CATEGORIES_SYNCED: 'Categories updated from Twitch!'
} as const;

/**
 * Default user preferences
 */
export const DEFAULT_PREFERENCES = {
  theme: 'system' as const,
  notifications: true,
  autoApply: false,
  confirmActions: true,
  defaultProfileId: undefined
};

/**
 * Keyboard shortcuts
 */
export const KEYBOARD_SHORTCUTS = {
  /** Create new profile */
  NEW_PROFILE: 'ctrl+n',
  /** Search profiles */
  SEARCH: 'ctrl+k',
  /** Save current form */
  SAVE: 'ctrl+s',
  /** Cancel current action */
  CANCEL: 'escape'
} as const;

/**
 * Route paths
 */
export const ROUTES = {
  HOME: '/',
  DASHBOARD: '/dashboard',
  CREATE_PROFILE: '/profile/new',
  EDIT_PROFILE: '/profile/:id/edit',
  AUTH_CALLBACK: '/auth/callback',
  SETTINGS: '/settings'
} as const;
