import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useProfile } from '@/hooks/useProfiles'
import { useStreamControl } from '@/hooks/useStreamControl'
import { useToast } from '@/components/Toast'
import { CategorySearchDropdown } from '@/components/CategorySearchDropdown'
import type { UpdateProfileInput, StreamCategory } from '@/types/Profile'

export default function EditProfile(): JSX.Element {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { profile, isLoading: isLoadingProfile, error: profileError } = useProfile(id || null)
  const { updateProfile, deleteProfile, isLoading: isUpdating } = useStreamControl()
  const { showToast } = useToast()
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    title: '',
    tags: ''
  })

  const [selectedCategory, setSelectedCategory] = useState<StreamCategory | null>(null)

  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Populate form when profile loads
  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name,
        description: profile.description || '',
        title: profile.title,
        tags: profile.tags.join(', ')
      })
      setSelectedCategory(profile.category)
    }
  }, [profile])

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {}
    
    // Name validation
    if (!formData.name.trim()) {
      errors.name = 'Preset name is required'
    } else if (formData.name.length > 50) {
      errors.name = 'Preset name must be 50 characters or less'
    }
    
    // Category validation
    if (!selectedCategory || !selectedCategory.name.trim()) {
      errors.category = 'Category is required'
    }
    
    // Title validation
    if (!formData.title.trim()) {
      errors.title = 'Stream title is required'
    } else if (formData.title.length > 140) {
      errors.title = 'Stream title must be 140 characters or less'
    }
    
    // Tags validation
    if (formData.tags) {
      const tagArray = formData.tags.split(',').map(tag => tag.trim()).filter(Boolean)
      if (tagArray.length > 10) {
        errors.tags = 'Maximum 10 tags allowed'
      }
      
      const invalidTags = tagArray.filter(tag => tag.length > 25)
      if (invalidTags.length > 0) {
        errors.tags = 'Each tag must be 25 characters or less'
      }
    }
    
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!id || !profile) {
      navigate('/presets')
      return
    }
    
    if (!validateForm()) {
      return
    }
    
    setIsSubmitting(true)
    
    try {
      // Convert form data to update input
      const updateInput: UpdateProfileInput = {
        id,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        category: selectedCategory!,
        title: formData.title.trim(),
        tags: formData.tags
          ? formData.tags.split(',').map(tag => tag.trim()).filter(Boolean)
          : []
      }
      
      const updatedProfile = await updateProfile(id, updateInput)
      
      if (updatedProfile) {
        // Success! Navigate back to presets
        showToast(`Updated "${updatedProfile.name}"`, undefined, 'success')
        navigate('/presets')
      } else {
        // Error is handled by the hook
        setFormErrors({ 
          general: 'Failed to update preset. Please check your input and try again.' 
        })
      }
    } catch (error) {
      setFormErrors({ 
        general: 'An unexpected error occurred. Please try again.' 
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    
    // Clear field error when user starts typing
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: ''
      }))
    }
  }

  const handleDelete = async () => {
    if (!id || !profile) return
    
    const confirmMessage = `Are you sure you want to delete "${profile.name}"? This can't be undone.`
    
    if (window.confirm(confirmMessage)) {
      setIsDeleting(true)
      
      try {
        const success = await deleteProfile(id)
        
        if (success) {
          showToast(`Deleted "${profile.name}"`, undefined, 'success')
          navigate('/presets')
        } else {
          showToast('Couldn\'t delete preset', 'Please try again.', 'error')
        }
      } catch (error) {
        showToast('Couldn\'t delete preset', 'An unexpected error occurred.', 'error')
      } finally {
        setIsDeleting(false)
      }
    }
  }

  const isFormDisabled = isLoadingProfile || isUpdating || isSubmitting || isDeleting

  // Loading state
  if (isLoadingProfile) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">⏳</div>
          <p className="text-lg text-fg-muted">Loading preset…</p>
        </div>
      </div>
    )
  }

  // Error state
  if (profileError || !profile) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">⚠️</div>
        <h3 className="text-xl font-medium text-fg-strong mb-2">
          Preset not found
        </h3>
        <p className="text-fg-muted mb-6">
          {profileError || 'The preset you\'re looking for doesn\'t exist.'}
        </p>
        <button 
          onClick={() => navigate('/presets')}
          className="btn"
        >
          Back to Presets
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-medium text-fg-strong mb-3">
          Edit Preset
        </h1>
        <p className="text-lg text-fg-muted">
          Change what this preset applies to your stream.
        </p>
      </div>

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* General error message */}
          {formErrors.general && (
            <div className="p-4 bg-surface border border-red-800 rounded-lg">
              <p className="text-red-400 text-sm">{formErrors.general}</p>
            </div>
          )}
          
          <div className="card">
            <h2 className="text-xl font-medium text-fg-strong mb-6">
              Preset Details
            </h2>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-fg mb-2">
                  Preset Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className={`input w-full ${formErrors.name ? 'border-red-800 bg-surface' : ''}`}
                  placeholder="e.g., Morning Pages"
                  disabled={isFormDisabled}
                  required
                />
                {formErrors.name && (
                  <p className="text-red-400 text-xs mt-1">{formErrors.name}</p>
                )}
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-fg mb-2">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={3}
                  className="input w-full resize-none"
                  placeholder="Brief description of this stream type"
                  disabled={isFormDisabled}
                />
              </div>

              <div>
                <label htmlFor="category" className="block text-sm font-medium text-fg mb-2">
                  Twitch Category *
                </label>
                <CategorySearchDropdown
                  value={selectedCategory}
                  onChange={(category) => {
                    setSelectedCategory(category);
                    // Clear error when category is selected
                    if (category && formErrors.category) {
                      setFormErrors(prev => ({
                        ...prev,
                        category: ''
                      }));
                    }
                  }}
                  error={formErrors.category}
                  disabled={isFormDisabled}
                  required
                />
              </div>

              <div>
                <label htmlFor="title" className="block text-sm font-medium text-fg mb-2">
                  Stream Title Template *
                </label>
                <input
                  type="text"
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  className={`input w-full ${formErrors.title ? 'border-red-800 bg-surface' : ''}`}
                  placeholder="e.g., Morning Pages - {DAY} Reflection"
                  disabled={isFormDisabled}
                  required
                />
                {formErrors.title && (
                  <p className="text-red-400 text-xs mt-1">{formErrors.title}</p>
                )}
                <p className="text-xs text-fg-muted mt-1">
                  Use {`{DAY}`} for day of week, {`{YYYY-MM-DD}`} for date
                </p>
              </div>

              <div>
                <label htmlFor="tags" className="block text-sm font-medium text-fg mb-2">
                  Tags
                </label>
                <input
                  type="text"
                  id="tags"
                  name="tags"
                  value={formData.tags}
                  onChange={handleChange}
                  className={`input w-full ${formErrors.tags ? 'border-red-800 bg-surface' : ''}`}
                  placeholder="journal, morning, reflection (comma separated)"
                  disabled={isFormDisabled}
                />
                {formErrors.tags && (
                  <p className="text-red-400 text-xs mt-1">{formErrors.tags}</p>
                )}
                <p className="text-xs text-fg-muted mt-1">
                  Separate tags with commas, max 10 tags
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isFormDisabled}
              className="px-6 py-3 text-red-400 hover:text-red-300 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? (
                <>
                  <span className="animate-spin">⟳</span>
                  <span>Deleting...</span>
                </>
              ) : (
                <>
                  <span>🗑️</span>
                  <span>Delete Preset</span>
                </>
              )}
            </button>
            
            <div className="flex items-center space-x-4">
              <button
                type="button"
                onClick={() => navigate('/presets')}
                className="px-6 py-3 text-fg-muted hover:text-fg-strong transition-colors"
                disabled={isFormDisabled}
              >
                Cancel
              </button>
              
              <button
                type="submit"
                disabled={isFormDisabled}
                className="btn flex items-center space-x-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="animate-spin">⟳</span>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span>💾</span>
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
