/**
 * Twitch API Client
 * 
 * Comprehensive client for Twitch API operations supporting stream profile management.
 * Handles stream updates, category search, and health monitoring with proper error handling.
 */

import { getTwitchAuth } from '@/lib/auth/twitchAuth';
import { getCategoryRepository } from '@/repositories/CategoryRepository';
import { isManualCategory, processTitle } from '@/types/ProfileUtils';
import type { 
  TwitchAPIHealthCheck,
  TwitchGameResponse,
  TwitchGamesSearchResponse,
  TwitchChannelResponse,
  TwitchChannelInfoResponse,
  UpdateChannelRequest,
  TwitchAPIError,
  TwitchRateLimit,
  CachedCategory
} from '@/types/TwitchAPI';
import type { StreamProfile, SentChannelPayload } from '@/types/Profile';
import { TWITCH_ENDPOINTS, TWITCH_CONFIG, API_CONFIG, FEATURE_FLAGS } from '@/types/constants';

/**
 * Result wrapper for API operations
 */
export interface APIResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  rateLimit?: TwitchRateLimit;
}

/**
 * Stream update request based on profile
 */
export interface StreamUpdateRequest {
  gameId: string;
  title: string;
  tags: string[];
}

/**
 * Build the exact payload an apply sends to Twitch: processed title, tags
 * capped at 10, and game_id omitted for manual categories. Takes a profile
 * or an ad-hoc Live edit, which share the same title/category/tags shape. The PATCH body
 * and apply-history records both derive from this function, so stored wire
 * truth has exactly one construction site and can never drift from the wire.
 */
export const buildSentPayload = (profile: Pick<StreamProfile, 'title' | 'category' | 'tags'>): SentChannelPayload => {
  const processedTitle = processTitle(profile.title);

  return {
    title: processedTitle.processed,
    tags: profile.tags.slice(0, 10), // Ensure max 10 tags
    gameId: isManualCategory(profile.category) ? null : profile.category.id,
    categoryName: profile.category.name
  };
};

/**
 * Twitch API Client for stream management operations
 */
