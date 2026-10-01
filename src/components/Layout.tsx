import { Outlet, Link, NavLink } from 'react-router-dom'
import { useState } from 'react'
import { Radio, Layers, LogOut, Link2, Zap } from 'lucide-react'
import { useAuthState } from '@/hooks/useAuth'
import { getTwitchAuth } from '@/lib/auth/twitchAuth'
import { StreamControlProvider, useStreamControl } from '@/hooks/useStreamControl'

const TABS = [
  { to: '/presets', label: 'Presets', icon: Layers },
]

const MAX_QUICK_MORPH_CHIPS = 5

function QuickMorphChips() {
  const { profiles, activeProfileId, applyingProfileId, applyProfile, canApply, apiStatusMessage } = useStreamControl()

  if (profiles.length === 0) return null

  return (
    <div className="hidden lg:flex items-center gap-1.5 pb-2">
      <span className="text-xs text-fg-subtle font-medium mr-1">Quick Morph</span>
      {profiles.slice(0, MAX_QUICK_MORPH_CHIPS).map((profile) => {
        const isActive = activeProfileId === profile.id
        const isApplying = applyingProfileId === profile.id
        return (
          <button
            key={profile.id}
            onClick={() => applyProfile(profile)}
            disabled={!canApply || applyingProfileId !== null}
            title={canApply ? `Apply "${profile.name}"` : apiStatusMessage}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              isActive
                ? 'bg-raised border-accent text-fg-strong'
                : 'bg-surface border-line text-fg-muted hover:bg-raised hover:text-fg'
            }`}
          >
            {isApplying && <Zap className="w-3 h-3 text-accent-fg" />}
            <span className="max-w-28 truncate">{profile.name}</span>
          </button>
        )
      })}
    </div>
  )
}

function AccountControls() {
  const { isAuthenticated, user, isLoading } = useAuthState()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const handleSignOut = async () => {
    try {
      await getTwitchAuth().signOut()
      window.location.href = '/'
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  if (isLoading) return null

  if (!isAuthenticated || !user) {
    return (
      <Link to="/auth" className="btn-secondary whitespace-nowrap">
        <Link2 className="w-4 h-4" />
        <span>Connect<span className="hidden sm:inline"> Twitch</span></span>
      </Link>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-raised transition-colors"
        aria-expanded={isMenuOpen}
        aria-label="Account menu"
      >
        <img src={user.profile_image_url} alt="" className="w-8 h-8 rounded-full" />
        <span className="hidden sm:block text-sm font-medium text-fg">{user.display_name}</span>
      </button>

      {isMenuOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-lg bg-raised border border-line shadow-lg py-2 z-50">
          <div className="px-4 py-2 border-b border-line">
            <p className="text-sm font-medium text-fg-strong">{user.display_name}</p>
            <p className="text-xs text-fg-muted">@{user.login} · Connected</p>
          </div>
          <button
            onClick={() => {
              setIsMenuOpen(false)
              handleSignOut()
            }}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-fg-muted hover:text-fg-strong hover:bg-raised-hover transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const currentYear = new Date().getFullYear()

  return (
    <StreamControlProvider>
      <div className="min-h-screen flex flex-col bg-bg">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-surface border-b border-line">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 text-fg-strong">
              <span className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
                <Radio className="w-5 h-5 text-white" />
              </span>
              <span className="text-base sm:text-lg font-semibold tracking-tight whitespace-nowrap">Stream Chameleon</span>
            </Link>

            <AccountControls />
          </div>
        </header>

        {/* Tab bar */}
        <nav className="border-b border-line">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-2 flex items-end justify-between gap-4 overflow-x-auto">
            <div className="flex items-center gap-1">
              {TABS.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                      isActive
                        ? 'border-accent text-fg-strong'
                        : 'border-transparent text-fg-muted hover:text-fg'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>

            <QuickMorphChips />
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 w-full mx-auto max-w-6xl px-4 sm:px-6 py-6">
          <Outlet />
        </main>

        {/* Footer */}
        <footer className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-fg-subtle">
            <p>© {currentYear} Stream Chameleon</p>
            <Link to="/support" className="text-fg-muted hover:text-accent-fg transition-colors">
              Support Development
            </Link>
          </div>
        </footer>
      </div>
    </StreamControlProvider>
  )
}
