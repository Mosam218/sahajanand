import { Component } from 'react';

// Keeps one broken page from taking the whole site down, and never shows
// technical details to customers.
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('Page error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="wrap section">
        <div className="empty" role="alert">
          <h1 style={{ fontSize: 'var(--fs-4)', marginBottom: '0.5rem' }}>Something went wrong on this page</h1>
          <p className="muted">Please reload the page. If it keeps happening, contact us and we will help you directly.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload page</button>
        </div>
      </div>
    );
  }
}