export class TwitchAPIClient {
  private static instance: TwitchAPIClient | null = null;
  private auth = getTwitchAuth();
  private categoryRepo = getCategoryRepository();

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): TwitchAPIClient {
    if (!TwitchAPIClient.instance) {
      TwitchAPIClient.instance = new TwitchAPIClient();
    }
    return TwitchAPIClient.instance;
  }

  /**
   * Apply a stream profile to update channel information
   *
   * Builds the wire payload in one place and PATCHes it. The replay surface
   * (Apply-again / Revert) calls applySentPayload directly with the stored
   * payload, so a replay can never drift from a re-derived body.
   */
  async applyProfile(profile: StreamProfile): Promise<APIResult<SentChannelPayload>> {
    return this.patchChannel(buildSentPayload(profile), profile.name);
  }

  /**
   * Re-apply a recorded wire-truth payload exactly as stored — never
   * re-derived from the profile's current state, which may have been edited
   * or deleted since the record was written.
   */
  async applySentPayload(payload: SentChannelPayload, profileName: string): Promise<APIResult<SentChannelPayload>> {
    return this.patchChannel(payload, profileName);
  }

  /**
   * The single place a channel PATCH body is built and sent. game_id is
   * omitted when the payload's gameId is null (manual category) so it never
   * reaches Twitch on any path — live apply or replay.
   */
  private async patchChannel(payload: SentChannelPayload, profileName: string): Promise<APIResult<SentChannelPayload>> {
    try {
      // Get authenticated user and token
      const [user, token] = await Promise.all([
        this.auth.getCurrentUser(),
        this.auth.getValidToken()
      ]);

      if (!user || !token) {
        return {
          success: false,
          error: {
            code: 'AUTH_REQUIRED',
            message: 'Authentication required to update stream information'
          }
        };
      }

      const updateRequest: UpdateChannelRequest = {
        title: payload.title,
        tags: payload.tags
      };

      if (payload.gameId !== null) {
        updateRequest.game_id = payload.gameId;
      }

      this.log('Applying profile to Twitch', { 
        profileName,
        userId: user.id,
        updateRequest 
      });

      // Make API request to update channel
      const response = await fetch(
        `${TWITCH_ENDPOINTS.API_BASE}${TWITCH_ENDPOINTS.CHANNELS}?broadcaster_id=${user.id}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token.access_token}`,
            'Client-Id': TWITCH_CONFIG.CLIENT_ID,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updateRequest),
          signal: AbortSignal.timeout(API_CONFIG.TIMEOUT)
        }
      );

      const rateLimit = this.extractRateLimit(response);

      if (!response.ok) {
        const errorData = await this.handleAPIError(response);
        return {
          success: false,
          error: {
            code: errorData.error || 'API_ERROR',
            message: errorData.message || `Failed to update stream: ${response.status}`,
            details: errorData
          },
          rateLimit
        };
      }

      this.log('Stream updated successfully', { profileName });

      return {
        success: true,
        data: payload,
        rateLimit
      };

    } catch (error) {
      this.logError('Error applying profile', error);
      
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: {
            code: 'TIMEOUT',
            message: 'Request timed out. Please check your connection and try again.'
          }
        };
      }

      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update stream information'
        }
      };
    }
  }

  /**
   * Search for Twitch categories/games
   */
  async searchCategories(query: string, limit: number = 20): Promise<APIResult<TwitchGameResponse[]>> {
    try {
      // First check cached categories for offline results
      const cachedResults = await this.searchCachedCategories(query, limit);
      
      const token = await this.auth.getValidToken();
      if (!token) {
        // Return cached results if no authentication
        return {
          success: true,
          data: cachedResults.map(cat => ({
            id: cat.id,
            name: cat.name,
            box_art_url: cat.boxArtUrl || '',
            igdb_id: ''
          }))
        };
      }

      // Search live API
      const encodedQuery = encodeURIComponent(query.trim());
      const url = `${TWITCH_ENDPOINTS.API_BASE}${TWITCH_ENDPOINTS.GAMES}?name=${encodedQuery}`;

      this.log('Searching categories', { query, limit });

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token.access_token}`,
          'Client-Id': TWITCH_CONFIG.CLIENT_ID
        },
        signal: AbortSignal.timeout(API_CONFIG.TIMEOUT)
      });

      const rateLimit = this.extractRateLimit(response);

      if (!response.ok) {
        const errorData = await this.handleAPIError(response);
        
        // Fallback to cached results on API error
        if (cachedResults.length > 0) {
          this.log('API search failed, returning cached results', { query, count: cachedResults.length });
          return {
            success: true,
            data: cachedResults.map(cat => ({
              id: cat.id,
              name: cat.name,
              box_art_url: cat.boxArtUrl || '',
              igdb_id: ''
            }))
          };
        }

        return {
          success: false,
          error: {
            code: errorData.error || 'SEARCH_ERROR',
            message: errorData.message || 'Failed to search categories'
          },
          rateLimit
        };
      }

      const searchData: TwitchGamesSearchResponse = await response.json();
      const results = searchData.data || [];

      // Cache successful results
      await this.cacheSearchResults(results);

      this.log('Category search completed', { query, resultCount: results.length });

      return {
        success: true,
        data: results.slice(0, limit),
        rateLimit
      };

    } catch (error) {
      this.logError('Error searching categories', error);
      
      // Try to return cached results on error
      const cachedResults = await this.searchCachedCategories(query, limit);
      if (cachedResults.length > 0) {
        return {
          success: true,
          data: cachedResults.map(cat => ({
            id: cat.id,
            name: cat.name,
            box_art_url: cat.boxArtUrl || '',
            igdb_id: ''
          }))
        };
      }

      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Failed to search categories'
        }
      };
    }
  }

  /**
   * Get current channel information
   */
  async getCurrentChannelInfo(): Promise<APIResult<TwitchChannelResponse>> {
    try {
      const [user, token] = await Promise.all([
        this.auth.getCurrentUser(),
        this.auth.getValidToken()
      ]);

      if (!user || !token) {
        return {
          success: false,
          error: {
            code: 'AUTH_REQUIRED',
            message: 'Authentication required to get channel information'
          }
        };
      }

      const url = `${TWITCH_ENDPOINTS.API_BASE}${TWITCH_ENDPOINTS.CHANNELS}?broadcaster_id=${user.id}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token.access_token}`,
          'Client-Id': TWITCH_CONFIG.CLIENT_ID
        },
        signal: AbortSignal.timeout(API_CONFIG.TIMEOUT)
      });

      const rateLimit = this.extractRateLimit(response);

      if (!response.ok) {
        const errorData = await this.handleAPIError(response);
        return {
          success: false,
          error: {
            code: errorData.error || 'API_ERROR',
            message: errorData.message || 'Failed to get channel information'
          },
          rateLimit
        };
      }

      const channelData: TwitchChannelInfoResponse = await response.json();
      
      if (!channelData.data || channelData.data.length === 0) {
        return {
          success: false,
          error: {
            code: 'NO_DATA',
            message: 'No channel information found'
          }
        };
      }

      return {
        success: true,
        data: channelData.data[0],
        rateLimit
      };

    } catch (error) {
      this.logError('Error getting channel info', error);
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get channel information'
        }
      };
    }
  }

  /**
   * Check Twitch API health and availability
   * Note: Requires user authentication with implicit flow
   */
  async checkAPIHealth(): Promise<TwitchAPIHealthCheck> {
    const startTime = Date.now();

    try {
      // Get authenticated token for health check
      const token = await this.auth.getValidToken();

      if (!token) {
        // No authentication available - skip health check
        this.log('Health check skipped - no authentication');
        return {
          isAvailable: true, // Assume API is available, just not authenticated
          responseTime: 0,
          checkedAt: new Date()
        };
      }

      // Perform authenticated health check using games endpoint
      const response = await fetch(
        `${TWITCH_ENDPOINTS.API_BASE}${TWITCH_ENDPOINTS.GAMES}?name=Just%20Chatting`,
        {
          headers: {
            'Authorization': `Bearer ${token.access_token}`,
            'Client-Id': TWITCH_CONFIG.CLIENT_ID
          },
          signal: AbortSignal.timeout(5000) // 5 second timeout for health check
        }
      );

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        this.log('API health check passed', { responseTime });
        return {
          isAvailable: true,
          responseTime,
          checkedAt: new Date()
        };
      } else {
        const error = `API returned ${response.status}: ${response.statusText}`;
        this.logError('API health check failed', error);
        return {
          isAvailable: false,
          responseTime,
          error,
          checkedAt: new Date()
        };
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logError('API health check error', error);

      return {
        isAvailable: false,
        responseTime,
        error: errorMessage,
        checkedAt: new Date()
      };
    }
  }

  /**
   * Search cached categories for offline functionality
   */
  private async searchCachedCategories(query: string, limit: number): Promise<CachedCategory[]> {
    try {
      const result = await this.categoryRepo.searchCached(query, limit);
      return result.success && result.data ? result.data : [];
    } catch (error) {
      this.logError('Error searching cached categories', error);
      return [];
    }
  }

  /**
   * Cache search results for offline use
   */
  private async cacheSearchResults(results: TwitchGameResponse[]): Promise<void> {
    try {
      for (const game of results) {
        await this.categoryRepo.cache({
          id: game.id,
          name: game.name,
          boxArtUrl: game.box_art_url
        });
      }
    } catch (error) {
      this.logError('Error caching search results', error);
      // Don't throw - caching failure shouldn't break the search
    }
  }

  /**
   * Extract rate limit information from response headers
   */
  private extractRateLimit(response: Response): TwitchRateLimit | undefined {
    const limit = response.headers.get('ratelimit-limit');
    const remaining = response.headers.get('ratelimit-remaining');
    const reset = response.headers.get('ratelimit-reset');

    if (limit && remaining && reset) {
      return {
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        reset: parseInt(reset, 10)
      };
    }

    return undefined;
  }

  /**
   * Handle API error responses
   */
  private async handleAPIError(response: Response): Promise<TwitchAPIError> {
    try {
      const errorData = await response.json() as TwitchAPIError;
      return {
        error: errorData.error || 'unknown_error',
        status: response.status,
        message: errorData.message || response.statusText
      };
    } catch {
      return {
        error: 'parse_error',
        status: response.status,
        message: `HTTP ${response.status}: ${response.statusText}`
      };
    }
  }

  /**
   * Log messages (respects debug settings)
   */
  private log(message: string, data?: any): void {
    if (FEATURE_FLAGS.DEBUG_LOGGING) {
      console.log(`[TwitchAPI] ${message}`, data || '');
    }
  }

  /**
   * Log errors
   */
  private logError(message: string, error: any): void {
    console.error(`[TwitchAPI] ${message}:`, error);
  }
}

/**
 * Convenience functions for API operations
 */

/**
 * Get the TwitchAPIClient singleton instance
 */
export const getTwitchAPI = (): TwitchAPIClient => TwitchAPIClient.getInstance();

/**
 * Apply a stream profile
 */
export const applyStreamProfile = (profile: StreamProfile): Promise<APIResult<SentChannelPayload>> => 
  getTwitchAPI().applyProfile(profile);

/**
 * Search for categories
 */
export const searchStreamCategories = (query: string, limit?: number): Promise<APIResult<TwitchGameResponse[]>> => 
  getTwitchAPI().searchCategories(query, limit);

/**
 * Get current channel information
 */
export const getCurrentChannel = (): Promise<APIResult<TwitchChannelResponse>> => 
  getTwitchAPI().getCurrentChannelInfo();

/**
 * Check API health
 */
export const checkTwitchAPIHealth = (): Promise<TwitchAPIHealthCheck> => 
  getTwitchAPI().checkAPIHealth();

/**
 * Utility function to check if error is rate limit related
 */
export const isRateLimitError = (error: any): boolean => {
  return error?.code === 'rate_limit_exceeded' || 
         error?.status === 429;
};

/**
 * Utility function to check if error requires re-authentication
 */
export const isAuthError = (error: any): boolean => {
  return error?.code === 'AUTH_REQUIRED' || 
         error?.status === 401 || 
         error?.status === 403;
};

/**
 * Utility function to check if error is network related
 */
export const isNetworkError = (error: any): boolean => {
  return error?.code === 'NETWORK_ERROR' || 
         error?.code === 'TIMEOUT';
};