/**
 * Recent-applications strip (feature spec C1 surface)
 *
 * Renders the newest apply-history records — stored wire truth, not live
 * profile state — with the two replay actions:
 * - Apply again (per successful row): re-PATCHes that row's recorded payload
 *   exactly as stored. profileId is display metadata, never a lookup key, so
 *   an edited or deleted source profile changes nothing about the replay.
 * - Revert (strip action): re-applies the payload of the most recent
 *   successful record before the newest successful one; disabled with fewer
 *   than two successful records — there is nothing to go back to.
 *
 * Failed attempts render as evidence with no actions. The strip shows the
 * newest 5 records with an expander for older ones and collapses entirely.
 */

import { useState } from 'react';
import { ChevronRight, Undo2, X } from 'lucide-react';
import type { ApplyRecord } from '@/types/Profile';
import type { useApplyHistory } from '@/hooks/useApplyHistory';

/** The hook result StreamControlProvider owns and passes down. */
export type ApplyHistory = ReturnType<typeof useApplyHistory>;

/** Records visible before the expander (feature spec: newest 5 + expander). */
const VISIBLE_RECORDS = 5;

const SOURCE_LABELS: Record<ApplyRecord['source'], string> = {
  'apply': 'applied',
  'apply-again': 'applied again',
  'revert': 'reverted',
  'edit': 'edited'
};

function formatAppliedAt(appliedAt: number): string {
  return new Date(appliedAt).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

interface HistoryRowProps {
  record: ApplyRecord;
  isPending: boolean;
  actionsDisabled: boolean;
  onApplyAgain: (record: ApplyRecord) => void;
}

function HistoryRow({ record, isPending, actionsDisabled, onApplyAgain }: HistoryRowProps) {
  const failed = record.result === 'failed';

  return (
    <li
      data-testid="history-row"
      data-result={record.result}
      data-source={record.source}
      className="py-3 first:pt-0 last:pb-0"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-fg-strong">{record.profileName}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted bg-raised border border-line rounded px-1.5 py-0.5">
              {SOURCE_LABELS[record.source]}
            </span>
            {failed && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-red-400 bg-raised border border-line rounded px-1.5 py-0.5">
                failed
              </span>
            )}
            <span className="text-xs text-fg-subtle">{formatAppliedAt(record.appliedAt)}</span>
          </div>
          <p className="text-sm text-fg truncate" title={record.payload.title}>
            {record.payload.title}
          </p>
          <p className="text-xs text-fg-muted">
            {record.payload.categoryName} · {record.payload.tags.length}{' '}
            tag{record.payload.tags.length === 1 ? '' : 's'}
            {failed && record.error ? ` · ${record.error}` : ''}
          </p>
        </div>
        {!failed && (
          <button
            type="button"
            onClick={() => onApplyAgain(record)}
            disabled={actionsDisabled}
            data-testid="apply-again-button"
            title={`Re-apply "${record.payload.title}" exactly as it was sent`}
            className="shrink-0 text-xs font-semibold whitespace-nowrap px-2.5 py-1.5 rounded-md bg-raised border border-line text-fg hover:bg-raised-hover hover:border-line-strong transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Applying…' : 'Apply again'}
          </button>
        )}
      </div>
    </li>
  );
}

interface RecentApplicationsStripProps {
  history: ApplyHistory;
  /** Called after a replay PATCH succeeds, so channel info and ACTIVE state can catch up. */
  onReplaySuccess: () => void;
}

export function RecentApplicationsStrip({
  history,
  onReplaySuccess
}: RecentApplicationsStripProps) {
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const {
    records,
    error,
    refreshHistory,
    applyAgain,
    revert,
    revertTarget,
    canRevert,
    pendingAction,
    actionError,
    clearActionError
  } = history;

  // Nothing to show before the first apply — the strip exists to answer
  // "what did I just set?", which is meaningless with an empty history.
  // (Covers the initial load too; a load error still renders below so it
  // can be retried.)
  if (records.length === 0 && !error) {
    return null;
  }

  const visibleRecords = showAll ? records : records.slice(0, VISIBLE_RECORDS);
  const acting = pendingAction !== null;
  const revertPending = pendingAction?.kind === 'revert';

  const handleApplyAgain = async (record: ApplyRecord): Promise<void> => {
    const succeeded = await applyAgain(record);
    if (succeeded) {
      onReplaySuccess();
    }
  };

  const handleRevert = async (): Promise<void> => {
    const succeeded = await revert();
    if (succeeded) {
      onReplaySuccess();
    }
  };

  return (
    <section
      data-testid="recent-applications"
      aria-label="Recent applications"
      className="card"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <button
          type="button"
          onClick={() => setOpen(currentOpen => !currentOpen)}
          aria-expanded={open}
          data-testid="recent-applications-toggle"
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle hover:text-fg bg-transparent border-none p-0 cursor-pointer"
        >
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
          Recent applications
        </button>
        <button
          type="button"
          onClick={handleRevert}
          disabled={!canRevert || acting}
          data-testid="revert-button"
          title={
            canRevert && revertTarget
              ? `Re-apply "${revertTarget.payload.title}" — the apply before your most recent`
              : 'Revert needs at least two successful applications'
          }
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md bg-raised border border-line text-fg hover:bg-raised-hover hover:border-line-strong transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
          {revertPending ? 'Reverting…' : 'Revert'}
        </button>
      </div>

      {open && (
        <>
          {error && (
            <div
              data-testid="history-load-error"
              className="flex items-center justify-between gap-3 text-sm text-red-400 bg-raised border border-line border-l-4 border-l-red-500 rounded-md px-3 py-2 mb-3"
            >
              <span>{error}</span>
              <button type="button" onClick={refreshHistory} className="underline cursor-pointer">
                Retry
              </button>
            </div>
          )}

          {actionError && (
            <div
              data-testid="replay-error"
              className="flex items-center justify-between gap-3 text-sm text-red-400 bg-raised border border-line border-l-4 border-l-red-500 rounded-md px-3 py-2 mb-3"
            >
              <span>{actionError}</span>
              <button type="button" onClick={clearActionError} className="text-fg-subtle hover:text-fg cursor-pointer" aria-label="Dismiss error">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <ul className="divide-y divide-line">
            {visibleRecords.map(record => (
              <HistoryRow
                key={record.id}
                record={record}
                isPending={pendingAction?.kind === 'apply-again' && pendingAction.recordId === record.id}
                actionsDisabled={acting}
                onApplyAgain={handleApplyAgain}
              />
            ))}
          </ul>

          {records.length > VISIBLE_RECORDS && (
            <button
              type="button"
              onClick={() => setShowAll(next => !next)}
              data-testid="history-expander"
              aria-expanded={showAll}
              className="mt-3 text-xs text-fg-muted hover:text-fg-strong underline cursor-pointer bg-transparent border-none p-0"
            >
              {showAll ? 'Show fewer' : `Show all ${records.length} applications`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
