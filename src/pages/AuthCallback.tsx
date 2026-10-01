/**
 * Auth Callback Component
 *
 * Handles the OAuth callback from Twitch using implicit grant flow (access token in URL hash)
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export default function AuthCallback(): JSX.Element {
  const navigate = useNavigate();
  const { isAuthenticated, error } = useAuth();
  const [isProcessing, setIsProcessing] = useState(true);
  const [callbackError, setCallbackError] = useState<string | null>(null);

  useEffect(() => {
    const processCallback = async () => {
      try {
        // In implicit flow, tokens are in the URL hash, not query params
        const hashParams = new URLSearchParams(window.location.hash.substring(1));

        // Check for error parameter
        const errorParam = hashParams.get('error');
        if (errorParam) {
          const errorDescription = hashParams.get('error_description');
          setCallbackError(`Authentication failed: ${errorParam}${errorDescription ? ' - ' + errorDescription : ''}`);
          setIsProcessing(false);
          return;
        }

        // Check for access token (implicit flow)
        const accessToken = hashParams.get('access_token');
        if (!accessToken) {
          setCallbackError('No access token received from Twitch');
          setIsProcessing(false);
          return;
        }

        // The useAuth hook will automatically process the callback
        // Just wait for the authentication state to update

        // Wait a moment for auth processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        setIsProcessing(false);
      } catch (err) {
        console.error('Error processing callback:', err);
        setCallbackError(err instanceof Error ? err.message : 'Unknown error occurred');
        setIsProcessing(false);
      }
    };

    processCallback();
  }, []);

  // Redirect to dashboard if authentication successful
  useEffect(() => {
    if (!isProcessing && isAuthenticated) {
      // Clear URL parameters and redirect
      window.history.replaceState({}, document.title, '/');
      navigate('/', { replace: true });
    }
  }, [isProcessing, isAuthenticated, navigate]);

  // Show error state
  if (callbackError || (!isProcessing && error)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="max-w-md w-full mx-4">
          <div className="card text-center">
            <div className="text-6xl mb-6">❌</div>
            
            <h1 className="text-2xl font-medium text-fg-strong mb-4">
              Authentication Failed
            </h1>
            
            <p className="text-fg-muted mb-8">
              {callbackError || error}
            </p>
            
            <div className="space-y-3">
              <button 
                onClick={() => navigate('/auth', { replace: true })}
                className="btn w-full"
              >
                Try Again
              </button>
              
              <button 
                onClick={() => navigate('/', { replace: true })}
                className="btn bg-raised text-fg-strong hover:bg-raised-hover w-full"
              >
                Go to Presets
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state while processing
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="max-w-md w-full mx-4">
        <div className="card text-center">
          <div className="text-6xl mb-6">🔄</div>
          
          <h1 className="text-2xl font-medium text-fg-strong mb-4">
            Completing Authentication
          </h1>
          
          <p className="text-fg-muted mb-8">
            Please wait while we complete your Twitch connection...
          </p>
          
          <div className="flex items-center justify-center space-x-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
            <span className="text-fg-muted">Processing...</span>
          </div>
          
          <p className="text-xs text-fg-muted mt-6">
            This should only take a few seconds
          </p>
        </div>
      </div>
    </div>
  );
}
