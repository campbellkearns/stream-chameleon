import { useLocation, useNavigate } from 'react-router-dom'
import { useStreamControl } from '@/hooks/useStreamControl'
import { useToast } from '@/components/Toast'
import { PresetForm } from '@/components/PresetForm'
import type { CreateProfileInput } from '@/types/Profile'
import type { PresetPrefill } from '@/pages/LiveController'

export default function CreateProfile() {
  const navigate = useNavigate()
  const location = useLocation()
  // Set when arriving from the Live tab's "Save as Preset"
  const prefill = (location.state as { prefill?: PresetPrefill } | null)?.prefill
  const { createProfile, isLoading } = useStreamControl()
  const { showToast } = useToast()

  const handleSubmit = async (input: CreateProfileInput): Promise<string | null> => {
    const newProfile = await createProfile(input)
    if (!newProfile) {
      return 'Failed to create preset. Please check your input and try again.'
    }
    showToast(`Created "${newProfile.name}"`, undefined, 'success')
    navigate('/presets')
    return null
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg-strong">New Preset</h1>
        <p className="text-sm text-fg-muted mt-1">Save a title, category, and tags you can apply in one click.</p>
      </div>

      <PresetForm
        initial={prefill ? { title: prefill.title, category: prefill.category, tags: prefill.tags } : undefined}
        submitLabel="Create Preset"
        submittingLabel="Creating…"
        disabled={isLoading}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/presets')}
      />
    </div>
  )
}
