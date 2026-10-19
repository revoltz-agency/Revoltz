import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getGooglePlaceDetails, searchGooglePlaces } from './googlePlaces.js';
import { auditWebsite } from './websiteAudit.js';
import { ensureSchema, isDatabaseConfigured, queryDatabase } from './db.js';
import { normalizeRazorpaySubscriptionStatus, razorpayConfig, razorpayWebhookEventId, verifyRazorpayWebhook } from './razorpay.js';
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
import { clientKey, createPlacesRateLimiter, createRateLimiter, originAllowed } from './security.js';
import { isMapsScraperJobId, normalizeMapsScraperCsv } from './mapsScraper.js';
import { notifyTelegramAuditRequest } from './telegram.js';
import {
  authenticateWorkspaceUser,
  clearWorkspaceCookies,
  createWorkspaceSession,
  registerWorkspaceUser,
  resolveWorkspaceSession,
  revokeWorkspaceSession,
  workspaceCsrfAllowed,
  workspaceCsrfCookie,
  workspaceOriginAllowed,
  workspaceSessionCookie,
  readWorkspaceState,
  writeWorkspaceState,
} from './workspaceAuth.js';

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
// Narrow CORS support for the public marketing site's enquiry form. The
// same exact-origin allowlist also protects state-changing Audit Inbox routes.
// No cookies or credentials are allowed for public intake.
const auditAllowedOrigins = () => String(process.env.AUDIT_ALLOWED_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

app.use('/api/audit/requests', (req, res, next) => {
  const origin = String(req.headers.origin || '').trim();
  if (!origin || !originAllowed(req, auditAllowedOrigins(), { allowMissing: false })) return next();
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  return next();
});

app.use(express.json({ limit: '2mb', verify: (req, res, buffer) => { if (req.originalUrl === '/api/billing/webhook') req.rawBody = Buffer.from(buffer); } }));

// --- Razorpay subscription billing -----------------------------------------
// Checkout is opt-in and fails closed until every required secret/plan is set.
// This endpoint creates a Razorpay subscription; it never marks an account paid.
// Only a signature-verified webhook may update subscription status.
app.get('/api/billing/config', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const config = razorpayConfig();
  return res.json({ configured: config.configured, enforcementEnabled: config.enforcementEnabled });
});

app.get('/api/billing/status', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = await requireWorkspaceUser(req, res);
  if (!session) return;
  if (!isDatabaseConfigured()) return workspaceUnavailable(res);
  try {
    await ensureSchema();
    const result = await queryDatabase(
      'SELECT razorpay_subscription_id, plan_id, status, short_url, current_start, current_end, updated_at FROM workspace_subscriptions WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1',
      [session.user.id],
    );
    const subscription = result.rows[0] || null;
    return res.json({ subscription: subscription ? { id: subscription.razorpay_subscription_id, planId: subscription.plan_id, status: subscription.status, shortUrl: subscription.short_url, currentStart: subscription.current_start, currentEnd: subscription.current_end, updatedAt: subscription.updated_at } : null, enforcementEnabled: razorpayConfig().enforcementEnabled });
  } catch { return workspaceUnavailable(res); }
});

