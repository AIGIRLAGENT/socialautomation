import type { PropsWithChildren } from 'react'
import { useAuth } from '../../providers/AuthProvider'

export function AppShell({ children }: PropsWithChildren) {
  const { user, signOut } = useAuth()

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1 className="app-title">Social Automation</h1>
          <p className="app-subtitle">Plan, queue, and track your tweets</p>
        </div>
        <div className="app-user">
          <div className="user-meta">
            <span className="user-name">{user?.displayName ?? 'Anonymous'}</span>
            <span className="user-email">{user?.email ?? ''}</span>
          </div>
          <button
            className="ghost-button"
            onClick={() => {
              void signOut()
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  )
}
