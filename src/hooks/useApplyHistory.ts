/**
 * Apply History Hook
 *
 * Thin React hook exposing the recent-applications strip's data and its two
 * replay actions. Every apply attempt recorded by useProfiles.applyProfile
 * lands here newest first; Apply-again re-PATCHes a row's stored payload
 * as-is and Revert re-applies the payload of the most recent successful
 * record before the newest successful one (feature spec C1 — "Semantics
 * that need pinning"). Both write their own history rows.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ApplyRecord } from '@/types/Profile';
import { createApplyRecord } from '@/types/ProfileUtils';
import { getApplyHistoryRepository } from '@/repositories/ApplyHistoryRepository';
import { getTwitchAPI } from '@/lib/api/twitchAPI';

/**
 * The replay currently in flight — disables the strip's action buttons and
 * labels the originating row. recordId is the row being re-applied
 * (apply-again); a revert targets a computed record, so it carries null.
 */
export interface PendingReplay {
  kind: 'apply-again' | 'revert';
  recordId: string | null;
}

/**
 * Loading state interface
 */
interface HistoryLoadingState {
  isLoading: boolean;
  error: string | null;
}

/**
 * Apply history management hook
 *
 * Loads all records ordered by appliedAt descending (the repository's
 * contract) and exposes a refresh for after new applies land.
 */
export const useApplyHistory = () => {
  const [records, setRecords] = useState<ApplyRecord[]>([]);
  const [historyState, setHistoryState] = useState<HistoryLoadingState>({
    isLoading: true,
    error: null
  });

  const [pendingAction, setPendingAction] = useState<PendingReplay | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const historyRepository = getApplyHistoryRepository();

  /**
   * Load all history records from the repository, newest first
   */
  // Strip semantics: failed rows are evidence only and never count as a
  // state to go back to. revertTarget is the most recent successful record
  // before the newest successful one (null ⇒ Revert disabled).
  const successfulRecords = useMemo(
    () => records.filter(record => record.result === 'success'),
    [records]
  );

  const canRevert = successfulRecords.length >= 2;
  const revertTarget = canRevert ? successfulRecords[1] : null;

  const loadHistory = useCallback(async () => {
    setHistoryState(prev => ({ ...prev, isLoading: true }));

    try {
      const result = await historyRepository.getAll();

      if (result.success && result.data) {
        setRecords(result.data);
        setHistoryState({ isLoading: false, error: null });
      } else {
        setHistoryState({
          isLoading: false,
          error: result.error?.message || 'Failed to load apply history'
        });
      }
    } catch (error) {
      setHistoryState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred'
      });
    }
  }, [historyRepository]);

  /**
   * Clear all history records
   */
  const clearHistory = useCallback(async () => {
    try {
      const result = await historyRepository.clear();

      if (result.success) {
        setRecords([]);
        setHistoryState({ isLoading: false, error: null });
      } else {
        setHistoryState(prev => ({
          ...prev,
          error: result.error?.message || 'Failed to clear apply history'
        }));
      }
    } catch (error) {
      setHistoryState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'An unexpected error occurred'
      }));
    }
  }, [historyRepository]);

  // Load history on hook initialization
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  /**
   * Shared replay path for Apply-again and Revert: PATCH the recorded
   * payload exactly as stored and append the attempt as its own history row
   * (success or failure — a failed replay is evidence too, mirroring the
   * record-on-apply posture of useProfiles). The payload is never re-derived
   * from live profile state; profileId is display metadata, not a lookup
   * key, so edited or deleted profiles change nothing about what is sent.
   */
  const replayRecord = useCallback(async (
    record: ApplyRecord,
    kind: PendingReplay['kind']
  ): Promise<boolean> => {
    setActionError(null);
    setPendingAction({ kind, recordId: kind === 'apply-again' ? record.id : null });

    try {
      const result = await getTwitchAPI().applySentPayload(record.payload, record.profileName);

      const replayRow = createApplyRecord({
        // A revert row's payload came from a prior record, not an owning
        // profile — apply-again keeps the lineage for display.
        profileId: kind === 'apply-again' ? record.profileId : null,
        profileName: record.profileName,
        payload: result.success && result.data ? result.data : record.payload,
        source: kind,
        result: result.success ? 'success' : 'failed',
        ...(result.success
          ? {}
          : { error: result.error?.message || 'Failed to apply profile to stream' })
      });

      const appendResult = await getApplyHistoryRepository().append(replayRow);
      if (!appendResult.success) {
        console.error('Failed to persist replay history record:', appendResult.error);
      }

      await loadHistory();

      if (!result.success) {
        setActionError(result.error?.message || 'Failed to apply profile to stream');
        return false;
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unexpected error occurred';
      setActionError(message);
      return false;
    } finally {
      setPendingAction(null);
    }
  }, [loadHistory]);

  /**
   * Apply-again: re-PATCH this row's recorded payload as-is.
   */
  const applyAgain = useCallback(
    (record: ApplyRecord) => replayRecord(record, 'apply-again'),
    [replayRecord]
  );

  /**
   * Revert: re-apply the payload of the most recent successful record before
   * the newest successful one — with fewer than two successful records there
   * is nothing to go back to, so the action is a no-op (the strip renders it
   * disabled; this guard covers programmatic calls).
   */
  const revert = useCallback(async (): Promise<boolean> => {
    if (!revertTarget) {
      return false;
    }
    return replayRecord(revertTarget, 'revert');
  }, [replayRecord, revertTarget]);

  const clearActionError = useCallback(() => {
    setActionError(null);
  }, []);

  return {
    // Data (newest first)
    records,

    // Loading state
    isLoading: historyState.isLoading,
    error: historyState.error,

    // Operations
    refreshHistory: loadHistory,
    clearHistory,

    // Replay actions (feature spec C1)
    applyAgain,
    revert,
    revertTarget,
    canRevert,
    pendingAction,
    actionError,
    clearActionError
  };
};