app.post('/api/billing/subscribe', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = await requireWorkspaceUser(req, res);
  if (!session) return;
  if (!workspaceOriginAllowed(req)) return res.status(403).json({ error: 'Origin not allowed.' });
  if (!workspaceCsrfAllowed(req, session)) return res.status(403).json({ error: 'CSRF check failed.' });
  const config = razorpayConfig();
  if (!config.configured) return res.status(503).json({ error: 'Subscriptions are not configured yet. Please contact Revoltz support.' });
  try {
    await ensureSchema();
    const existing = await queryDatabase(
      "SELECT razorpay_subscription_id, status, short_url FROM workspace_subscriptions WHERE user_id = $1 AND status IN ('created', 'authenticated', 'active', 'pending') ORDER BY updated_at DESC LIMIT 1",
      [session.user.id],
    );
    if (existing.rows[0]?.short_url) return res.json({ subscriptionId: existing.rows[0].razorpay_subscription_id, shortUrl: existing.rows[0].short_url, status: existing.rows[0].status, reused: true });
    const response = await fetch('https://api.razorpay.com/v1/subscriptions', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(config.keyId + ':' + config.keySecret).toString('base64'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_id: config.planId, customer_notify: 1, total_count: 120, notes: { workspace_user_id: session.user.id, product: 'Revoltz AgencyOS' } }),
      signal: AbortSignal.timeout(15000),
    });
    const subscription = await response.json().catch(() => ({}));
    if (!response.ok || typeof subscription.id !== 'string' || typeof subscription.short_url !== 'string') {
      console.error('[billing] Razorpay subscription creation failed:', response.status);
      return res.status(502).json({ error: 'Razorpay could not create the subscription. Please try again later.' });
    }
    await queryDatabase(
      'INSERT INTO workspace_subscriptions (user_id, razorpay_subscription_id, plan_id, status, short_url, current_start, current_end) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (razorpay_subscription_id) DO NOTHING',
      [session.user.id, subscription.id, config.planId, normalizeRazorpaySubscriptionStatus(subscription.status), subscription.short_url, subscription.current_start ?? null, subscription.current_end ?? null],
    );
    return res.status(201).json({ subscriptionId: subscription.id, shortUrl: subscription.short_url, status: normalizeRazorpaySubscriptionStatus(subscription.status) });
  } catch (error) {
    console.error('[billing] Subscription setup failed:', error?.message || 'unknown error');
    return workspaceUnavailable(res);
  }
});

app.post('/api/billing/webhook', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const config = razorpayConfig();
  if (!config.configured || !verifyRazorpayWebhook(req.rawBody, req.headers['x-razorpay-signature'], config.webhookSecret)) {
    return res.status(400).json({ error: 'Invalid webhook signature.' });
  }
  const eventId = razorpayWebhookEventId(req.headers['x-razorpay-event-id']);
  const eventType = typeof req.body?.event === 'string' ? req.body.event : '';
  const entity = req.body?.payload?.subscription?.entity;
  if (!eventId || !eventType || typeof entity?.id !== 'string') return res.status(400).json({ error: 'Webhook payload is incomplete.' });
  const statusByEvent = {
    'subscription.authenticated': 'authenticated',
    'subscription.activated': 'active',
    'subscription.charged': 'active',
    'subscription.pending': 'pending',
    'subscription.halted': 'halted',
    'subscription.paused': 'paused',
    'subscription.resumed': 'active',
    'subscription.cancelled': 'cancelled',
    'subscription.completed': 'completed',
    'subscription.expired': 'expired',
  };
  const nextStatus = statusByEvent[eventType];
  if (!nextStatus) return res.status(200).json({ received: true, ignored: true });
  try {
    await ensureSchema();
    // Deduplicate and apply the event in one SQL statement. This prevents an
    // older redelivery from changing the subscription after a newer event has
    // already been processed, and keeps unknown subscriptions retryable.
    const outcome = await queryDatabase(
      `WITH known_subscription AS MATERIALIZED (
         SELECT razorpay_subscription_id
         FROM workspace_subscriptions
         WHERE razorpay_subscription_id = $1
       ),
       inserted_event AS (
         INSERT INTO razorpay_webhook_events (event_id, event_type)
         SELECT $5, $6 FROM known_subscription
         ON CONFLICT (event_id) DO NOTHING
         RETURNING event_id
       ),
       updated_subscription AS (
         UPDATE workspace_subscriptions
         SET status = $2,
             current_start = COALESCE($3, current_start),
             current_end = COALESCE($4, current_end),
             updated_at = now()
         WHERE razorpay_subscription_id = $1
           AND EXISTS (SELECT 1 FROM inserted_event)
         RETURNING razorpay_subscription_id
       )
       SELECT EXISTS (SELECT 1 FROM known_subscription) AS subscription_exists,
              EXISTS (SELECT 1 FROM inserted_event) AS event_inserted`,
      [entity.id, nextStatus, entity.current_start ?? null, entity.current_end ?? null, eventId, eventType],
    );
    const result = outcome.rows[0] || {};
    if (!result.subscription_exists) {
      console.warn('[billing] Webhook subscription row not found; requesting provider retry.');
      return res.status(503).json({ error: 'Subscription is not available yet. Please retry this webhook.' });
    }
    if (!result.event_inserted) return res.json({ received: true, duplicate: true });
    return res.json({ received: true, processed: true, eventId });
  } catch {
    return workspaceUnavailable(res);
  }
});

