/**
 * API Health Monitoring Hook
 * 
 * Monitors Twitch API health and provides system status information.
 * Implements Epic 4 requirements for error handling and system status.
 */

import { useState, useEffect, useCallback } from 'react';
import { getTwitchAPI } from '@/lib/api/twitchAPI';
import type { TwitchAPIHealthCheck } from '@/types/TwitchAPI';

/**
 * API health status interface
 */
export interface APIHealthStatus {
  isAvailable: boolean;
  isChecking: boolean;
  lastCheck: Date | null;
  responseTime: number | null;
  error: string | null;
}

/**
 * Hook for monitoring Twitch API health
 */
export const useAPIHealth = () => {
  const [healthStatus, setHealthStatus] = useState<APIHealthStatus>({
    isAvailable: true, // Start optimistic
    isChecking: true,
    lastCheck: null,
    responseTime: null,
    error: null
  });

  const twitchAPI = getTwitchAPI();

  /**
   * Perform health check
   */
  const checkHealth = useCallback(async () => {
    setHealthStatus(prev => ({ ...prev, isChecking: true }));

    try {
      const result: TwitchAPIHealthCheck = await twitchAPI.checkAPIHealth();
      
      setHealthStatus({
        isAvailable: result.isAvailable,
        isChecking: false,
        lastCheck: result.checkedAt,
        responseTime: result.responseTime || null,
        error: result.error || null
      });

      return result.isAvailable;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Health check failed';
      
      setHealthStatus({
        isAvailable: false,
        isChecking: false,
        lastCheck: new Date(),
        responseTime: null,
        error: errorMessage
      });

      return false;
    }
  }, [twitchAPI]);

  /**
   * Get user-friendly status message
   */
  const getStatusMessage = useCallback((): string => {
    if (healthStatus.isChecking) {
      return 'Checking Twitch API status...';
    }
    
    if (healthStatus.isAvailable) {
      const responseTime = healthStatus.responseTime;
      if (responseTime && responseTime < 1000) {
        return `Connected to Twitch (${responseTime}ms)`;
      } else if (responseTime) {
        return `Connected to Twitch (slow: ${responseTime}ms)`;
      } else {
        return 'Connected to Twitch';
      }
    }
    
    return healthStatus.error || 'Unable to connect to Twitch services';
  }, [healthStatus]);

  /**
   * Get health indicator color
   */
  const getStatusColor = useCallback((): string => {
    if (healthStatus.isChecking) {
      return 'text-amber-400';
    }
    
    if (healthStatus.isAvailable) {
      const responseTime = healthStatus.responseTime;
      if (responseTime && responseTime > 2000) {
        return 'text-amber-400'; // Slow but working
      }
      return 'text-emerald-400'; // Good
    }
    
    return 'text-red-400'; // Offline/error
  }, [healthStatus]);

  /**
   * Get health indicator icon
   */
  const getStatusIcon = useCallback((): string => {
    if (healthStatus.isChecking) {
      return '🔄';
    }
    
    if (healthStatus.isAvailable) {
      const responseTime = healthStatus.responseTime;
      if (responseTime && responseTime > 2000) {
        return '🟡'; // Slow
      }
      return '🟢'; // Good
    }
    
    return '🔴'; // Offline
  }, [healthStatus]);

  /**
   * Check if profile actions should be disabled
   */
  const shouldDisableActions = useCallback((): boolean => {
    return !healthStatus.isAvailable && !healthStatus.isChecking;
  }, [healthStatus]);

  // Perform initial health check on mount
  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  // Periodic health checks every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      checkHealth();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [checkHealth]);

  return {
    // Status data
    ...healthStatus,
    
    // Actions
    checkHealth,
    
    // Helpers
    getStatusMessage,
    getStatusColor,
    getStatusIcon,
    shouldDisableActions,
    
    // Computed values
    isHealthy: healthStatus.isAvailable,
    canUseAPI: healthStatus.isAvailable
  };
};

/**
 * Helper component props for displaying API status
 */
export interface APIStatusDisplayProps {
  showDetails?: boolean;
  className?: string;
}

/**
 * Get Twitch status page URL for user reference
 */
export const getTwitchStatusURL = (): string => {
  return 'https://status.twitch.tv/';
};

/**
 * Get user-friendly error message with suggestions
 */
export const getErrorMessageWithSuggestion = (error: string | null): string => {
  if (!error) return '';
  
  const baseMessage = error;
  const suggestion = 'Check your internet connection or visit https://status.twitch.tv/ for Twitch service status.';
  
  return `${baseMessage} ${suggestion}`;
};