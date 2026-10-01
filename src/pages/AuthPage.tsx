import { useAuth } from '@/hooks/useAuth';
import { TWITCH_CONFIG } from '@/types/constants';

export default function AuthPage(): JSX.Element {
  const { signIn, isLoading, error, isAuthenticated, user, clearError } = useAuth();

  // Redirect if already authenticated
  if (isAuthenticated && user) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-4xl font-medium text-fg-strong mb-3">
            Already Connected!
          </h1>
          <p className="text-lg text-fg-muted">
            Your Twitch account is connected and ready to use
          </p>
        </div>

        <div className="max-w-2xl">
          <div className="card text-center">
            <div className="text-6xl mb-6">✅</div>
            
            <h2 className="text-2xl font-medium text-fg-strong mb-4">
              Connected as {user.display_name}
            </h2>
            
            <div className="flex items-center justify-center mb-6">
              <img 
                src={user.profile_image_url} 
                alt={user.display_name}
                className="w-16 h-16 rounded-full mr-4"
              />
              <div className="text-left">
                <p className="font-medium text-fg-strong">@{user.login}</p>
                <p className="text-sm text-fg-muted">{user.view_count.toLocaleString()} views</p>
              </div>
            </div>
            
            <p className="text-fg-muted mb-8">
              You can now apply stream profiles to update your channel information instantly.
            </p>
            
            <div className="flex gap-4 justify-center">
              <a 
                href="/"
                className="btn"
              >
                Go to Presets
              </a>
              <button 
                onClick={() => window.location.href = '/profile/new'}
                className="btn bg-raised text-fg-strong hover:bg-raised-hover"
              >
                Create Profile
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleConnect = async () => {
    clearError();
    await signIn();
  };

  // Check if Client ID is configured
  if (!TWITCH_CONFIG.CLIENT_ID) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-4xl font-medium text-fg-strong mb-3">
            Configuration Error
          </h1>
          <p className="text-lg text-fg-muted">
            Twitch integration is not properly configured
          </p>
        </div>

        <div className="max-w-2xl">
          <div className="card text-center">
            <div className="text-6xl mb-6">⚠️</div>
            
            <h2 className="text-2xl font-medium text-fg-strong mb-4">
              Missing Configuration
            </h2>
            
            <p className="text-fg-muted mb-8">
              The Twitch Client ID is not configured. Please check your environment variables and ensure 
              <code className="bg-raised px-2 py-1 rounded text-sm mx-1">VITE_TWITCH_CLIENT_ID</code> 
              is set in your <code className="bg-raised px-2 py-1 rounded text-sm mx-1">.env.local</code> file.
            </p>
            
            <div className="bg-bg p-4 rounded-lg text-left mb-6">
              <p className="text-sm text-fg mb-2 font-medium">To fix this:</p>
              <ol className="text-sm text-fg-muted space-y-1 list-decimal list-inside">
                <li>Create a Twitch application at <a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noopener noreferrer" className="text-accent-fg hover:underline">dev.twitch.tv</a></li>
                <li>Copy the Client ID from your application</li>
                <li>Add it to your <code className="bg-raised-hover px-1 rounded">.env.local</code> file</li>
                <li>Restart the development server</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-medium text-fg-strong mb-3">
          Connect to Twitch
        </h1>
        <p className="text-lg text-fg-muted">
          Connect your Twitch account to update stream information
        </p>
      </div>

      <div className="max-w-2xl">
        <div className="card text-center">
          <div className="text-6xl mb-6">🔗</div>
          
          <h2 className="text-2xl font-medium text-fg-strong mb-4">
            Ready to Connect?
          </h2>
          
          <p className="text-fg-muted mb-8">
            To apply profiles to your streams, we need permission to update your channel information. 
            This is secure and you can revoke access anytime in your Twitch settings.
          </p>
          
          <div className="space-y-4 mb-8">
            <div className="flex items-center space-x-3 text-sm text-fg-muted">
              <span className="text-emerald-400">✓</span>
              <span>Update stream category and title</span>
            </div>
            <div className="flex items-center space-x-3 text-sm text-fg-muted">
              <span className="text-emerald-400">✓</span>
              <span>Manage stream tags</span>
            </div>
            <div className="flex items-center space-x-3 text-sm text-fg-muted">
              <span className="text-emerald-400">✓</span>
              <span>No access to personal data</span>
            </div>
          </div>
          
          {error && (
            <div className="bg-surface border border-red-800 rounded-lg p-4 mb-6">
              <p className="text-red-400 text-sm">
                <strong>Error:</strong> {error}
              </p>
              <button 
                onClick={clearError}
                className="text-red-400 hover:text-red-300 text-sm underline mt-2"
              >
                Dismiss
              </button>
            </div>
          )}
          
          <button 
            onClick={handleConnect}
            disabled={isLoading}
            className="btn text-lg px-8 py-4 flex items-center space-x-3 mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current"></div>
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <span>🎮</span>
                <span>Connect Twitch Account</span>
              </>
            )}
          </button>
          
          <p className="text-xs text-fg-muted mt-6">
            By connecting, you agree to let this app manage your channel information
          </p>
        </div>
      </div>
    </div>
  );
}