// --- Multi-user AgencyOS workspace accounts --------------------------------
const workspaceLoginLimiter = createRateLimiter({ windowMs: 10 * 60_000, limit: 10 });
const workspaceRegisterLimiter = createRateLimiter({ windowMs: 60 * 60_000, limit: 5 });

function workspaceUnavailable(res) {
  return res.status(503).json({ error: 'Workspace accounts are temporarily unavailable. Please try again later.' });
}
async function requireWorkspaceUser(req, res) {
  if (!isDatabaseConfigured()) { workspaceUnavailable(res); return null; }
  try {
    const session = await resolveWorkspaceSession(req);
    if (!session) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(401).json({ error: 'Please sign in to use this workspace.' });
      return null;
    }
    return session;
  } catch {
    workspaceUnavailable(res);
    return null;
  }
}

async function requireActiveSubscription(userId, res) {
  const config = razorpayConfig();
  if (!config.enforcementEnabled) return true;
  if (!config.configured || !isDatabaseConfigured()) {
    res.status(503).json({ error: 'Subscription verification is unavailable. Please contact support.' });
    return false;
  }
  try {
    await ensureSchema();
    const result = await queryDatabase(
      "SELECT 1 FROM workspace_subscriptions WHERE user_id = $1 AND status = 'active' AND (current_end IS NULL OR current_end >= EXTRACT(EPOCH FROM now())::bigint) LIMIT 1",
      [userId],
    );
    if (result.rows.length) return true;
    res.status(402).json({ error: 'An active AgencyOS subscription is required to use this workspace.', code: 'subscription_required' });
    return false;
  } catch {
    workspaceUnavailable(res);
    return false;
  }
}

app.post('/api/workspace/register', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDatabaseConfigured()) return workspaceUnavailable(res);
  if (!workspaceOriginAllowed(req)) return res.status(403).json({ error: 'Origin not allowed.' });
  const rate = workspaceRegisterLimiter.check(`register:${clientKey(req)}`);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
    return res.status(429).json({ error: 'Too many account attempts. Please try again later.' });
  }
  try {
    const user = await registerWorkspaceUser(req.body || {});
    const session = await createWorkspaceSession(user.id);
    const maxAge = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
    res.append('Set-Cookie', workspaceSessionCookie(session.token, req, maxAge));
    res.append('Set-Cookie', workspaceCsrfCookie(session.csrfToken, req, maxAge));
    return res.status(201).json({ user });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    return workspaceUnavailable(res);
  }
});

app.post('/api/workspace/login', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDatabaseConfigured()) return workspaceUnavailable(res);
  if (!workspaceOriginAllowed(req)) return res.status(403).json({ error: 'Origin not allowed.' });
  const rate = workspaceLoginLimiter.check(`login:${clientKey(req)}`);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
    return res.status(429).json({ error: 'Too many sign-in attempts. Please wait a few minutes.' });
  }
  try {
    const user = await authenticateWorkspaceUser(req.body || {});
    if (!user) return res.status(401).json({ error: 'Email or password is incorrect.' });
    const session = await createWorkspaceSession(user.id);
    const maxAge = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
    res.append('Set-Cookie', workspaceSessionCookie(session.token, req, maxAge));
    res.append('Set-Cookie', workspaceCsrfCookie(session.csrfToken, req, maxAge));
    return res.json({ user });
  } catch {
    return workspaceUnavailable(res);
  }
});

app.get('/api/workspace/me', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = await requireWorkspaceUser(req, res);
  if (!session) return;
  return res.json({ user: session.user });
});

