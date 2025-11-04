export function LoadingScreen() {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="spinner" />
      <p>Loading your workspace…</p>
    </div>
  )
}
