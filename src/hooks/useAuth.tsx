/**
 * React Hook for Twitch Authentication
 * 
 * Provides authentication state management and actions for React components
 */

import React, { useState, useEffect, useCallback } from 'react';
import { TwitchUserResponse } from '@/types/TwitchAPI';
import { 
  getTwitchAuth, 
  isAuthenticated, 
  startAuthFlow, 
  getCurrentUser, 
  signOut, 
  validateToken 
} from '@/lib/auth/twitchAuth';

export interface AuthState {
  /** Whether user is authenticated */
  isAuthenticated: boolean;
  /** Current user information */
  user: TwitchUserResponse | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: string | null;
  /** Whether auth check has been completed */
  isInitialized: boolean;
}

export interface AuthActions {
  /** Start OAuth flow */
  signIn: () => Promise<void>;
  /** Sign out user */
  signOut: () => Promise<void>;
  /** Refresh authentication state */
  refresh: () => Promise<void>;
  /** Clear error state */
  clearError: () => void;
}

/**
 * Hook for managing Twitch authentication state
 */
export function useAuth(): AuthState & AuthActions {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    isLoading: true,
    error: null,
    isInitialized: false,
  });

  /**
   * Update state helper
   */
  const updateState = useCallback((updates: Partial<AuthState>) => {
    setState(current => ({ ...current, ...updates }));
  }, []);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    updateState({ error: null });
  }, [updateState]);

  /**
   * Check authentication status
   */
  const checkAuth = useCallback(async (): Promise<void> => {
    try {
      updateState({ isLoading: true, error: null });

      const authenticated = await isAuthenticated();
      
      if (authenticated) {
        const user = await getCurrentUser();
        updateState({
          isAuthenticated: true,
          user,
          isLoading: false,
          isInitialized: true,
        });
      } else {
        updateState({
          isAuthenticated: false,
          user: null,
          isLoading: false,
          isInitialized: true,
        });
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      updateState({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        error: 'Failed to check authentication status',
        isInitialized: true,
      });
    }
  }, [updateState]);

  /**
   * Start OAuth sign-in flow
   */
  const handleSignIn = useCallback(async (): Promise<void> => {
    try {
      updateState({ isLoading: true, error: null });
      await startAuthFlow();
      // Note: User will be redirected, so component will unmount
    } catch (error) {
      console.error('Error starting auth flow:', error);
      updateState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to start authentication',
      });
    }
  }, [updateState]);

  /**
   * Sign out user
   */
  const handleSignOut = useCallback(async (): Promise<void> => {
    try {
      updateState({ isLoading: true, error: null });
      await signOut();
      updateState({
        isAuthenticated: false,
        user: null,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error signing out:', error);
      updateState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to sign out',
      });
    }
  }, [updateState]);

  /**
   * Refresh authentication state
   */
  const refresh = useCallback(async (): Promise<void> => {
    await checkAuth();
  }, [checkAuth]);

  /**
   * Handle URL callback for OAuth flow
   */
  const handleCallback = useCallback(async (url: string): Promise<boolean> => {
    try {
      updateState({ isLoading: true, error: null });
      
      const auth = getTwitchAuth();
      const success = await auth.handleAuthCallback(url);
      
      if (success) {
        // Refresh auth state after successful callback
        await checkAuth();
        return true;
      } else {
        updateState({
          isLoading: false,
          error: 'Authentication failed',
        });
        return false;
      }
    } catch (error) {
      console.error('Error handling auth callback:', error);
      updateState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Authentication callback failed',
      });
      return false;
    }
  }, [updateState, checkAuth]);

  /**
   * Initialize authentication state on mount
   */
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  /**
   * Handle auth callback if we're on the callback route
   * Note: Implicit flow returns tokens in URL hash (access_token=), not query params (code=)
   */
  useEffect(() => {
    const currentUrl = window.location.href;
    const isCallbackUrl = currentUrl.includes('/auth/callback') || currentUrl.includes('access_token=');

    if (isCallbackUrl && !state.isInitialized) {
      handleCallback(currentUrl);
    }
  }, [state.isInitialized, handleCallback]);

  return {
    // State
    isAuthenticated: state.isAuthenticated,
    user: state.user,
    isLoading: state.isLoading,
    error: state.error,
    isInitialized: state.isInitialized,
    
    // Actions
    signIn: handleSignIn,
    signOut: handleSignOut,
    refresh,
    clearError,
  };
}

/**
 * Hook for getting authentication state without actions (lightweight)
 */
export function useAuthState(): Pick<AuthState, 'isAuthenticated' | 'user' | 'isLoading' | 'isInitialized'> {
  const [state, setState] = useState({
    isAuthenticated: false,
    user: null as TwitchUserResponse | null,
    isLoading: true,
    isInitialized: false,
  });

  useEffect(() => {
    const checkAuthState = async () => {
      try {
        const authenticated = await isAuthenticated();
        const user = authenticated ? await getCurrentUser() : null;
        
        setState({
          isAuthenticated: authenticated,
          user,
          isLoading: false,
          isInitialized: true,
        });
      } catch (error) {
        console.error('Error checking auth state:', error);
        setState({
          isAuthenticated: false,
          user: null,
          isLoading: false,
          isInitialized: true,
        });
      }
    };

    checkAuthState();
  }, []);

  return state;
}

/**
 * Higher-order component for protecting routes
 */
export function withAuth<T extends object>(
  Component: React.ComponentType<T>
): React.ComponentType<T> {
  return function AuthenticatedComponent(props: T) {
    const { isAuthenticated, isLoading, isInitialized } = useAuthState();

    // Show loading while checking auth
    if (!isInitialized || isLoading) {
      return (
        <div className="flex items-center justify-center min-h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
            <p className="text-fg-muted">Checking authentication...</p>
          </div>
        </div>
      );
    }

    // Redirect to auth if not authenticated
    if (!isAuthenticated) {
      return (
        <div className="text-center py-20">
          <h2 className="text-2xl font-medium text-fg-strong mb-4">
            Authentication Required
          </h2>
          <p className="text-fg-muted mb-8">
            Please connect your Twitch account to access this feature.
          </p>
          <button 
            onClick={() => window.location.href = '/auth'}
            className="btn"
          >
            Connect Twitch Account
          </button>
        </div>
      );
    }

    return <Component {...props} />;
  };
}
