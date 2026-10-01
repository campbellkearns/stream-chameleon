/**
 * Stream Control
 *
 * Shared state for everything that drives the stream: the preset list, which
 * preset was last applied, and applying presets to Twitch. Mounted once in
 * Layout so the Presets tab, Quick Morph chips, and profile forms all see the
 * same list.
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { StreamProfile } from '@/types/Profile';
import { useProfiles } from '@/hooks/useProfiles';
import { useAPIHealth } from '@/hooks/useAPIHealth';
import { useToast } from '@/components/Toast';
import { getTwitchAPI, isAuthError, isNetworkError } from '@/lib/api/twitchAPI';
import { processTitle } from '@/types/ProfileUtils';

const ACTIVE_PROFILE_STORAGE_KEY = 'stream-chameleon:active-profile-id';

function readStoredActiveProfileId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredActiveProfileId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY);
    }
  } catch {
    // Storage unavailable (private mode, blocked site data); active state stays in memory
  }
}

type StreamControlValue = ReturnType<typeof useProfiles> & {
  activeProfileId: string | null;
  applyingProfileId: string | null;
  applyProfile: (profile: StreamProfile) => Promise<boolean>;
  canApply: boolean;
  apiStatusMessage: string;
};

const StreamControlContext = createContext<StreamControlValue | null>(null);

export function StreamControlProvider({ children }: { children: ReactNode }) {
  const profiles = useProfiles();
  const { shouldDisableActions, getStatusMessage } = useAPIHealth();
  const { showToast } = useToast();

  const [activeProfileId, setActiveProfileId] = useState<string | null>(readStoredActiveProfileId);
  const [applyingProfileId, setApplyingProfileId] = useState<string | null>(null);

  const applyProfile = useCallback(async (profile: StreamProfile): Promise<boolean> => {
    setApplyingProfileId(profile.id);
    try {
      const result = await getTwitchAPI().applyProfile(profile);

      if (result.success) {
        setActiveProfileId(profile.id);
        writeStoredActiveProfileId(profile.id);
        showToast(
          `Applied "${profile.name}"`,
          `${processTitle(profile.title).processed} · ${profile.category.name}`,
          'success'
        );
        return true;
      }

      const message = isAuthError(result.error)
        ? 'Sign in with Twitch to apply presets to your stream.'
        : isNetworkError(result.error)
          ? 'Network error. Check your connection and try again.'
          : result.error?.message || 'Twitch rejected the update.';
      showToast(`Couldn't apply "${profile.name}"`, message, 'error');
      return false;
    } catch (error) {
      showToast(
        `Couldn't apply "${profile.name}"`,
        error instanceof Error ? error.message : 'An unexpected error occurred.',
        'error'
      );
      return false;
    } finally {
      setApplyingProfileId(null);
    }
  }, [showToast]);

  const deleteProfile = useCallback(async (id: string): Promise<boolean> => {
    const success = await profiles.deleteProfile(id);
    if (success && id === activeProfileId) {
      setActiveProfileId(null);
      writeStoredActiveProfileId(null);
    }
    return success;
  }, [profiles.deleteProfile, activeProfileId]);

  const value: StreamControlValue = {
    ...profiles,
    deleteProfile,
    activeProfileId,
    applyingProfileId,
    applyProfile,
    canApply: !shouldDisableActions(),
    apiStatusMessage: getStatusMessage(),
  };

  return <StreamControlContext.Provider value={value}>{children}</StreamControlContext.Provider>;
}

export function useStreamControl(): StreamControlValue {
  const context = useContext(StreamControlContext);
  if (!context) {
    throw new Error('useStreamControl must be used within a StreamControlProvider');
  }
  return context;
}
