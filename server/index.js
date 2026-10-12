import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getGooglePlaceDetails, searchGooglePlaces } from './googlePlaces.js';
import { searchOpenStreetMap } from './overpass.js';
import { enrichOsmLead } from './enrich.js';
import { auditWebsite } from './websiteAudit.js';
import { isDatabaseConfigured } from './db.js';
import {
  AUDIT_STATUS_TRANSITIONS,
  auditRetentionPurgeStatement,
  isAuditRequestId,
  retentionDaysFromEnv,
  validateAuditRequest,
} from './auditInbox.js';
import {
  countAuditRequests,
  countExpiredAuditRequests,
  deleteAuditRequest,
  insertAuditRequest,
  listAuditRequests,
  purgeExpiredAuditRequests,
  updateAuditRequestStatus,
} from './auditInboxStore.js';
import {
  SESSION_COOKIE,
  buildClearCookies,
  buildCsrfCookie,
  buildSessionCookie,
  createOwnerSession,
  isOwnerAuthConfigured,
  passesCsrfCheck,
  passesOriginCheck,
  resolveOwnerSession,
  revokeOwnerSession,
  sessionAbsoluteMs,
  verifyOwnerPassword,
} from './session.js';
import { clientKey, createPlacesRateLimiter, createRateLimiter } from './security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT) || 5173;

// Opt-in only. Left at 0 by default so the meaning of req.ip is unchanged for
// existing routes. Behind a proxy (Render, Vercel, nginx) set TRUST_PROXY_HOPS
// to the number of hops to trust so per-client rate limits key on the real
// client address instead of the proxy address.
const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS || '0', 10);
if (Number.isFinite(trustProxyHops) && trustProxyHops > 0) app.set('trust proxy', trustProxyHops);

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

// --- Audit Inbox configuration ---------------------------------------------
// Public intake is OFF unless it is explicitly turned on. Nothing in this repo
// enables it: the deployed marketing site keeps using its mailto: contact flow,
// and the flag stays false through development and deployment preparation.
const auditPublicIntakeEnabled = String(process.env.AUDIT_PUBLIC_INTAKE_ENABLED || '')
  .trim().toLowerCase() === 'true';
const auditRetentionDays = retentionDaysFromEnv(process.env.AUDIT_RETENTION_DAYS);
// The inbox is reachable only when BOTH the database and an owner credential are
// configured. A half-configured deployment stays unavailable rather than
// falling back to weaker authentication.
const auditInboxConfigured = () => isDatabaseConfigured() && isOwnerAuthConfigured();

const auditLoginLimiter = createRateLimiter({ windowMs: 10 * 60_000, limit: 5 });
const auditIntakeLimiter = createRateLimiter({ windowMs: 60 * 60_000, limit: 5 });

// Google Places backstop. Default 20/min per client; PLACES_RATE_LIMIT_PER_MIN=0
// disables it entirely. See docs/API_ABUSE_AND_COST_REVIEW.md — this is a
// backstop only and is not a global spending cap.
const placesLimiter = createPlacesRateLimiter();

/**
 * Applies the Places rate limit. Returns true when the request may continue.
 * Checked before the API key so an unconfigured server is not hammered either.
 */
function allowPlacesRequest(req, res, bucket) {
  if (!placesLimiter.enabled) return true;
  const result = placesLimiter.check(`${bucket}:${clientKey(req)}`);
  if (result.allowed) return true;
  res.setHeader('Retry-After', String(result.retryAfterSeconds));
  res.setHeader('Cache-Control', 'no-store');
  res.status(429).json({
    error: `Places request limit reached (${placesLimiter.limit}/minute). Wait ${result.retryAfterSeconds}s and try again.`,
  });
  return false;
}

app.get('/api/config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    googlePlacesConfigured: Boolean(googleApiKey),
    freeSearchEnabled,
    // Booleans only: never a connection string, token, or password hash.
    auditInboxConfigured: auditInboxConfigured(),
    auditPublicIntakeEnabled,
    // Non-secret: lets an operator confirm the Places backstop is active.
    placesRateLimitPerMinute: placesLimiter.limit,
  });
});

