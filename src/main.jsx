import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import WorkspaceAuthGate from './components/WorkspaceAuthGate.jsx';
import { isAppPath, useRouterPath } from './lib/router.js';
import './styles.css';
// Loaded last so the REVOLTZ AI site styles win over the workspace defaults.
import './site/site.css';
// Workspace-only motion layer; public marketing build uses src/site-main.jsx instead.
import './agencyos-motion.css';

class StartupErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[AgencyOS startup/render error]', error, info?.componentStack || '');
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ minHeight: '100vh', boxSizing: 'border-box', padding: '48px 22px', display: 'grid', placeItems: 'center', background: '#080d18', color: '#edf2fb', fontFamily: 'Inter, system-ui, sans-serif' }}>
          <section style={{ width: 'min(680px, 100%)', boxSizing: 'border-box', padding: '28px', border: '1px solid #344258', borderRadius: '16px', background: '#101827' }}>
            <p style={{ margin: '0 0 10px', color: '#ffb5a8', fontSize: '11px', fontWeight: 700, letterSpacing: '.16em' }}>REVOLTZ AI · STARTUP ERROR</p>
            <h1 style={{ margin: '0 0 12px', fontSize: '24px' }}>AgencyOS could not render</h1>
            <p style={{ margin: '0 0 18px', color: '#aebbd0', lineHeight: 1.6 }}>The page loaded, but the app hit a JavaScript error. Your saved workspace data has not been intentionally cleared. Reload once; if this repeats, share the technical message below with support.</p>
            <pre style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', padding: '14px', borderRadius: '9px', background: '#080d18', color: '#ffc6ba', fontSize: '12px', lineHeight: 1.6 }}>{String(this.state.error?.message || this.state.error || 'Unknown render error')}</pre>
            <button onClick={() => window.location.reload()} style={{ marginTop: '16px', padding: '10px 14px', border: '1px solid #516a8c', borderRadius: '8px', background: '#1b2b42', color: '#f4f7ff', cursor: 'pointer' }}>Reload AgencyOS</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

function Root() {
  const path = useRouterPath();
  return isAppPath(path) ? <WorkspaceAuthGate /> : <App />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StartupErrorBoundary>
      <Root />
    </StartupErrorBoundary>
  </React.StrictMode>,
);