app.post('/api/workspace/logout', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDatabaseConfigured()) return workspaceUnavailable(res);
  if (!workspaceOriginAllowed(req)) return res.status(403).json({ error: 'Origin not allowed.' });
  const session = await resolveWorkspaceSession(req, { renew: false }).catch(() => null);
  if (session && !workspaceCsrfAllowed(req, session)) return res.status(403).json({ error: 'CSRF check failed.' });
  await revokeWorkspaceSession(req).catch(() => false);
  for (const cookie of clearWorkspaceCookies(req)) res.append('Set-Cookie', cookie);
  return res.json({ ok: true });
});

app.get('/api/workspace/state', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = await requireWorkspaceUser(req, res);
  if (!session) return;
  if (!(await requireActiveSubscription(session.user.id, res))) return;
  try {
    return res.json(await readWorkspaceState(session.user.id));
  } catch {
    return workspaceUnavailable(res);
  }
});

app.put('/api/workspace/state', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = await requireWorkspaceUser(req, res);
  if (!session) return;
  if (!workspaceOriginAllowed(req)) return res.status(403).json({ error: 'Origin not allowed.' });
  if (!workspaceCsrfAllowed(req, session)) return res.status(403).json({ error: 'CSRF check failed.' });
  if (!(await requireActiveSubscription(session.user.id, res))) return;
  const state = req.body?.state;
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return res.status(400).json({ error: 'Workspace state must be an object.' });
  }
  let serialized;
  try { serialized = JSON.stringify(state); } catch { return res.status(400).json({ error: 'Workspace state is invalid.' }); }
  if (serialized.length > 1_000_000 || Object.keys(state).length > 250) {
    return res.status(413).json({ error: 'Workspace data is too large. Export a backup and remove old data before syncing.' });
  }
  const expectedRevision = req.body?.expectedRevision ?? null;
  if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)) {
    return res.status(400).json({ error: 'Workspace revision is invalid.' });
  }
  try {
    const result = await writeWorkspaceState(session.user.id, state, expectedRevision);
    return res.json({ ...result, updatedAt: new Date().toISOString() });
  } catch (error) {
    if (error?.statusCode === 400) return res.status(400).json({ error: error.message });
    if (error?.statusCode === 409) return res.status(409).json({ error: error.message });
    return workspaceUnavailable(res);
  }
});

// The internal lead-research APIs are available only to signed-in workspace users.
// Public marketing/audit-intake endpoints and the separate owner-only Audit Inbox
// retain their existing access rules.
app.use(['/api/places', '/api/website', '/api/maps-scraper'], async (req, res, next) => {
  const session = await requireWorkspaceUser(req, res);
  if (!session) return;
  if (!(await requireActiveSubscription(session.user.id, res))) return;
  req.workspaceUser = session.user;
  return next();
});

const googleApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim() || '';
const mapsScraperUrl = (process.env.GOOGLE_MAPS_SCRAPER_URL || '').trim().replace(/\/+$/, '');
const mapsScraperToken = (process.env.GOOGLE_MAPS_SCRAPER_TOKEN || '').trim();
const mapsScraperConfigured = () => Boolean(mapsScraperUrl && mapsScraperToken.length >= 32);
const mapsScraperHeaders = (headers = {}) => ({ ...headers, Authorization: `Bearer ${mapsScraperToken}` });
const mapsScraperLimiter = createRateLimiter({ windowMs: 60_000, limit: 3 });

// --- Audit Inbox configuration ---------------------------------------------
// Public intake remains opt-in via AUDIT_PUBLIC_INTAKE_ENABLED. It is only
// functional when the database, owner credential and exact allowed origins are configured.
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
    mapsScraperConfigured: mapsScraperConfigured(),
    // Booleans only: never a connection string, token, or password hash.
    auditInboxConfigured: auditInboxConfigured(),
    auditPublicIntakeEnabled,
    // Boolean only; never expose Telegram credentials to the browser.
    telegramNotificationsConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim()),
    // Non-secret: lets an operator confirm the Places backstop is active.
    placesRateLimitPerMinute: placesLimiter.limit,
  });
});


/**
 * The Maps scraper is an optional self-hosted gosom/google-maps-scraper service.
 * Keep its URL and bearer token server-side; the browser never receives either.
 * The scraper gateway requires a token because Render free web services cannot receive private traffic.
 */
