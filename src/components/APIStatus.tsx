/**
 * API Status Component
 * 
 * Displays Twitch API connection status with user-friendly messaging.
 * Part of Epic 4 implementation for system status monitoring.
 */

import React from 'react';
import { useAPIHealth, getTwitchStatusURL, getErrorMessageWithSuggestion } from '@/hooks/useAPIHealth';

interface APIStatusProps {
  /** Show detailed status information */
  showDetails?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Show as compact indicator or full status */
  compact?: boolean;
}

/**
 * API Status Display Component
 */
export const APIStatus: React.FC<APIStatusProps> = ({ 
  showDetails = false, 
  className = '',
  compact = false 
}) => {
  const {
    isAvailable,
    isChecking,
    responseTime,
    error,
    lastCheck,
    getStatusMessage,
    getStatusColor,
    getStatusIcon,
    checkHealth
  } = useAPIHealth();

  // Compact version for header/nav
  if (compact) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <span className="text-sm">{getStatusIcon()}</span>
        <span className={`text-xs ${getStatusColor()}`}>
          {isChecking ? 'Checking...' : (isAvailable ? 'Connected' : 'Offline')}
        </span>
      </div>
    );
  }

  // Full status display
  return (
    <div className={`card ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <span className="text-2xl">{getStatusIcon()}</span>
          <div>
            <h3 className="text-lg font-medium text-fg-strong">
              Twitch API Status
            </h3>
            <p className={`text-sm ${getStatusColor()}`}>
              {getStatusMessage()}
            </p>
          </div>
        </div>
        
        <button 
          onClick={checkHealth}
          disabled={isChecking}
          className="btn-secondary text-sm px-4 py-2"
        >
          {isChecking ? 'Checking...' : 'Refresh'}
        </button>
      </div>

      {showDetails && (
        <div className="space-y-2 text-sm text-fg-muted">
          {lastCheck && (
            <div>
              <span className="font-medium">Last checked:</span>{' '}
              {lastCheck.toLocaleTimeString()}
            </div>
          )}
          
          {responseTime && (
            <div>
              <span className="font-medium">Response time:</span>{' '}
              {responseTime}ms
            </div>
          )}
          
          {error && (
            <div className="text-red-400 bg-surface p-3 rounded-lg">
              <p className="font-medium mb-1">Connection Error</p>
              <p className="text-sm">
                {getErrorMessageWithSuggestion(error)}
              </p>
              <a 
                href={getTwitchStatusURL()}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 hover:text-sky-300 underline text-sm mt-2 inline-block"
              >
                Check Twitch Status →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Simple status indicator for inline use
 */
export const APIStatusIndicator: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { getStatusIcon, isAvailable, isChecking } = useAPIHealth();
  
  return (
    <span 
      className={`inline-flex items-center ${className}`}
      title={isChecking ? 'Checking API status...' : (isAvailable ? 'API Connected' : 'API Offline')}
    >
      {getStatusIcon()}
    </span>
  );
};

export default APIStatus;