import { useEffect, useMemo, useState } from 'react'
import { Gamepad2 } from 'lucide-react'
import type { StreamCategory } from '@/types/Profile'
import { getCategoryRepository } from '@/repositories/CategoryRepository'
import { useStreamControl } from '@/hooks/useStreamControl'
import { boxArtSrc } from '@/lib/presetStyle'

const DEFAULT_LIMIT = 8

interface RecentCategoryGridProps {
  value: StreamCategory | null
  onChange: (category: StreamCategory) => void
  disabled?: boolean
  limit?: number
}

/**
 * One-tap picks from categories you've used in presets or searched recently.
 * Reads only from IndexedDB, so it works offline.
 */
export function RecentCategoryGrid({ value, onChange, disabled = false, limit = DEFAULT_LIMIT }: RecentCategoryGridProps) {
  const { profiles } = useStreamControl()
  const [cached, setCached] = useState<StreamCategory[]>([])

  useEffect(() => {
    let cancelled = false
    getCategoryRepository()
      .getRecent(limit)
      .then((result) => {
        if (!cancelled && result.success && result.data) setCached(result.data)
      })
    return () => {
      cancelled = true
    }
  }, [limit])

  const categories = useMemo(() => {
    // Categories you've actually streamed with outrank ones you only searched
    const fromProfiles = [...profiles]
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((profile) => profile.category)

    const byId = new Map<string, StreamCategory>()
    for (const category of [...fromProfiles, ...cached]) {
      const existing = byId.get(category.id)
      if (!existing) {
        byId.set(category.id, category)
      } else if (!existing.boxArtUrl && category.boxArtUrl) {
        byId.set(category.id, { ...existing, boxArtUrl: category.boxArtUrl })
      }
    }
    return [...byId.values()].slice(0, limit)
  }, [profiles, cached, limit])

  if (categories.length === 0) return null

  return (
    <div className="mt-3" data-testid="recent-categories">
      <p className="text-xs text-fg-subtle mb-2">Recent</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {categories.map((category) => {
          const isSelected = value?.id === category.id
          const art = boxArtSrc(category.boxArtUrl, 52, 72)
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onChange(category)}
              disabled={disabled}
              aria-pressed={isSelected}
              title={category.name}
              className={`p-2 rounded-lg border text-left flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isSelected
                  ? 'bg-raised border-accent text-fg-strong'
                  : 'bg-raised border-line text-fg-muted hover:border-line-strong hover:text-fg'
              }`}
            >
              <span className="w-7 h-9 rounded bg-surface overflow-hidden shrink-0 flex items-center justify-center">
                {art ? (
                  <img src={art} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <Gamepad2 className="w-4 h-4 text-fg-subtle" />
                )}
              </span>
              <span className="text-xs font-semibold truncate">{category.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