app.post('/api/maps-scraper/jobs', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!mapsScraperConfigured()) return res.status(503).json({ error: 'Google Maps Scraper is not connected. Configure GOOGLE_MAPS_SCRAPER_URL and GOOGLE_MAPS_SCRAPER_TOKEN on the AgencyOS server.' });
  const rate = mapsScraperLimiter.check(`maps-scraper:${clientKey(req)}`);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
    return res.status(429).json({ error: 'Scraper job limit reached. Wait before starting another search.' });
  }
  const category = typeof req.body?.category === 'string' ? req.body.category.trim() : '';
  const location = typeof req.body?.location === 'string' ? req.body.location.trim() : '';
  const radiusKm = Number(req.body?.radiusKm);
  if (!category || category.length > 100 || !location || location.length > 160) {
    return res.status(400).json({ error: 'Add an industry/category and a city or location to search.' });
  }
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 50) {
    return res.status(400).json({ error: 'Search radius must be between 1 and 50 km.' });
  }
  try {
    // The current gosom REST API creates jobs with POST /api/v1/scrape
    // and accepts a singular keyword plus timeout in seconds.
    const scrapePayload = {
      keyword: `${category} in ${location}`,
      lang: 'en',
      // Keep free-tier Chromium memory and runtime bounded. Deeper searches
      // often restart small Render instances and surface as proxy-generated 502 HTML.
      max_depth: 2,
      radius: radiusKm,
      zoom: 15,
      timeout: 90,
    };
    const requestScrape = (path, payload) => fetch(`${mapsScraperUrl}${path}`, {
      method: 'POST',
      headers: mapsScraperHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12_000),
    });
    let upstream = await requestScrape('/api/v1/scrape', scrapePayload);
    // Some published Docker tags still expose the legacy job-creation route.
    // Fall back only on 405 (route/method mismatch), not on real scrape errors.
    if (upstream.status === 405) {
      await upstream.body?.cancel().catch(() => {});
      upstream = await requestScrape('/api/v1/jobs', {
        ...scrapePayload,
        name: scrapePayload.keyword,
        keywords: [scrapePayload.keyword],
        depth: scrapePayload.max_depth,
        max_time: 240,
      });
    }
    const responseText = await upstream.text().catch(() => '');
    let data = {};
    try { data = responseText ? JSON.parse(responseText) : {}; } catch { /* gateway may return plain-text errors */ }
    if (!upstream.ok) {
      const message = [data.message, data.error, typeof responseText === 'string' ? responseText.trim() : '']
        .find((value) => typeof value === 'string' && value.length > 0)?.slice(0, 240)
        || 'The Maps scraper rejected the search.';
      console.warn('[maps-scraper] job creation rejected', { status: upstream.status, message });
      return res.status(502).json({ error: `Maps scraper error (${upstream.status}): ${message}` });
    }
    const jobId = data.job_id || data.jobId || data.id;
    if (!isMapsScraperJobId(jobId)) {
      console.warn('[maps-scraper] invalid job response', { fields: Object.keys(data || {}) });
      return res.status(502).json({ error: 'The Maps scraper returned an invalid job ID. Check the scraper API version.' });
    }
    return res.status(202).json({ jobId, status: data.status || 'pending' });
  } catch (error) {
    console.warn('[maps-scraper] job creation request failed', { name: error?.name || 'Error', message: error?.message || 'unknown error' });
    return res.status(502).json({ error: 'Could not reach the Maps scraper service. Check its deployment and internal URL.' });
  }
});

