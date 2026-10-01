import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, Trash2 } from 'lucide-react'
import { useProfile } from '@/hooks/useProfiles'
import { useStreamControl } from '@/hooks/useStreamControl'
import { useToast } from '@/components/Toast'
import { PresetForm } from '@/components/PresetForm'
import type { CreateProfileInput } from '@/types/Profile'

export default function EditProfile() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { profile, isLoading: isLoadingProfile, error: profileError } = useProfile(id || null)
  const { updateProfile, deleteProfile, isLoading: isUpdating } = useStreamControl()
  const { showToast } = useToast()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleSubmit = async (input: CreateProfileInput): Promise<string | null> => {
    if (!id || !profile) {
      navigate('/presets')
      return null
    }
    const updatedProfile = await updateProfile(id, { id, ...input })
    if (!updatedProfile) {
      return 'Failed to update preset. Please check your input and try again.'
    }
    showToast(`Updated "${updatedProfile.name}"`, undefined, 'success')
    navigate('/presets')
    return null
  }

  const handleDelete = async () => {
    if (!id || !profile) return
    if (!window.confirm(`Are you sure you want to delete "${profile.name}"? This can't be undone.`)) return

    setIsDeleting(true)
    try {
      const success = await deleteProfile(id)
      if (success) {
        showToast(`Deleted "${profile.name}"`, undefined, 'success')
        navigate('/presets')
      } else {
        showToast("Couldn't delete preset", 'Please try again.', 'error')
      }
    } catch {
      showToast("Couldn't delete preset", 'An unexpected error occurred.', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  if (isLoadingProfile) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-fg-muted">Loading preset…</p>
      </div>
    )
  }

  if (profileError || !profile) {
    return (
      <div className="card max-w-lg mx-auto text-center py-10">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-fg-strong mb-2">Preset not found</h3>
        <p className="text-fg-muted mb-6">{profileError || "The preset you're looking for doesn't exist."}</p>
        <button onClick={() => navigate('/presets')} className="btn">
          Back to Presets
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg-strong">Edit Preset</h1>
        <p className="text-sm text-fg-muted mt-1">Change what this preset applies to your stream.</p>
      </div>

      <PresetForm
        key={profile.id}
        initial={{
          name: profile.name,
          description: profile.description ?? '',
          title: profile.title,
          tags: profile.tags,
          category: profile.category,
          icon: profile.icon,
          accent: profile.accent,
        }}
        submitLabel="Save Changes"
        submittingLabel="Saving…"
        disabled={isUpdating || isDeleting}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/presets')}
        secondaryAction={
          <button
            type="button"
            onClick={handleDelete}
            disabled={isUpdating || isDeleting}
            className="inline-flex items-center gap-2 px-2 py-2 text-sm font-medium text-red-400 hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isDeleting ? 'Deleting…' : 'Delete Preset'}</span>
          </button>
        }
      />
    </div>
  )
}
