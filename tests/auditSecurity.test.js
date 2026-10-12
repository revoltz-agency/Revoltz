import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clientKey,
  createPlacesRateLimiter,
  createRateLimiter,
  isSecureRequest,
  originAllowed,
  parseCookies,
  randomToken,
  requestOrigin,
  serializeCookie,
  sha256Hex,
  timingSafeEqualStrings,
} from '../server/security.js';
import {
  CSRF_COOKIE,
  MIN_PASSWORD_LENGTH,
  SESSION_COOKIE,
  allowedOrigins,
  buildClearCookies,
  buildCsrfCookie,
  buildSessionCookie,
  hashOwnerPassword,
  isOwnerAuthConfigured,
  passesCsrfCheck,
  passesOriginCheck,
  sessionAbsoluteMs,
  sessionIdleMs,
  verifyOwnerPassword,
} from '../server/session.js';

const ORIGINAL_ENV = { ...process.env };

function withEnv(patch, fn) {
  const saved = {};
  for (const [key, value] of Object.entries(patch)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test.after(() => { process.env = ORIGINAL_ENV; });

// ---------------------------------------------------------------------------
// Timing-safe primitives
// ---------------------------------------------------------------------------

test('timingSafeEqualStrings compares correctly and never throws on length mismatch', () => {
  assert.equal(timingSafeEqualStrings('abc', 'abc'), true);
  assert.equal(timingSafeEqualStrings('abc', 'abd'), false);
  assert.equal(timingSafeEqualStrings('', ''), true);
  assert.equal(timingSafeEqualStrings('abc', 'abcd'), false);
  assert.equal(timingSafeEqualStrings('abcd', 'abc'), false);
  for (const value of [undefined, null, 42, {}]) {
    assert.equal(timingSafeEqualStrings(value, 'x'), false);
    assert.equal(timingSafeEqualStrings('x', value), false);
  }
});

test('sha256Hex is stable and randomToken is unpredictable', () => {
  assert.equal(sha256Hex('a').length, 64);
  assert.equal(sha256Hex('a'), sha256Hex('a'));
  assert.notEqual(sha256Hex('a'), sha256Hex('b'));

  const tokens = new Set(Array.from({ length: 50 }, () => randomToken(32)));
  assert.equal(tokens.size, 50);
  for (const token of tokens) {
    assert.match(token, /^[A-Za-z0-9_-]+$/);
    assert.ok(token.length >= 43, '32 random bytes, base64url encoded');
  }
});

// ---------------------------------------------------------------------------
// Cookie hardening (D2)
// ---------------------------------------------------------------------------

test('session cookies are HttpOnly, Secure-in-production and SameSite=Strict', () => {
  const secureReq = { secure: true, headers: {} };
  const value = buildSessionCookie('token-value', secureReq, 3600);
  assert.match(value, /^agencyos_audit_session=token-value;/);
  assert.match(value, /HttpOnly/);
  assert.match(value, /Secure/);
  assert.match(value, /SameSite=Strict/);
  assert.match(value, /Path=\//);
  assert.match(value, /Max-Age=3600/);
});

test('session cookies omit Secure off-TLS so a local dev login still works', () => {
  const value = buildSessionCookie('t', { secure: false, headers: {} }, 60);
  assert.doesNotMatch(value, /Secure/);
  assert.match(value, /HttpOnly/);
});

test('Secure is inferred from X-Forwarded-Proto behind a TLS-terminating proxy', () => {
  assert.equal(isSecureRequest({ headers: { 'x-forwarded-proto': 'https' } }), true);
  assert.equal(isSecureRequest({ headers: { 'x-forwarded-proto': 'https, https' } }), true);
  // A single plaintext hop means the request was not end-to-end encrypted.
  assert.equal(isSecureRequest({ headers: { 'x-forwarded-proto': 'http, https' } }), false);
  assert.equal(isSecureRequest({ headers: { 'x-forwarded-proto': 'http' } }), false);
  assert.equal(isSecureRequest({ headers: {} }), false);
  assert.match(buildSessionCookie('t', { headers: { 'x-forwarded-proto': 'https' } }, 60), /Secure/);
});

test('the CSRF cookie is readable by the SPA but the session cookie is not', () => {
  const req = { secure: true, headers: {} };
  assert.doesNotMatch(buildCsrfCookie('c', req, 60), /HttpOnly/);
  assert.match(buildCsrfCookie('c', req, 60), /SameSite=Strict/);
  assert.match(buildSessionCookie('s', req, 60), /HttpOnly/);
  assert.equal(SESSION_COOKIE, 'agencyos_audit_session');
  assert.equal(CSRF_COOKIE, 'agencyos_audit_csrf');
});

test('logout clears both cookies with an immediate Max-Age=0', () => {
  const cookies = buildClearCookies({ secure: true, headers: {} });
  assert.equal(cookies.length, 2);
  for (const cookie of cookies) {
    assert.match(cookie, /Max-Age=0/);
    assert.match(cookie, /=;/);
  }
  assert.ok(cookies.some((c) => c.startsWith(SESSION_COOKIE)));
  assert.ok(cookies.some((c) => c.startsWith(CSRF_COOKIE)));
});

test('cookie serialization escapes values and honours SameSite=Lax/None', () => {
  assert.match(serializeCookie('n', 'a b&c'), /^n=a%20b%26c;\s*Path=\//);
  assert.match(serializeCookie('n', 'v', { sameSite: 'lax' }), /SameSite=Lax/);
  assert.match(serializeCookie('n', 'v', { sameSite: 'none' }), /SameSite=None/);
  assert.doesNotMatch(serializeCookie('n', 'v', { httpOnly: false }), /HttpOnly/);
});

test('cookie parsing tolerates malformed headers', () => {
  const req = { headers: { cookie: 'a=1; b=hello%20world; broken; =novalue; c=' } };
  assert.deepEqual(parseCookies(req), { a: '1', b: 'hello world', c: '' });
  assert.deepEqual(parseCookies({ headers: {} }), {});
  assert.deepEqual(parseCookies({ headers: { cookie: 42 } }), {});
});

// ---------------------------------------------------------------------------
// Origin checking (D2) — additional requirement 7
// ---------------------------------------------------------------------------

test('Origin checking fails closed when no allowlist is configured', () => {
  withEnv({ AUDIT_ALLOWED_ORIGINS: undefined }, () => {
    const req = { headers: { origin: 'https://evil.example' } };
    assert.equal(originAllowed(req, allowedOrigins()), false);
    assert.equal(passesOriginCheck(req), false);
    // No Origin header: treated as a non-browser client, not as a mismatch.
    assert.equal(passesOriginCheck({ headers: {} }), true);
  });
});

test('Origin checking accepts only exact allowlisted origins and never wildcards', () => {
  withEnv({ AUDIT_ALLOWED_ORIGINS: 'https://app.example.com, https://app.example.com/' }, () => {
    assert.equal(passesOriginCheck({ headers: { origin: 'https://app.example.com' } }), true);
    assert.equal(passesOriginCheck({ headers: { origin: 'https://app.example.com/' } }), true);
    assert.equal(passesOriginCheck({ headers: { origin: 'https://evil.example' } }), false);
    assert.equal(passesOriginCheck({ headers: { origin: 'https://app.example.com.evil.test' } }), false);
    assert.equal(passesOriginCheck({ headers: { origin: 'http://app.example.com' } }), false);
  });
  withEnv({ AUDIT_ALLOWED_ORIGINS: '*' }, () => {
    assert.equal(passesOriginCheck({ headers: { origin: 'https://evil.example' } }), false);
  });
  withEnv({ AUDIT_ALLOWED_ORIGINS: '*.example.com' }, () => {
    assert.equal(passesOriginCheck({ headers: { origin: 'https://a.example.com' } }), false);
  });
});

test('requestOrigin reads only the header', () => {
  assert.equal(requestOrigin({ headers: { origin: ' https://x.example ' } }), 'https://x.example');
  assert.equal(requestOrigin({ headers: {} }), '');
});

// ---------------------------------------------------------------------------
// CSRF (D2)
// ---------------------------------------------------------------------------

test('CSRF requires the header to match the cookie AND the session-bound hash', () => {
  const { sha256Hex: hash } = { sha256Hex };
  const raw = 'csrf-token-value';
  const session = { csrfHash: hash(raw) };
  const good = { headers: { 'x-audit-csrf': raw, cookie: `${CSRF_COOKIE}=${raw}` } };
  assert.equal(passesCsrfCheck(good, session), true);

  // Header missing.
  assert.equal(passesCsrfCheck({ headers: { cookie: `${CSRF_COOKIE}=${raw}` } }, session), false);
  // Cookie missing.
  assert.equal(passesCsrfCheck({ headers: { 'x-audit-csrf': raw } }, session), false);
  // Header/cookie mismatch.
  assert.equal(passesCsrfCheck({ headers: { 'x-audit-csrf': 'other', cookie: `${CSRF_COOKIE}=${raw}` } }, session), false);
  // Cookie matches a different session.
  assert.equal(passesCsrfCheck(good, { csrfHash: hash('different') }), false);
  // No session.
  assert.equal(passesCsrfCheck(good, null), false);
});

// ---------------------------------------------------------------------------
// Owner credential (D2)
// ---------------------------------------------------------------------------

test('owner password verification is timing-safe and rejects malformed config', () => {
  const password = 'correct horse battery'; // >= MIN_PASSWORD_LENGTH
  const stored = hashOwnerPassword(password);
  assert.match(stored, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
  assert.ok(password.length >= MIN_PASSWORD_LENGTH);

  withEnv({ AUDIT_OWNER_PASSWORD_HASH: stored }, () => {
    assert.equal(isOwnerAuthConfigured(), true);
    assert.equal(verifyOwnerPassword(password), true);
    assert.equal(verifyOwnerPassword(`${password}x`), false);
    assert.equal(verifyOwnerPassword(''), false);
    // Too short: rejected before any hashing work.
    assert.equal(verifyOwnerPassword('short'), false);
    assert.equal(verifyOwnerPassword(undefined), false);
    assert.equal(verifyOwnerPassword(null), false);
  });

  for (const bad of ['', 'plaintext', 'md5$abc', 'scrypt$notsalt$nothash', 'scrypt$a$b$c']) {
    withEnv({ AUDIT_OWNER_PASSWORD_HASH: bad }, () => {
      assert.equal(isOwnerAuthConfigured(), false, bad);
      assert.equal(verifyOwnerPassword(password), false, bad);
    });
  }
  withEnv({ AUDIT_OWNER_PASSWORD_HASH: undefined }, () => {
    assert.equal(isOwnerAuthConfigured(), false);
    assert.equal(verifyOwnerPassword(password), false);
  });
});

test('password hashing uses a fresh salt each time', () => {
  const a = hashOwnerPassword('same-password-here');
  const b = hashOwnerPassword('same-password-here');
  assert.notEqual(a, b);
});

test('session lifetimes are bounded and configurable', () => {
  withEnv({ AUDIT_SESSION_IDLE_MINUTES: undefined, AUDIT_SESSION_ABSOLUTE_MINUTES: undefined }, () => {
    assert.equal(sessionIdleMs(), 480 * 60_000);
    assert.equal(sessionAbsoluteMs(), 1_440 * 60_000);
  });
  withEnv({ AUDIT_SESSION_IDLE_MINUTES: '30', AUDIT_SESSION_ABSOLUTE_MINUTES: '60' }, () => {
    assert.equal(sessionIdleMs(), 30 * 60_000);
    assert.equal(sessionAbsoluteMs(), 60 * 60_000);
  });
  withEnv({ AUDIT_SESSION_IDLE_MINUTES: 'nonsense', AUDIT_SESSION_ABSOLUTE_MINUTES: '-5' }, () => {
    assert.equal(sessionIdleMs(), 480 * 60_000);
    assert.equal(sessionAbsoluteMs(), 1_440 * 60_000);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting — and an explicit reminder of what it is NOT
// ---------------------------------------------------------------------------

test('the rate limiter enforces its window and then recovers', () => {
  const limiter = createRateLimiter({ windowMs: 1_000, limit: 3 });
  const key = 'client-1';
  assert.equal(limiter.check(key, 0).allowed, true);
  assert.equal(limiter.check(key, 10).allowed, true);
  assert.equal(limiter.check(key, 20).allowed, true);
  const blocked = limiter.check(key, 30);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds >= 1);
  // After the window elapses the bucket resets.
  assert.equal(limiter.check(key, 1_010).allowed, true);
  // Keys are independent.
  assert.equal(limiter.check('client-2', 30).allowed, true);
});

test('the rate limiter fails closed once its key table is full', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, limit: 5, maxKeys: 2 });
  assert.equal(limiter.check('a', 0).allowed, true);
  assert.equal(limiter.check('b', 0).allowed, true);
  assert.equal(limiter.check('c', 0).allowed, false);
  // Expired buckets are reclaimed on the next check inside a new window.
  assert.equal(limiter.check('a', 60_001).allowed, true);
});

test('the Places limiter defaults to 20/min and can be disabled exactly', () => {
  withEnv({ PLACES_RATE_LIMIT_PER_MIN: undefined }, () => {
    const limiter = createPlacesRateLimiter();
    assert.equal(limiter.enabled, true);
    assert.equal(limiter.limit, 20);
    assert.equal(limiter.windowMs, 60_000);
    // 20 requests from one client inside the window are all allowed.
    for (let i = 0; i < 20; i += 1) assert.equal(limiter.check('s:0', i).allowed, true);
    // The 21st is throttled...
    const throttled = limiter.check('s:0', 21);
    assert.equal(throttled.allowed, false);
    assert.equal(throttled.remaining, 0);
    assert.ok(throttled.retryAfterSeconds >= 1);
    // ...while a different client is unaffected: the limit is per client.
    assert.equal(limiter.check('s:1', 21).allowed, true);
    // Recovery after the window elapses.
    assert.equal(limiter.check('s:0', 60_001).allowed, true);
  });

  // 0 disables and restores the previous unlimited behaviour.
  withEnv({ PLACES_RATE_LIMIT_PER_MIN: '0' }, () => {
    const limiter = createPlacesRateLimiter();
    assert.equal(limiter.enabled, false);
    assert.equal(limiter.limit, 0);
    for (let i = 0; i < 10_000; i += 1) assert.equal(limiter.check('same-client', 0).allowed, true);
  });

  // Malformed values fall back to the safe default rather than disabling.
  for (const bad of ['nonsense', '-5', '', '  ']) {
    withEnv({ PLACES_RATE_LIMIT_PER_MIN: bad }, () => {
      const limiter = createPlacesRateLimiter();
      assert.equal(limiter.enabled, true, bad);
      assert.ok(limiter.limit > 0, bad);
    });
  }

  // Absurdly high values are capped so the limiter cannot be made meaningless.
  withEnv({ PLACES_RATE_LIMIT_PER_MIN: '99999999' }, () => {
    assert.equal(createPlacesRateLimiter().limit, 1_000);
  });
});

test('clientKey never throws and is only ever a rate-limit key', () => {
  assert.equal(clientKey({ ip: '10.0.0.1' }), '10.0.0.1');
  assert.equal(clientKey({ socket: { remoteAddress: '10.0.0.2' } }), '10.0.0.2');
  assert.equal(clientKey({}), 'unknown');
  assert.equal(clientKey(undefined), 'unknown');
});
