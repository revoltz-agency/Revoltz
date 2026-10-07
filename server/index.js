import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getGooglePlaceDetails, searchGooglePlaces } from './googlePlaces.js';
import { searchOpenStreetMap } from './overpass.js';
import { auditWebsite } from './websiteAudit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT) || 5173;

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json({ limit: '32kb' }));

const googleApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim() || '';
// The OpenStreetMap path needs no key. It can still be switched off for an
// air-gapped or policy-restricted deployment.
const freeSearchEnabled = (process.env.FREE_LEAD_SEARCH || 'on').trim().toLowerCase() !== 'off';

app.get('/api/config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    googlePlacesConfigured: Boolean(googleApiKey),
    freeSearchEnabled,
    // Unchanged: "Demo Mode" means no Places key. Free OSM search is separate.
    demoMode: !googleApiKey,
    message: googleApiKey ? null : 'Google Places API not configured — Demo Mode active.',
  });
});

app.post('/api/free/search', async (req, res) => {
  if (!freeSearchEnabled) {
    return res.status(503).json({ error: 'Free OpenStreetMap search is disabled on this server.' });
  }

  const category = typeof req.body?.category === 'string' ? req.body.category.trim() : '';
  const location = typeof req.body?.location === 'string' ? req.body.location.trim() : '';
  const radiusKm = Number(req.body?.radiusKm);
  const maxResults = Number(req.body?.maxResults);

  if (!category || category.length > 100 || !location || location.length > 160) {
    return res.status(400).json({ error: 'Add an industry/category and a city or location to search.' });
  }
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 50) {
    return res.status(400).json({ error: 'Search radius must be between 1 and 50 km.' });
  }
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 50) {
    return res.status(400).json({ error: 'Maximum results must be between 1 and 50.' });
  }

  try {
    const { results, warnings, requests, geocodingRequests, attribution, licenseUrl, matchedCategory, queriedTags, resolvedLocation } = await searchOpenStreetMap({ category, location, radiusKm, maxResults });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      results, warnings, requests, geocodingRequests, attribution, licenseUrl,
      matchedCategory, queriedTags, resolvedLocation,
    });
  } catch (error) {
    return res.status(error.statusCode || 502).json({ error: error.message || 'OpenStreetMap search failed. Please try again.' });
  }
});

app.post('/api/places/search', async (req, res) => {
  if (!googleApiKey) {
    return res.status(503).json({ error: 'Google Places API not configured — Demo Mode active.' });
  }

  const category = typeof req.body?.category === 'string' ? req.body.category.trim() : '';
  const location = typeof req.body?.location === 'string' ? req.body.location.trim() : '';
  const radiusKm = Number(req.body?.radiusKm);
  const maxResults = Number(req.body?.maxResults);

  if (!category || category.length > 100 || !location || location.length > 160) {
    return res.status(400).json({ error: 'Add an industry/category and a city or location to search.' });
  }
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 50) {
    return res.status(400).json({ error: 'Search radius must be between 1 and 50 km.' });
  }
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 50) {
    return res.status(400).json({ error: 'Maximum results must be between 1 and 50.' });
  }

  try {
    const { results, warnings, requests, geocodingRequests } = await searchGooglePlaces({ category, location, radiusKm, maxResults, apiKey: googleApiKey });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ results, warnings, requests, geocodingRequests, attribution: 'Google Maps' });
  } catch (error) {
    return res.status(error.statusCode || 502).json({ error: error.message || 'Lead search failed. Please try again.' });
  }
});

app.post('/api/places/details', async (req, res) => {
  if (!googleApiKey) return res.status(503).json({ error: 'Google Places API not configured — Demo Mode active.' });
  const placeId = typeof req.body?.placeId === 'string' ? req.body.placeId.trim() : '';
  if (!placeId || placeId.length > 300) return res.status(400).json({ error: 'A valid place ID is required.' });
  try {
    const result = await getGooglePlaceDetails({ placeId, apiKey: googleApiKey });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ result, attribution: 'Google Maps' });
  } catch (error) {
    return res.status(error.statusCode || 502).json({ error: error.message || 'Saved place refresh failed.' });
  }
});

app.post('/api/website/analyze', async (req, res) => {
  const website = typeof req.body?.website === 'string' ? req.body.website.trim() : '';
  if (!website || website.length > 2_000) {
    return res.status(400).json({ error: 'A valid website URL is required.' });
  }
  try {
    const audit = await auditWebsite(website);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ audit });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Website analysis failed.' });
  }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));

if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(rootDir, 'dist');
  app.use(express.static(distDir, { index: false, maxAge: '1h' }));
  app.use((_req, res) => res.sendFile(path.join(distDir, 'index.html')));
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    configFile: path.join(rootDir, 'vite.config.js'),
    root: rootDir,
    server: { middlewareMode: true, hmr: { server } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

server.listen(port, '0.0.0.0', () => {
  console.log(`AgencyOS listening on http://0.0.0.0:${port} (${process.env.NODE_ENV === 'production' ? 'production' : 'development'})`);
});
