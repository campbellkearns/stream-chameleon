import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Radio, RefreshCw, Pencil, Send, BookmarkPlus, X, Zap, Check, Link2, AlertCircle, RotateCcw } from 'lucide-react'
import type { StreamCategory } from '@/types/Profile'
import type { TwitchChannelResponse } from '@/types/TwitchAPI'
import { useStreamControl } from '@/hooks/useStreamControl'
import { useAuthState } from '@/hooks/useAuth'
import { CategorySearchDropdown } from '@/components/CategorySearchDropdown'
import { processTitle, titleHasTemplates } from '@/types/ProfileUtils'

const MAX_TITLE_LENGTH = 140
const MAX_TAGS = 10
const MAX_TAG_LENGTH = 25

interface Draft {
  title: string
  category: StreamCategory | null
  tags: string[]
}

export interface PresetPrefill {
  title: string
  category: StreamCategory | null
  tags: string[]
}

const EMPTY_DRAFT: Draft = { title: '', category: null, tags: [] }

function draftFromChannel(channel: TwitchChannelResponse): Draft {
  return {
    title: channel.title,
    category: channel.game_id ? { id: channel.game_id, name: channel.game_name } : null,
    tags: channel.tags ?? [],
  }
}

function draftsEqual(a: Draft, b: Draft): boolean {
  return (
    a.title === b.title &&
    a.category?.id === b.category?.id &&
    a.tags.length === b.tags.length &&
    a.tags.every((tag, i) => tag === b.tags[i])
  )
}