app.post('/api/free/search', async (req, res) => {
  if (!freeSearchEnabled) {
    return res.status(503).json({ error: 'OpenStreetMap search is disabled on this server.' });
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
  if (!allowPlacesRequest(req, res, 'places-search')) return;
  if (!googleApiKey) {
    return res.status(503).json({ error: 'Google Places API is not configured on this server.' });
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
  if (!allowPlacesRequest(req, res, 'places-details')) return;
  if (!googleApiKey) return res.status(503).json({ error: 'Google Places API is not configured on this server.' });
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

app.post('/api/enrich', async (req, res) => {
  try {
    const result = await enrichOsmLead({
      lead: req.body?.lead,
      // Website discovery is optional. The secret is read only by this server route.
      tavilyApiKey: process.env.TAVILY_API_KEY?.trim() || '',
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 502).json({ error: error.message || 'Lead enrichment failed.' });
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

// ---------------------------------------------------------------------------
// Audit Inbox — owner-only enquiry store (PostgreSQL)
// ---------------------------------------------------------------------------
//
// Audit requests are stored in Postgres and are deliberately separate from
// prospect CRM data, which never leaves the operator's browser.
//
// Security model:
//   * Owner routes require a server-side session held in an HttpOnly,
//     Secure-in-production, SameSite=Strict cookie, with idle + absolute
//     expiry and server-side revocation on logout.
//   * State-changing requests must pass the AUDIT_ALLOWED_ORIGINS check and a
//     double-submit CSRF token bound to the session row.
//   * The inbox is unavailable (503) unless BOTH DATABASE_URL and
//     AUDIT_OWNER_PASSWORD_HASH are configured. It never degrades to weaker auth.
//   * Public intake is OFF unless AUDIT_PUBLIC_INTAKE_ENABLED === 'true'.
//
// No email or WhatsApp message is ever sent from these routes.

function auditNotConfigured(res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(503).json({
    error: 'Audit Inbox is not configured. Set DATABASE_URL and AUDIT_OWNER_PASSWORD_HASH on the server.',
    configured: false,
  });
}

/**
 * Resolves an authenticated owner session, or sends 401/503 and returns null.
 *
 * Always returns null after writing a response: an Express Response object is
 * truthy, and returning it would let the caller fall through and send twice.
 */
async function requireAuditOwner(req, res) {
  if (!auditInboxConfigured()) {
    auditNotConfigured(res);
    return null;
  }
  try {
    const session = await resolveOwnerSession(req);
    if (!session) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(401).json({ error: 'Sign in to open the Audit Inbox.' });
      return null;
    }
    return session;
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({ error: 'Audit Inbox storage is unavailable. Please try again.' });
    return null;
  }
}

/** Non-secret configuration the owner UI needs before it renders a login form. */
app.get('/api/audit/config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    configured: auditInboxConfigured(),
    publicIntakeEnabled: auditPublicIntakeEnabled,
    retentionDays: auditRetentionDays,
    sessionIdleMinutes: Math.round(sessionAbsoluteMs() / 60_000),
    // Tells the SPA it must echo the CSRF cookie in the X-Audit-CSRF header.
    csrfHeader: 'X-Audit-CSRF',
  });
});

// Login. Rate limited per client and Origin-checked; no session required.
app.post('/api/audit/session', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!auditInboxConfigured()) return auditNotConfigured(res);
  if (!passesOriginCheck(req)) return res.status(403).json({ error: 'Origin not allowed.' });

  const rate = auditLoginLimiter.check(`login:${clientKey(req)}`);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
    return res.status(429).json({ error: 'Too many sign-in attempts. Wait a few minutes and try again.' });
  }

  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password || !verifyOwnerPassword(password)) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  try {
    const now = new Date();
    const { token, csrfToken, expiresAt } = await createOwnerSession({ now });
    const maxAgeSeconds = Math.max(1, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
    res.append('Set-Cookie', buildSessionCookie(token, req, maxAgeSeconds));
    res.append('Set-Cookie', buildCsrfCookie(csrfToken, req, maxAgeSeconds));
    return res.status(201).json({
      ok: true,
      csrfToken,
      expiresAt: expiresAt.toISOString(),
      retentionDays: auditRetentionDays,
    });
  } catch (error) {
    return res.status(503).json({ error: 'Could not start an Audit Inbox session.' });
  }
});

// Logout: server-side revocation first, then clear both cookies.
app.post('/api/audit/session/logout', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!auditInboxConfigured()) return auditNotConfigured(res);
  if (!passesOriginCheck(req)) return res.status(403).json({ error: 'Origin not allowed.' });
  const session = await resolveOwnerSession(req, { renew: false }).catch(() => null);
  if (session && !passesCsrfCheck(req, session)) {
    return res.status(403).json({ error: 'CSRF check failed.' });
  }
  await revokeOwnerSession(req).catch(() => false);
  for (const cookie of buildClearCookies(req)) res.append('Set-Cookie', cookie);
  return res.json({ ok: true });
});