app.get('/api/maps-scraper/jobs/:jobId', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!mapsScraperConfigured()) return res.status(503).json({ error: 'Google Maps Scraper is not connected.' });
  const jobId = req.params.jobId;
  if (!isMapsScraperJobId(jobId)) return res.status(400).json({ error: 'Invalid scraper job ID.' });
  const category = typeof req.query.category === 'string' ? req.query.category.slice(0, 100) : '';
  const location = typeof req.query.location === 'string' ? req.query.location.slice(0, 160) : '';
  const maxResults = Number(req.query.maxResults);
  if (!category || !location || !Number.isInteger(maxResults) || maxResults < 1 || maxResults > 50) {
    return res.status(400).json({ error: 'Search context is missing or invalid.' });
  }
  try {
    const upstream = await fetch(`${mapsScraperUrl}/api/v1/jobs/${encodeURIComponent(jobId)}`, {
      headers: mapsScraperHeaders({ Accept: 'application/json' }),
      signal: AbortSignal.timeout(12_000),
    });
    const responseText = await upstream.text().catch(() => '');
    let job = {};
    try { job = responseText ? JSON.parse(responseText) : {}; } catch { /* gateway may return plain-text errors */ }
    if (!upstream.ok) {
      const message = [job.message, job.error, responseText.trim()]
        .find((value) => typeof value === 'string' && value.length > 0)?.slice(0, 240)
        || 'The scraper rejected the job-status request without an error message.';
      console.warn('[maps-scraper] status request rejected', { status: upstream.status, message });
      // A 404 means the scraper no longer knows this job (for example, after
      // a free-host restart). Return a terminal state so the UI stops polling
      // instead of turning a lost job into a generic 502 loop.
      if (upstream.status === 404) {
        return res.json({
          jobId,
          status: 'failed',
          results: [],
          error: 'This scraper job is no longer available. Free hosting may have restarted the scraper; please run the search again.',
          retryable: true,
        });
      }
      return res.status(502).json({ error: `Maps scraper status error (${upstream.status}): ${message}` });
    }
    const rawStatus = String(job.status || 'pending').toLowerCase();
    if (['failed', 'cancelled', 'discarded'].includes(rawStatus)) {
      return res.json({ jobId, status: 'failed', error: job.error || 'The Maps scraper job failed.' });
    }
    // Some scraper builds expose results before the job reaches a terminal state.
    // Normalize available rows so the UI can show partial progress.
    const rawResults = Array.isArray(job.results) ? job.results : [];
    const seen = new Set();
    const results = [];
    for (const item of rawResults) {
      if (!item || typeof item !== 'object') continue;
      const name = String(item.title || item.name || item.place_name || '').trim();
      if (!name) continue;
      const mapsUrl = String(item.link || item.maps_url || item.google_maps_url || '').trim();
      const placeId = String(item.place_id || item.cid || item.data_id || '').trim();
      const address = String(item.address || '').trim();
      const key = (placeId || mapsUrl || `${name}|${address}`).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const numeric = (value) => {
        if (value == null || String(value).trim() === '') return null;
        const parsed = Number(String(value).replace(/,/g, '').trim());
        return Number.isFinite(parsed) ? parsed : null;
      };
      results.push({
        id: `maps-scraper-${key.replace(/[^a-z0-9_-]/gi, '-').slice(0, 180)}`,
        source: 'maps-scraper',
        name,
        category: String(item.category || category).trim(),
        city: location,
        address,
        phone: String(item.phone || '').trim(),
        website: String(item.website || item.web_site || '').trim(),
        mapsUrl,
        placeId,
        rating: numeric(item.review_rating ?? item.rating),
        reviews: numeric(item.review_count ?? item.reviews ?? item.reviews_count),
      });
      if (results.length >= maxResults) break;
    }
    return res.json({
      jobId,
      status: ['completed', 'complete'].includes(rawStatus) ? 'completed' : (rawStatus === 'pending' ? 'pending' : 'working'),
      results,
      warnings: ['Results are extracted by the self-hosted Google Maps scraper. Listings and contact details can change; verify before outreach.'],
      requests: 1,
      geocodingRequests: 0,
    });
  } catch (error) {
    console.warn('[maps-scraper] status request failed', { name: error?.name || 'Error', message: error?.message || 'unknown error' });
    return res.status(502).json({ error: 'Could not read results from the Maps scraper service.' });
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
    // Best-effort Telegram alert. The request is already saved; notification
    // failure must not turn a successful submission into a user-facing error.
    await notifyTelegramAuditRequest(values, stored);
    // 202: accepted for review. Email is not sent automatically.
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
