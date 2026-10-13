import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import WorkspaceAuthGate from './components/WorkspaceAuthGate.jsx';
import { isAppPath, useRouterPath } from './lib/router.js';
import './styles.css';
// Loaded last so the REVOLTZ AI site styles win over the workspace defaults.
import './site/site.css';

function Root() {
  const path = useRouterPath();
  return isAppPath(path) ? <WorkspaceAuthGate /> : <App />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
