import { Component } from 'react';

export default class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('AgencyOS page render failed:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="surface-card" role="alert" style={{ padding: 24, maxWidth: 760 }}>
        <h2 style={{ marginTop: 0 }}>This section couldn't load</h2>
        <p>The page hit a rendering error. Your saved leads have not been deleted. Refresh the page and try again.</p>
        <details style={{ margin: '12px 0' }}>
          <summary>Technical details</summary>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{String(this.state.error?.message || this.state.error)}</pre>
        </details>
        <button type="button" className="button button-primary" onClick={() => window.location.reload()}>Refresh AgencyOS</button>
      </section>
    );
  }
}
