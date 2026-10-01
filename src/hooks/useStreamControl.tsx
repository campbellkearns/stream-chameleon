/**
 * Stream Control
 *
 * Shared state for everything that drives the stream: the preset list, which
 * preset was last applied, the channel's current Twitch info, apply history,
 * and every path that changes the channel — preset applies, ad-hoc Live
 * edits, history replays, and WebMCP agent calls. Mounted once in Layout so
 * every tab, the Quick Morph chips, and the agent tools see the same state.
 *
 * All channel changes funnel through one place so each one records history,
 * updates the ACTIVE preset, refreshes channel info, and shows a toast.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ApplyRecord, SentChannelPayload, StreamCategory, StreamProfile } from '@/types/Profile';
import type { TwitchChannelResponse } from '@/types/TwitchAPI';
import { useProfiles } from '@/hooks/useProfiles';
import { useAPIHealth } from '@/hooks/useAPIHealth';
import { useAuthState } from '@/hooks/useAuth';
import { useApplyHistory } from '@/hooks/useApplyHistory';
import { useWebMCP, type ToolCall } from '@/hooks/useWebMCP';
import { useToast } from '@/components/Toast';
import { getTwitchAPI, buildSentPayload, isAuthError, isNetworkError, type APIResult } from '@/lib/api/twitchAPI';
import { getApplyHistoryRepository } from '@/repositories/ApplyHistoryRepository';
import { createApplyRecord } from '@/types/ProfileUtils';

const MAX_TOOL_CALLS = 50;

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

/** A WebMCP tool execution, kept in memory for the Hub's log */
export interface ToolCallEntry extends ToolCall {
  id: number;
}

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
  history: ReturnType<typeof useApplyHistory>;
  onReplaySuccess: () => void;
  toolCalls: ToolCallEntry[];
  clearToolCalls: () => void;
  canApply: boolean;
  apiStatusMessage: string;
};

const StreamControlContext = createContext<StreamControlValue | null>(null);

function describeUpdateError(error: unknown): string {
  if (isAuthError(error)) return 'Sign in with Twitch to update your stream.';
  if (isNetworkError(error)) return 'Network error. Check your connection and try again.';
  return (error as { message?: string } | undefined)?.message || 'Twitch rejected the update.';
}

/**
 * Record an attempt in apply history, success or failure. A history failure
 * must never mask the apply outcome, so it's logged rather than thrown.
 */
async function recordAttempt(
  entry: Pick<ApplyRecord, 'profileId' | 'profileName' | 'source'>,
  attempted: SentChannelPayload,
  result: APIResult<SentChannelPayload>
): Promise<void> {
  try {
    const record = createApplyRecord({
      ...entry,
      payload: result.success && result.data ? result.data : attempted,
      result: result.success ? 'success' : 'failed',
      ...(result.success ? {} : { error: result.error?.message || 'Failed to update stream' }),
    });
    const appendResult = await getApplyHistoryRepository().append(record);
    if (!appendResult.success) {
      console.error('Failed to persist apply history record:', appendResult.error);
    }
  } catch (error) {
    console.error('Unexpected failure recording apply history:', error);
  }
}

