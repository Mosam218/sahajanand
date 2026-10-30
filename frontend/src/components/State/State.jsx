// Loading and error states shared by every page that reads from the API.
import './State.css';

export function Loading({ label = 'Loading', compact = false }) {
  return (
    <div className={`state ${compact ? 'state--compact' : ''}`} role="status" aria-live="polite">
      <span className="state__spinner" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'This could not be loaded' }) {
  return (
    <div className="empty" role="alert">
      <h3>{title}</h3>
      <p className="muted">{error?.message || 'Something went wrong. Please try again.'}</p>
      {onRetry && <button className="btn btn-ghost" onClick={onRetry}>Try again</button>}
    </div>
  );
}