function ChannelMonitor() {
  const { isAuthenticated } = useAuthState()
  const { channel, channelStatus, channelError, refreshChannel } = useStreamControl()

  if (!isAuthenticated) {
    return (
      <section className="card text-center py-10" data-testid="channel-monitor">
        <Radio className="w-8 h-8 text-fg-subtle mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-fg-strong mb-2">Connect Twitch to see your channel</h2>
        <p className="text-fg-muted mb-6 max-w-md mx-auto">
          Once connected, your current title, category, and tags load here so you can edit them live.
        </p>
        <Link to="/auth" className="btn">
          <Link2 className="w-4 h-4" />
          <span>Connect Twitch</span>
        </Link>
      </section>
    )
  }

  return (
    <section className="card" data-testid="channel-monitor">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">On Twitch now</h2>
        <button
          onClick={refreshChannel}
          disabled={channelStatus === 'loading'}
          className="p-1.5 rounded-md text-fg-subtle hover:text-fg hover:bg-raised transition-colors disabled:opacity-50"
          title="Reload channel info"
        >
          <RefreshCw className={`w-4 h-4 ${channelStatus === 'loading' ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {channel ? (
        <>
          <p className="text-xl font-bold text-fg-strong mb-2 break-words">{channel.title || 'Untitled stream'}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-raised border border-line font-semibold text-accent-fg">
              {channel.game_name || 'No category'}
            </span>
            {channel.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-fg-muted">#{tag}</span>
            ))}
            {channel.tags.length > 3 && <span className="text-fg-subtle">+{channel.tags.length - 3}</span>}
          </div>
        </>
      ) : channelStatus === 'error' ? null : (
        <p className="text-fg-muted">Loading channel info…</p>
      )}

      {channelStatus === 'error' && (
        <p className="flex items-center gap-2 text-sm text-amber-400 mt-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{channelError}</span>
        </p>
      )}
    </section>
  )
}

function BroadcastEditor() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthState()
  const { channel, pushChannel, isPushing, canApply, apiStatusMessage } = useStreamControl()

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [baseline, setBaseline] = useState<TwitchChannelResponse | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [tagError, setTagError] = useState('')

  // When fresh channel info arrives, adopt it unless the user has unsaved edits
  if (channel !== baseline) {
    setBaseline(channel)
    if (channel && (!baseline || draftsEqual(draft, draftFromChannel(baseline)))) {
      setDraft(draftFromChannel(channel))
    }
  }

  const isDirty = baseline ? !draftsEqual(draft, draftFromChannel(baseline)) : false
  const titleTooLong = draft.title.length > MAX_TITLE_LENGTH
  const isValid = draft.title.trim() !== '' && !titleTooLong && draft.category !== null

  const pushBlockedReason = !isAuthenticated
    ? 'Connect Twitch to push changes'
    : !canApply
      ? apiStatusMessage
      : !isValid
        ? 'A title and category are required'
        : null

  const addTag = () => {
    const tag = tagInput.trim().replace(/^#/, '')
    if (!tag) return
    if (tag.length > MAX_TAG_LENGTH) {
      setTagError(`Tags must be ${MAX_TAG_LENGTH} characters or less`)
      return
    }
    if (draft.tags.length >= MAX_TAGS) {
      setTagError(`Twitch allows up to ${MAX_TAGS} tags`)
      return
    }
    if (draft.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setTagError(`"${tag}" is already added`)
      return
    }
    setDraft((prev) => ({ ...prev, tags: [...prev.tags, tag] }))
    setTagInput('')
    setTagError('')
  }

  const removeTag = (tag: string) => {
    setDraft((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pushBlockedReason || !draft.category) return
    await pushChannel({ title: draft.title.trim(), category: draft.category, tags: draft.tags })
  }

  const handleSaveAsPreset = () => {
    const prefill: PresetPrefill = { title: draft.title.trim(), category: draft.category, tags: draft.tags }
    navigate('/profile/new', { state: { prefill } })
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-5" data-testid="broadcast-editor">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-line">
        <div className="flex items-center gap-2">
          <Pencil className="w-4 h-4 text-accent-fg" />
          <h2 className="font-semibold text-sm text-fg-strong">Broadcast Editor</h2>
        </div>
        {isDirty && (
          <button
            type="button"
            onClick={() => baseline && setDraft(draftFromChannel(baseline))}
            className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg-strong transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to current</span>
          </button>
        )}
      </div>

      <div>
        <label htmlFor="live-title" className="block text-xs font-semibold text-fg-muted mb-1.5">
          Stream Title
        </label>
        <input
          id="live-title"
          type="text"
          value={draft.title}
          onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
          placeholder="e.g., Morning Pages - {DAY} Reflection"
          className={`input w-full ${titleTooLong ? 'border-red-800' : ''}`}
        />
        <div className="flex justify-between gap-3 mt-1 text-xs">
          <span className="text-fg-subtle truncate">
            {titleHasTemplates(draft.title) && <>Goes live as: <span className="text-fg">{processTitle(draft.title).processed}</span></>}
          </span>
          <span className={titleTooLong ? 'text-red-400' : 'text-fg-subtle'}>
            {draft.title.length}/{MAX_TITLE_LENGTH}
          </span>
        </div>
      </div>

      <div>
        <label htmlFor="category-dropdown" className="block text-xs font-semibold text-fg-muted mb-1.5">
          Category
        </label>
        <CategorySearchDropdown
          value={draft.category}
          onChange={(category) => setDraft((prev) => ({ ...prev, category }))}
        />
      </div>

      <div>
        <label htmlFor="live-tag" className="block text-xs font-semibold text-fg-muted mb-1.5">
          Tags <span className="text-fg-subtle font-normal">({draft.tags.length}/{MAX_TAGS})</span>
        </label>
        {draft.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {draft.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-md bg-raised border border-line text-xs text-fg"
              >
                <span>#{tag}</span>
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="text-fg-subtle hover:text-red-400 transition-colors"
                  aria-label={`Remove tag ${tag}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            id="live-tag"
            type="text"
            value={tagInput}
            onChange={(e) => {
              setTagInput(e.target.value)
              setTagError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                addTag()
              }
            }}
            placeholder="Add a tag…"
            className="input flex-1 min-w-0"
          />
          <button type="button" onClick={addTag} className="btn-secondary">
            Add
          </button>
        </div>
        {tagError && <p className="text-red-400 text-xs mt-1">{tagError}</p>}
      </div>

      <div className="pt-3 border-t border-line flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
        <button type="button" onClick={handleSaveAsPreset} className="btn-secondary">
          <BookmarkPlus className="w-4 h-4" />
          <span>Save as Preset</span>
        </button>
        <button
          type="submit"
          disabled={pushBlockedReason !== null || isPushing}
          title={pushBlockedReason ?? 'Update your Twitch stream'}
          className={`${pushBlockedReason ? 'btn-disabled' : 'btn'} disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <Send className="w-4 h-4" />
          <span>{isPushing ? 'Pushing…' : 'Push to Twitch'}</span>
        </button>
      </div>
      {pushBlockedReason && isAuthenticated && (
        <p className="text-xs text-fg-subtle text-right -mt-2">{pushBlockedReason}</p>
      )}
    </form>
  )
}

function PresetQuickList() {
  const { profiles, activeProfileId, applyingProfileId, applyProfile, canApply, apiStatusMessage } = useStreamControl()

  return (
    <section className="card">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Presets</h2>
        <Link to="/presets" className="text-xs text-fg-muted hover:text-accent-fg transition-colors">
          Manage
        </Link>
      </div>

      {profiles.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-fg-muted mb-4">No presets yet.</p>
          <Link to="/profile/new" className="btn-secondary">
            Create Preset
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {profiles.map((profile) => {
            const isActive = activeProfileId === profile.id
            const isApplying = applyingProfileId === profile.id
            return (
              <li
                key={profile.id}
                className={`flex items-center justify-between gap-3 p-3 rounded-lg bg-raised border ${isActive ? 'border-accent' : 'border-line'}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg-strong truncate">{profile.name}</p>
                  <p className="text-xs text-fg-muted truncate">{profile.category.name}</p>
                </div>
                <button
                  onClick={() => applyProfile(profile)}
                  disabled={!canApply || applyingProfileId !== null}
                  title={canApply ? `Apply "${profile.name}"` : apiStatusMessage}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    isActive ? 'bg-emerald-600 text-white' : 'bg-accent text-white hover:bg-accent-hover'
                  }`}
                >
                  {isActive ? <Check className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
                  <span>{isApplying ? 'Applying…' : isActive ? 'Active' : 'Morph'}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default function LiveController() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg-strong">Live Controller</h1>
        <p className="text-sm text-fg-muted mt-1">Edit what's on your stream right now, or morph into a preset.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
          <ChannelMonitor />
          <BroadcastEditor />
        </div>
        <div className="lg:col-span-4">
          <PresetQuickList />
        </div>
      </div>
    </div>
  )
}