export function StreamControlProvider({ children }: { children: ReactNode }) {
  const profiles = useProfiles();
  const history = useApplyHistory();
  const { shouldDisableActions, getStatusMessage } = useAPIHealth();
  const { isAuthenticated } = useAuthState();
  const { showToast } = useToast();

  const [activeProfileId, setActiveProfileId] = useState<string | null>(readStoredActiveProfileId);
  const [applyingProfileId, setApplyingProfileId] = useState<string | null>(null);

  const [channel, setChannel] = useState<TwitchChannelResponse | null>(null);
  const [channelStatus, setChannelStatus] = useState<ChannelStatus>('idle');
  const [channelError, setChannelError] = useState<string | null>(null);
  const [isPushing, setIsPushing] = useState(false);

  const [toolCalls, setToolCalls] = useState<ToolCallEntry[]>([]);
  const nextToolCallId = useRef(0);

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

  const { refreshHistory } = history;

  /**
   * The single path for applying a profile. Agent "direct updates" arrive as
   * unsaved profiles; those record as edits and clear the ACTIVE preset.
   */
  const applyProfileWithResult = useCallback(async (
    profile: StreamProfile,
    via: 'ui' | 'agent'
  ): Promise<APIResult<SentChannelPayload>> => {
    const isSaved = profiles.profiles.some((p) => p.id === profile.id);
    const label = isSaved ? `"${profile.name}"` : 'stream update';
    if (isSaved) setApplyingProfileId(profile.id);

    try {
      const result = await getTwitchAPI().applyProfile(profile);
      await recordAttempt(
        { profileId: isSaved ? profile.id : null, profileName: profile.name, source: isSaved ? 'apply' : 'edit' },
        buildSentPayload(profile),
        result
      );
      refreshHistory();

      if (result.success && result.data) {
        setActive(isSaved ? profile.id : null);
        refreshChannel();
        showToast(
          via === 'agent' ? `Agent applied ${label}` : `Applied ${label}`,
          `${result.data.title} · ${result.data.categoryName || 'category unchanged'}`,
          'success'
        );
      } else {
        showToast(`Couldn't apply ${label}`, describeUpdateError(result.error), 'error');
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
      showToast(`Couldn't apply ${label}`, message, 'error');
      return { success: false, error: { code: 'UNEXPECTED', message } };
    } finally {
      if (isSaved) setApplyingProfileId(null);
    }
  }, [profiles.profiles, refreshHistory, setActive, refreshChannel, showToast]);

  const applyProfile = useCallback(
    async (profile: StreamProfile) => (await applyProfileWithResult(profile, 'ui')).success,
    [applyProfileWithResult]
  );

  const pushChannel = useCallback(async (update: ChannelUpdate): Promise<boolean> => {
    setIsPushing(true);
    const payload = buildSentPayload(update);
    try {
      const result = await getTwitchAPI().applySentPayload(payload, 'Live edit');
      await recordAttempt({ profileId: null, profileName: 'Live edit', source: 'edit' }, payload, result);
      refreshHistory();

      if (result.success) {
        // A manual edit means the stream no longer matches any preset
        setActive(null);
        refreshChannel();
        showToast('Stream updated', `${payload.title} · ${payload.categoryName}`, 'success');
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
  }, [refreshHistory, setActive, refreshChannel, showToast]);

  // Replays re-send stored payloads, which may not match any current preset
  const onReplaySuccess = useCallback(() => {
    setActive(null);
    refreshChannel();
    showToast('Stream updated from history', undefined, 'success');
  }, [setActive, refreshChannel, showToast]);

  const deleteProfile = useCallback(async (id: string): Promise<boolean> => {
    const success = await profiles.deleteProfile(id);
    if (success && id === activeProfileId) {
      setActive(null);
    }
    return success;
  }, [profiles.deleteProfile, activeProfileId, setActive]);

  // Agent tools are registered once; a stable wrapper reads the latest apply path
  const applyForAgentRef = useRef(applyProfileWithResult);
  applyForAgentRef.current = applyProfileWithResult;
  const applyForAgent = useCallback(
    (profile: StreamProfile) => applyForAgentRef.current(profile, 'agent'),
    []
  );

  const recordToolCall = useCallback((call: ToolCall) => {
    const entry = { ...call, id: nextToolCallId.current++ };
    setToolCalls((prev) => [entry, ...prev].slice(0, MAX_TOOL_CALLS));
  }, []);

  const clearToolCalls = useCallback(() => setToolCalls([]), []);

  useWebMCP({
    isAuthenticated,
    profiles: profiles.profiles,
    applyProfile: applyForAgent,
    onToolCall: recordToolCall,
  });

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
    history,
    onReplaySuccess,
    toolCalls,
    clearToolCalls,
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
