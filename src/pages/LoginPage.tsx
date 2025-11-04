import { Navigate } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'

export function LoginPage() {
  const { user, signInWithGoogle } = useAuth()

  if (user) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Welcome to Social Automation</h1>
        <p>Sign in to schedule and manage your tweets.</p>
        <button className="primary-button" onClick={signInWithGoogle}>
          Continue with Google
        </button>
      </div>
    </div>
  )
}
