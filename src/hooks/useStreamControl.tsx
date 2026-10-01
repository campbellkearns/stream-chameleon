/**
 * Stream Control
 *
 * Shared state for everything that drives the stream: the preset list, which
 * preset was last applied, the channel's current Twitch info, and pushing
 * presets or ad-hoc edits to Twitch. Mounted once in Layout so the Live and
 * Presets tabs, Quick Morph chips, and profile forms all see the same state.
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { StreamCategory, StreamProfile } from '@/types/Profile';
import type { TwitchChannelResponse } from '@/types/TwitchAPI';
import { useProfiles } from '@/hooks/useProfiles';
import { useAPIHealth } from '@/hooks/useAPIHealth';
import { useAuthState } from '@/hooks/useAuth';
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

export interface ChannelUpdate {
  title: string;
  category: StreamCategory;
  tags: string[];
}

type ChannelStatus = 'idle' | 'loading' | 'ready' | 'error';

type StreamControlValue = ReturnType<typeof useProfiles> & {
  activeProfileId: string | null;
  applyingProfileId: string | null;
  applyProfile: (profile: StreamProfile) => Promise<boolean>;
  channel: TwitchChannelResponse | null;
  channelStatus: ChannelStatus;
  channelError: string | null;
  refreshChannel: () => Promise<void>;
  isPushing: boolean;
  pushChannel: (update: ChannelUpdate) => Promise<boolean>;
  canApply: boolean;
  apiStatusMessage: string;
};

const StreamControlContext = createContext<StreamControlValue | null>(null);

function describeUpdateError(error: unknown): string {
  if (isAuthError(error)) return 'Sign in with Twitch to update your stream.';
  if (isNetworkError(error)) return 'Network error. Check your connection and try again.';
  return (error as { message?: string } | undefined)?.message || 'Twitch rejected the update.';
}

export function StreamControlProvider({ children }: { children: ReactNode }) {
  const profiles = useProfiles();
  const { shouldDisableActions, getStatusMessage } = useAPIHealth();
  const { isAuthenticated } = useAuthState();
  const { showToast } = useToast();

  const [activeProfileId, setActiveProfileId] = useState<string | null>(readStoredActiveProfileId);
  const [applyingProfileId, setApplyingProfileId] = useState<string | null>(null);

  const [channel, setChannel] = useState<TwitchChannelResponse | null>(null);
  const [channelStatus, setChannelStatus] = useState<ChannelStatus>('idle');
  const [channelError, setChannelError] = useState<string | null>(null);
  const [isPushing, setIsPushing] = useState(false);

  const refreshChannel = useCallback(async () => {
    setChannelStatus('loading');
    const result = await getTwitchAPI().getCurrentChannelInfo();
    if (result.success && result.data) {
      setChannel(result.data);
      setChannelError(null);
      setChannelStatus('ready');
    } else {
      // Keep the last known channel so the Live tab doesn't blank on a flaky request
      setChannelError(result.error?.message || 'Could not load channel info.');
      setChannelStatus('error');
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      refreshChannel();
    } else {
      setChannel(null);
      setChannelError(null);
      setChannelStatus('idle');
    }
  }, [isAuthenticated, refreshChannel]);

  const setActive = useCallback((id: string | null) => {
    setActiveProfileId(id);
    writeStoredActiveProfileId(id);
  }, []);

  const applyProfile = useCallback(async (profile: StreamProfile): Promise<boolean> => {
    setApplyingProfileId(profile.id);
    try {
      const result = await getTwitchAPI().applyProfile(profile);

      if (result.success) {
        setActive(profile.id);
        refreshChannel();
        showToast(
          `Applied "${profile.name}"`,
          `${processTitle(profile.title).processed} · ${profile.category.name}`,
          'success'
        );
        return true;
      }

      showToast(`Couldn't apply "${profile.name}"`, describeUpdateError(result.error), 'error');
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
  }, [showToast, setActive, refreshChannel]);

  const pushChannel = useCallback(async ({ title, category, tags }: ChannelUpdate): Promise<boolean> => {
    setIsPushing(true);
    try {
      const result = await getTwitchAPI().updateChannel({
        title: processTitle(title).processed,
        game_id: category.id,
        tags,
      });

      if (result.success) {
        // A manual edit means the stream no longer matches any preset
        setActive(null);
        refreshChannel();
        showToast('Stream updated', `${processTitle(title).processed} · ${category.name}`, 'success');
        return true;
      }

      showToast("Couldn't update stream", describeUpdateError(result.error), 'error');
      return false;
    } catch (error) {
      showToast(
        "Couldn't update stream",
        error instanceof Error ? error.message : 'An unexpected error occurred.',
        'error'
      );
      return false;
    } finally {
      setIsPushing(false);
    }
  }, [showToast, setActive, refreshChannel]);

  const deleteProfile = useCallback(async (id: string): Promise<boolean> => {
    const success = await profiles.deleteProfile(id);
    if (success && id === activeProfileId) {
      setActive(null);
    }
    return success;
  }, [profiles.deleteProfile, activeProfileId, setActive]);

  const value: StreamControlValue = {
    ...profiles,
    deleteProfile,
    activeProfileId,
    applyingProfileId,
    applyProfile,
    channel,
    channelStatus,
    channelError,
    refreshChannel,
    isPushing,
    pushChannel,
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
