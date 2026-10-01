import { useState, type ReactNode } from 'react'
import { Save } from 'lucide-react'
import {
  DEFAULT_PRESET_ACCENT,
  DEFAULT_PRESET_ICON,
  PRESET_ACCENTS,
  type AccentKey,
  type CreateProfileInput,
  type StreamCategory,
} from '@/types/Profile'
import { countGraphemes, processTitle, titleHasTemplates } from '@/types/ProfileUtils'
import { ACCENT_STYLES, SUGGESTED_PRESET_ICONS } from '@/lib/presetStyle'
import { CategorySearchDropdown } from '@/components/CategorySearchDropdown'
import { RecentCategoryGrid } from '@/components/RecentCategoryGrid'

export interface PresetFormValues {
  name: string
  description: string
  title: string
  tags: string[]
  category: StreamCategory | null
  icon: string
  accent: AccentKey
}

interface PresetFormProps {
  initial?: Partial<PresetFormValues>
  submitLabel: string
  submittingLabel: string
  disabled?: boolean
  /** Resolves to an error message to show, or null on success */
  onSubmit: (input: CreateProfileInput) => Promise<string | null>
  onCancel: () => void
  /** Rendered at the left of the action row, e.g. a delete button */
  secondaryAction?: ReactNode
}

type FieldErrors = Partial<Record<'name' | 'category' | 'title' | 'tags' | 'icon' | 'general', string>>

const labelClass = 'block text-xs font-semibold text-fg-muted mb-1.5'

function parseTags(raw: string): string[] {
  return raw.split(',').map((tag) => tag.trim()).filter(Boolean)
}