/** Retention posture. Reports facts only; it does not claim a job is running. */
app.get('/api/audit/retention', async (req, res) => {
  const session = await requireAuditOwner(req, res);
  if (!session) return;
  try {
    const now = new Date();
    const [total, expired] = await Promise.all([
      countAuditRequests(),
      countExpiredAuditRequests({ now }),
    ]);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      retentionDays: auditRetentionDays,
      total,
      expiredAwaitingDeletion: expired,
      purgeStatement: auditRetentionPurgeStatement(now).text,
      // Honest status labels — see docs/AUDIT_INBOX.md.
      scheduledCleanup: {
        configured: true,
        unitTested: true,
        deployed: false,
        operational: false,
        mechanism: 'Neon scheduled Function Trigger (see docs/AUDIT_INBOX.md)',
      },
    });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Could not read retention status.' });
  }
});

app.get('/api/audit/requests', async (req, res) => {
  const session = await requireAuditOwner(req, res);
  if (!session) return;
  try {
    const now = new Date();
    // Opportunistic purge: defence in depth, NOT the scheduled policy. It only
    // runs when someone opens the inbox, so it cannot be cited as proof that
    // scheduled retention is operational.
    const purgedExpired = await purgeExpiredAuditRequests({ now });
    const requests = await listAuditRequests({ limit: req.query?.limit });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ requests, purgedExpired, retentionDays: auditRetentionDays, now: now.toISOString() });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Could not load audit requests.' });
  }
});

// Public intake. Disabled by default; enabled only via AUDIT_PUBLIC_INTAKE_ENABLED.
app.post('/api/audit/requests', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!auditPublicIntakeEnabled) {
    return res.status(503).json({
      error: 'Public audit intake is disabled on this server. Use the website contact address instead.',
      publicIntakeEnabled: false,
    });
  }
  if (!auditInboxConfigured()) return auditNotConfigured(res);
  if (!passesOriginCheck(req)) return res.status(403).json({ error: 'Origin not allowed.' });

  const rate = auditIntakeLimiter.check(`intake:${clientKey(req)}`);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
    return res.status(429).json({ error: 'Too many audit requests from this address. Try again later.' });
  }

  const { valid, errors, values } = validateAuditRequest(req.body || {});
  if (!valid) return res.status(400).json({ error: 'Please correct the highlighted fields.', fields: errors });

  try {
    const stored = await insertAuditRequest(values, { retentionDays: auditRetentionDays });
    // 202: accepted for review. Nothing is emailed or messaged automatically.
    return res.status(202).json({
      received: true,
      id: stored.id,
      retentionDays: auditRetentionDays,
      retentionExpiresAt: stored.retentionExpiresAt,
    });
  } catch (error) {
    return res.status(503).json({ error: 'Could not record the audit request.' });
  }
});

app.patch('/api/audit/requests/:id', async (req, res) => {
  const session = await requireAuditOwner(req, res);
  if (!session) return;
  if (!passesOriginCheck(req)) return res.status(403).json({ error: 'Origin not allowed.' });
  if (!passesCsrfCheck(req, session)) return res.status(403).json({ error: 'CSRF check failed.' });

  const { id } = req.params;
  if (!isAuditRequestId(id)) return res.status(400).json({ error: 'A valid request id is required.' });
  const status = typeof req.body?.status === 'string' ? req.body.status.trim() : '';
  if (!status) return res.status(400).json({ error: 'A status is required.' });

  try {
    const updated = await updateAuditRequestStatus(id, status);
    if (!updated) {
      return res.status(409).json({
        error: 'That status change is not allowed for this request.',
        allowed: AUDIT_STATUS_TRANSITIONS,
      });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ request: updated });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Could not update the audit request.' });
  }
});

app.delete('/api/audit/requests/:id', async (req, res) => {
  const session = await requireAuditOwner(req, res);
  if (!session) return;
  if (!passesOriginCheck(req)) return res.status(403).json({ error: 'Origin not allowed.' });
  if (!passesCsrfCheck(req, session)) return res.status(403).json({ error: 'CSRF check failed.' });

  const { id } = req.params;
  if (!isAuditRequestId(id)) return res.status(400).json({ error: 'A valid request id is required.' });

  try {
    const removed = await deleteAuditRequest(id);
    if (!removed) return res.status(404).json({ error: 'Audit request not found.' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ deleted: true, id });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Could not delete the audit request.' });
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
