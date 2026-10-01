import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, Zap, Check, AlertCircle, Layers } from 'lucide-react'
import type { StreamProfile } from '@/types/Profile'
import { useStreamControl } from '@/hooks/useStreamControl'
import { processTitle } from '@/types/ProfileUtils'
import { getTwitchStatusURL } from '@/hooks/useAPIHealth'
import { presetAccent, presetIcon } from '@/lib/presetStyle'

export default function Presets() {
  const {
    profiles,
    isLoading,
    error,
    clearError,
    deleteProfile,
    activeProfileId,
    applyingProfileId,
    applyProfile,
    canApply,
    apiStatusMessage,
    profileCount,
  } = useStreamControl()

  const handleDelete = async (profile: StreamProfile) => {
    if (window.confirm(`Delete "${profile.name}"? This can't be undone.`)) {
      await deleteProfile(profile.id)
    }
  }

  if (isLoading && profiles.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-fg-muted">Loading your presets…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card max-w-lg mx-auto text-center py-10">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-fg-strong mb-2">Something went wrong</h3>
        <p className="text-fg-muted mb-6">{error}</p>
        <button onClick={clearError} className="btn">
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {!canApply && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-surface border border-line border-l-4 border-l-red-500">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-fg-strong mb-1">Can't reach Twitch right now</p>
            <p className="text-fg-muted">
              {apiStatusMessage}. Applying presets is paused. Check your connection or{' '}
              <a
                href={getTwitchStatusURL()}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-fg underline hover:text-fg-strong"
              >
                Twitch Status
              </a>
              .
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-fg-strong">Presets</h1>
          <p className="text-sm text-fg-muted mt-1">
            {profileCount === 0
              ? 'Save a title, category, and tags once. Apply them to your stream in one click.'
              : `${profileCount} preset${profileCount === 1 ? '' : 's'} ready to apply`}
          </p>
        </div>

        <Link to="/profile/new" className="btn self-start sm:self-auto">
          <Plus className="w-4 h-4" />
          <span>New Preset</span>
        </Link>
      </div>

      {profiles.length === 0 ? (
        <div className="card text-center py-14">
          <Layers className="w-8 h-8 text-fg-subtle mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-fg-strong mb-2">No presets yet</h3>
          <p className="text-fg-muted mb-6">Create your first preset to get started.</p>
          <Link to="/profile/new" className="btn">
            Create Preset
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map((profile) => {
            const processedTitle = processTitle(profile.title)
            const isActive = activeProfileId === profile.id
            const isApplying = applyingProfileId === profile.id
            const accent = presetAccent(profile)

            return (
              <article
                key={profile.id}
                data-testid="preset-card"
                className={`card flex flex-col border-l-[3px] ${accent.edge} ${isActive ? 'border-t-accent border-r-accent border-b-accent' : ''}`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-10 h-10 rounded-lg ${accent.fill} flex items-center justify-center text-xl shrink-0`}
                      aria-hidden="true"
                    >
                      {presetIcon(profile)}
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-semibold text-fg-strong truncate">{profile.name}</h2>
                      <p className="text-xs font-semibold text-accent-fg mt-0.5 truncate">{profile.category.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isActive && (
                      <span className="mr-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide bg-emerald-600 text-white">
                        ACTIVE
                      </span>
                    )}
                    <Link
                      to={`/profile/${profile.id}/edit`}
                      className="p-1.5 rounded-md text-fg-subtle hover:text-fg hover:bg-raised transition-colors"
                      title="Edit preset"
                    >
                      <Pencil className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => handleDelete(profile)}
                      className="p-1.5 rounded-md text-fg-subtle hover:text-red-400 hover:bg-raised transition-colors"
                      title="Delete preset"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {profile.description && (
                  <p className="text-sm text-fg-muted mb-3">{profile.description}</p>
                )}

                <p
                  className="p-3 rounded-md bg-raised border border-line text-sm text-fg mb-3"
                  title={`Original: ${profile.title}`}
                >
                  {processedTitle.processed}
                </p>

                {profile.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-4">
                    {profile.tags.map((tag) => (
                      <span key={tag} className="text-xs px-2 py-0.5 rounded bg-raised text-fg-muted">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-auto pt-3 border-t border-line">
                  <button
                    onClick={() => applyProfile(profile)}
                    disabled={!canApply || applyingProfileId !== null}
                    title={canApply ? 'Apply this preset to your Twitch stream' : apiStatusMessage}
                    className={`w-full ${canApply ? 'btn' : 'btn-disabled'} ${isActive ? 'bg-emerald-600 hover:bg-emerald-500' : ''} disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {isActive ? <Check className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                    <span>{isApplying ? 'Applying…' : isActive ? 'Applied' : 'Apply to Stream'}</span>
                  </button>
                  <p className="text-xs text-fg-subtle text-center mt-2">
                    Updated {profile.updatedAt.toLocaleDateString()}
                  </p>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
