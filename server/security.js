// Small, dependency-free security helpers shared by the Audit Inbox routes.
//
// Scope note: these helpers are defence-in-depth for a single-operator tool.
// They are NOT a substitute for platform controls. The in-process rate limiter
// is per-instance only: it resets on restart/redeploy and does not coordinate
// across instances, so it is not a global spending cap. CORS is intentionally
// not enabled anywhere in this app; same-origin policy is not authentication.

import crypto from 'node:crypto';

/**
 * Constant-time string comparison.
 *
 * Length is compared first (that leak is unavoidable and harmless for
 * fixed-length tokens), then both values are hashed to a fixed 32-byte digest so
 * timingSafeEqual never throws on a length mismatch.
 */
export function timingSafeEqualStrings(a, b) {
  const left = String(a ?? '');
  const right = String(b ?? '');
  if (left.length !== right.length) return false;
  const leftDigest = crypto.createHash('sha256').update(left, 'utf8').digest();
  const rightDigest = crypto.createHash('sha256').update(right, 'utf8').digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

/** SHA-256 hex digest. Used so a raw session token is never stored in Postgres. */
export function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

/** Cryptographically random URL-safe token, base64url encoded. */
export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** True when the request arrived over TLS, honouring a terminating proxy. */
export function isSecureRequest(req) {
  if (req?.secure === true) return true;
  // Every hop in X-Forwarded-Proto must be https: a single plaintext hop means
  // the request was not end-to-end encrypted, so the cookie must not be Secure
  // flagged on the assumption that it was.
  const hops = String(req?.headers?.['x-forwarded-proto'] || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return hops.length > 0 && hops.every((hop) => hop === 'https');
}

/** The browser-supplied Origin header, or '' when absent. */
export function requestOrigin(req) {
  return String(req?.headers?.origin || '').trim();
}

/**
 * Origin allowlist check for state-changing browser requests.
 *
 * Returns false when the allowlist is empty (fail closed): an unconfigured host
 * must not silently accept cross-origin writes.
 */
export function originAllowed(req, allowedOrigins = [], { allowMissing = true } = {}) {
  const origin = requestOrigin(req);
  if (!origin) return allowMissing;
  const allowed = (Array.isArray(allowedOrigins) ? allowedOrigins : [])
    .map((value) => String(value || '').trim().replace(/\/+$/, '').toLowerCase())
    .filter(Boolean);
  if (!allowed.length) return false;
  const normalized = origin.replace(/\/+$/, '').toLowerCase();
  return allowed.some((value) => {
    if (value === '*') return false; // never allow wildcard on state-changing routes
    if (value.startsWith('*.')) return false; // no suffix matching: be explicit
    return value === normalized;
  });
}

/** Parses the Cookie header into a plain object. Malformed pairs are skipped. */
export function parseCookies(req) {
  const header = req?.headers?.cookie;
  if (typeof header !== 'string' || !header) return {};
  const out = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    const value = part.slice(index + 1).trim();
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export function readCookie(req, name) {
  return parseCookies(req)[name] || '';
}

/**
 * Serializes a Set-Cookie header value.
 *
 * httpOnly defaults to true and sameSite defaults to 'strict'. `secure` must be
 * passed explicitly by the caller so it can be tied to the deployment mode.
 */
export function serializeCookie(name, value, options = {}) {
  const {
    httpOnly = true,
    secure = false,
    sameSite = 'strict',
    path = '/',
    maxAge,
    expires,
  } = options;
  const segments = [`${name}=${encodeURIComponent(String(value ?? ''))}`];
  if (path) segments.push(`Path=${path}`);
  if (Number.isFinite(maxAge) && maxAge >= 0) segments.push(`Max-Age=${Math.floor(maxAge)}`);
  else if (expires instanceof Date) segments.push(`Expires=${expires.toUTCString()}`);
  if (httpOnly) segments.push('HttpOnly');
  if (secure) segments.push('Secure');
  if (sameSite) {
    const normalized = String(sameSite).toLowerCase();
    segments.push(`SameSite=${normalized === 'none' ? 'None' : normalized === 'lax' ? 'Lax' : 'Strict'}`);
  }
  return segments.join('; ');
}

/**
 * Fixed-window in-process rate limiter.
 *
 * IMPORTANT: state lives in this process only. It does not survive a restart,
 * does not coordinate across instances, and is not a global spending cap. Use
 * platform-level quotas for that.
 */
export function createRateLimiter({ windowMs = 60_000, limit = 20, maxKeys = 5_000 } = {}) {
  const buckets = new Map();
  return {
    limit,
    windowMs,
    /** Returns { allowed, remaining, retryAfterSeconds }. */
    check(key, now = Date.now()) {
      const bucketKey = String(key || 'unknown');
      const existing = buckets.get(bucketKey);
      if (!existing || now - existing.startedAt >= windowMs) {
        if (buckets.size >= maxKeys) {
          for (const [name, value] of buckets) {
            if (now - value.startedAt >= windowMs) buckets.delete(name);
          }
        }
        if (buckets.size >= maxKeys) {
          // Fail closed rather than growing without bound: an oversized table
          // means the limiter can no longer be trusted.
          return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(windowMs / 1000) };
        }
        buckets.set(bucketKey, { startedAt: now, count: 1 });
        return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
      }
      if (existing.count >= limit) {
        const elapsed = now - existing.startedAt;
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil((windowMs - elapsed) / 1000)),
        };
      }
      existing.count += 1;
      return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
    },
    reset() {
      buckets.clear();
    },
  };
}

/** Best-effort client IP for rate-limit keys. Never used for authorization. */
export function clientKey(req) {
  return String(req?.ip || req?.socket?.remoteAddress || 'unknown');
}

/**
 * Rate limiter for the Google Places routes.
 *
 * `/api/places/search` can proxy up to three Places Text Search pages per
 * request, so an unauthenticated caller could drive unbounded Places spend.
 * This is a backstop, NOT a substitute for a Google Cloud quota cap.
 *
 * Default 20 requests/minute per client — far above any realistic operator
 * click rate, so normal behaviour is unchanged. Set PLACES_RATE_LIMIT_PER_MIN=0
 * to disable and restore the previous unlimited behaviour exactly.
 */
export const PLACES_DEFAULT_PER_MINUTE = 20;

export function createPlacesRateLimiter() {
  const raw = String(process.env.PLACES_RATE_LIMIT_PER_MIN ?? '').trim();
  const parsed = Number.parseInt(raw, 10);
  // Only an explicit 0 disables the limiter. An unparseable or negative value
  // falls back to the default, so a typo cannot silently remove protection.
  let perMinute = PLACES_DEFAULT_PER_MINUTE;
  if (Number.isFinite(parsed) && parsed > 0) perMinute = Math.min(parsed, 1_000);
  else if (parsed === 0) perMinute = 0;

  const enabled = perMinute > 0;
  const limiter = createRateLimiter({
    windowMs: 60_000,
    limit: enabled ? perMinute : Number.MAX_SAFE_INTEGER,
  });
  return {
    enabled,
    limit: enabled ? perMinute : 0,
    windowMs: 60_000,
    check: (key, now) => limiter.check(key, now),
  };
}