export function PresetForm({
  initial,
  submitLabel,
  submittingLabel,
  disabled = false,
  onSubmit,
  onCancel,
  secondaryAction,
}: PresetFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [tags, setTags] = useState(initial?.tags?.join(', ') ?? '')
  const [category, setCategory] = useState<StreamCategory | null>(initial?.category ?? null)
  const [icon, setIcon] = useState(initial?.icon || DEFAULT_PRESET_ICON)
  const [accent, setAccent] = useState<AccentKey>(initial?.accent ?? DEFAULT_PRESET_ACCENT)

  const [errors, setErrors] = useState<FieldErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isDisabled = disabled || isSubmitting

  const clearError = (field: keyof FieldErrors) => {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const validate = (): boolean => {
    const next: FieldErrors = {}

    if (!name.trim()) {
      next.name = 'Preset name is required'
    } else if (name.length > 50) {
      next.name = 'Preset name must be 50 characters or less'
    }

    if (!category || !category.name.trim()) {
      next.category = 'Category is required'
    }

    if (!title.trim()) {
      next.title = 'Stream title is required'
    } else if (title.length > 140) {
      next.title = 'Stream title must be 140 characters or less'
    }

    const tagList = parseTags(tags)
    if (tagList.length > 10) {
      next.tags = 'Maximum 10 tags allowed'
    } else if (tagList.some((tag) => tag.length > 25)) {
      next.tags = 'Each tag must be 25 characters or less'
    }

    if (countGraphemes(icon.trim()) > 1) {
      next.icon = 'Use a single emoji'
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)
    try {
      const error = await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        category: category!,
        title: title.trim(),
        tags: parseTags(tags),
        icon: icon.trim() || DEFAULT_PRESET_ICON,
        accent,
      })
      if (error) setErrors({ general: error })
    } catch {
      setErrors({ general: 'An unexpected error occurred. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const accentStyle = ACCENT_STYLES[accent]

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {errors.general && (
        <div className="p-4 bg-surface border border-line border-l-4 border-l-red-500 rounded-lg">
          <p className="text-red-400 text-sm">{errors.general}</p>
        </div>
      )}

      {/* Identity */}
      <section className={`card border-l-[3px] ${accentStyle.edge} space-y-5`}>
        <div className="flex items-start gap-4">
          <span
            className={`w-14 h-14 rounded-lg ${accentStyle.fill} flex items-center justify-center text-3xl shrink-0`}
            aria-hidden="true"
            data-testid="preset-icon-preview"
          >
            {icon.trim() || DEFAULT_PRESET_ICON}
          </span>
          <div className="flex-1 min-w-0">
            <label htmlFor="name" className={labelClass}>
              Preset Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                clearError('name')
              }}
              className={`input w-full ${errors.name ? 'border-red-800' : ''}`}
              placeholder="e.g., Morning Pages"
              disabled={isDisabled}
              required
            />
            {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="description" className={labelClass}>
            Description
          </label>
          <textarea
            id="description"
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="input w-full resize-none"
            placeholder="Brief description of this stream type"
            disabled={isDisabled}
          />
        </div>

        <div>
          <label htmlFor="icon" className={labelClass}>
            Icon
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            {SUGGESTED_PRESET_ICONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setIcon(emoji)
                  clearError('icon')
                }}
                disabled={isDisabled}
                aria-pressed={icon === emoji}
                aria-label={`Use ${emoji} as icon`}
                className={`w-9 h-9 rounded-md border text-lg flex items-center justify-center transition-colors ${
                  icon === emoji ? 'bg-raised border-accent' : 'bg-raised border-line hover:border-line-strong'
                }`}
              >
                {emoji}
              </button>
            ))}
            <input
              type="text"
              id="icon"
              name="icon"
              value={icon}
              onChange={(e) => {
                setIcon(e.target.value)
                clearError('icon')
              }}
              className={`input w-16 text-center text-lg py-1.5 ${errors.icon ? 'border-red-800' : ''}`}
              aria-label="Custom icon"
              disabled={isDisabled}
            />
          </div>
          {errors.icon && <p className="text-red-400 text-xs mt-1">{errors.icon}</p>}
        </div>

        <fieldset>
          <legend className={labelClass}>Accent</legend>
          <div className="flex flex-wrap gap-2">
            {PRESET_ACCENTS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setAccent(key)}
                disabled={isDisabled}
                aria-pressed={accent === key}
                aria-label={`${ACCENT_STYLES[key].label} accent`}
                title={ACCENT_STYLES[key].label}
                className={`w-8 h-8 rounded-md ${ACCENT_STYLES[key].fill} transition-transform ${
                  accent === key ? 'outline-2 outline-offset-2 outline-fg-strong' : 'hover:scale-105'
                }`}
              />
            ))}
          </div>
        </fieldset>
      </section>

      {/* What gets applied */}
      <section className="card space-y-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Applies to your stream</h2>

        <div>
          <label htmlFor="category-dropdown" className={labelClass}>
            Twitch Category *
          </label>
          <CategorySearchDropdown
            value={category}
            onChange={(next) => {
              setCategory(next)
              if (next) clearError('category')
            }}
            error={errors.category}
            disabled={isDisabled}
            required
          />
          <RecentCategoryGrid
            value={category}
            onChange={(next) => {
              setCategory(next)
              clearError('category')
            }}
            disabled={isDisabled}
          />
        </div>

        <div>
          <label htmlFor="title" className={labelClass}>
            Stream Title Template *
          </label>
          <input
            type="text"
            id="title"
            name="title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              clearError('title')
            }}
            className={`input w-full ${errors.title ? 'border-red-800' : ''}`}
            placeholder="e.g., Morning Pages - {DAY} Reflection"
            disabled={isDisabled}
            required
          />
          {errors.title && <p className="text-red-400 text-xs mt-1">{errors.title}</p>}
          <p className="text-xs text-fg-subtle mt-1">
            {titleHasTemplates(title) ? (
              <>
                Today this reads: <span className="text-fg">{processTitle(title).processed}</span>
              </>
            ) : (
              <>Use {'{DAY}'} for day of week, {'{YYYY-MM-DD}'} for date</>
            )}
          </p>
        </div>

        <div>
          <label htmlFor="tags" className={labelClass}>
            Tags
          </label>
          <input
            type="text"
            id="tags"
            name="tags"
            value={tags}
            onChange={(e) => {
              setTags(e.target.value)
              clearError('tags')
            }}
            className={`input w-full ${errors.tags ? 'border-red-800' : ''}`}
            placeholder="journal, morning, reflection (comma separated)"
            disabled={isDisabled}
          />
          {errors.tags && <p className="text-red-400 text-xs mt-1">{errors.tags}</p>}
          <p className="text-xs text-fg-subtle mt-1">Separate tags with commas, max 10 tags</p>
        </div>
      </section>

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>{secondaryAction}</div>
        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary" disabled={isDisabled}>
            Cancel
          </button>
          <button type="submit" disabled={isDisabled} className="btn disabled:opacity-60 disabled:cursor-not-allowed">
            <Save className="w-4 h-4" />
            <span>{isSubmitting ? submittingLabel : submitLabel}</span>
          </button>
        </div>
      </div>
    </form>
  )
}
