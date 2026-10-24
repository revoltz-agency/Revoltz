import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import RevoltzSite from './site/RevoltzSite.jsx';
import './site/site.css';
import './site/aceternity-polish.css';

// Dedicated public entry point: GitHub Pages does not import the AgencyOS app.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RevoltzSite />
  </StrictMode>,
);
