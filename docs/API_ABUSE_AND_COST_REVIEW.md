# Public API review — abuse and provider cost exposure

Review of every public route for abuse potential and provider spend. Written
alongside the Audit Inbox work (additional requirement 7).

**In-process rate limits and the absence of CORS are NOT authentication and NOT
global spending caps.** They are noted as what they are.

---

## 1. Route inventory

| Route | Auth | Paid provider | In-process limit | Cost exposure |
|---|---|---|---|---|
| `GET /api/config` | none | — | none | None. Returns booleans only. |
| `POST /api/ai/generate` | none | **BluesMinds** | 12 req/min per IP | **High** — billed per generation |
| `POST /api/free/search` | none | OSM Overpass + Nominatim | **none** | Reputation/rate-limit only (public, free) |
| `POST /api/places/search` | none | **Google Places** | **20 / min per client** (Stage 3) | **Medium** — up to 3 Text Search pages per call |
| `POST /api/places/details` | none | **Google Places** | **20 / min per client** (Stage 3) | **Low** — 1 details call per request |
| `POST /api/enrich` | none | **Tavily** (optional) + outbound fetch | **none** | **Medium** |
| `POST /api/website/analyze` | none | outbound fetch only | **none** | Low (bandwidth) |
| `POST /api/audit/session` | password | — | 5 / 10 min per IP | Low (scrypt CPU) |
| `POST /api/audit/requests` | **disabled** | — | 5 / hour per IP | Storage only |
| `GET/PATCH/DELETE /api/audit/*` | session | — | none | Storage only |

## 2. Paid providers default to OFF

All three paid integrations are **disabled unless a key is present**, and the
routes fail closed with `503`:

- **Google Places** — `GOOGLE_MAPS_API_KEY` unset → `/api/places/*` return 503.
- **BluesMinds** — `BLUESMINDS_API_KEY` + `BLUESMINDS_MODEL` unset → generation fails.
- **Tavily** — `TAVILY_API_KEY` unset → enrichment skips website discovery.

Nothing in this repository enables a paid provider by default. `render.yaml`
declares all three as `sync: false`, i.e. no value is committed.

## 3. Findings

### F1 — Places search and enrichment have no rate limit (HIGH → RESOLVED for Places, OPEN for enrichment)

`/api/places/search` proxies **up to three** Google Places Text Search pages per
request, so a single unauthenticated caller could previously drive unbounded
Places spend.

**Status: MITIGATED for Places in Stage 3.** `/api/places/search` and
`/api/places/details` are now fronted by a per-client limiter — see
[§3.1 Places limiter](#31-places-limiter-stage-3) below. The cost ceiling is
still provider-side: **this limiter is not a global cap**, so the deployment
mitigations underneath remain mandatory.

`/api/enrich` remains unthrottled (Tavily is off by default and enrichment is an
operator-only flow); it is tracked in §4.

**Mitigation required before any public deployment (still true):**

- Set a **Google Cloud budget alert and a hard quota cap** on Places requests.
- Restrict the API key by HTTP referrer / IP at the Google Cloud level.
- Enable a platform-level rate limit or WAF rule in front of the service.

### 3.1 Places limiter (Stage 3)

Added because `/api/places/*` are unauthenticated, cost money per call, and were
the only routes with **no** in-process limit at all.

| Property | Value |
|---|---|
| Applies to | `POST /api/places/search`, `POST /api/places/details` |
| Default limit | **20 requests / minute per client** |
| Window | 60 s fixed buckets |
| Buckets | `places-search` and `places-details` are counted **separately** |
| Key | `` `${bucket}:${clientKey(req)}` `` — same client key as the AI limiter |
| Order | Checked **before** the API-key check, so a misconfigured/unconfigured server is not hammered either |
| Response on block | `429`, JSON `{"error": "Places request limit reached (N/minute). Wait Xs and try again."}`, `Retry-After: X`, `Cache-Control: no-store` |

Configured with `PLACES_RATE_LIMIT_PER_MIN` (declared `sync: false` in
`render.yaml`, defaulted in `.env.example`, never committed):

| Value | Effect |
|---|---|
| unset, empty, whitespace | **20 / min** (new safe default) |
| `N` > 0 | N / min, capped at 1000 |
| malformed (`'nonsense'`, `'-5'`) | **20 / min** — a bad value must never silently disable protection |
| exactly `0` | **disabled** — byte-for-byte the pre-Stage-3 behaviour |

The current limit is exposed (non-secret) as `placesRateLimitPerMinute` on
`GET /api/config`, so the UI can surface it and operators can confirm the value.

**Behaviour change for operators.** The only user-visible difference is that a
caller exceeding 20 Places calls in a minute now gets `429` instead of a Places
response. Normal operator use is far below this. Anyone who needs the old
behaviour back can set `PLACES_RATE_LIMIT_PER_MIN=0`; the
`tests/auditSecurity.test.js` suite locks in both the default and the disable
path.

### F2 — In-process limiters are not global caps (MEDIUM)

`allowAiRequest()` (12/min) and the new Audit Inbox limiters are:

- **per instance** — they do not coordinate across instances;
- **reset on restart/redeploy**;
- **keyed on `req.ip`**, which is the proxy address unless `TRUST_PROXY_HOPS`
  is set (opt-in, default `0`).

They blunt casual abuse. They do not cap spend.

### F3 — CORS is not enabled, and that is not a control (INFORMATIONAL)

No `cors` middleware is registered, so browsers enforce same-origin. This
deters drive-by browser abuse but does **nothing** against curl, scripts or
server-side clients. It must not be cited as authentication.

### F4 — Authentication exists only on Audit Inbox routes (HIGH)

Every other route is unauthenticated. There are no accounts anywhere in the app
(unchanged from V1, and documented in the README's production limitation
notice). Do not expose a public instance that holds prospect or CRM data
without adding authentication and access control first.

### F5 — 32 kb JSON body limit (LOW, positive)

`express.json({ limit: '32kb' })` is already applied globally, which bounds
request-processing cost.

### F6 — SSRF protection on enrichment and website analysis (LOW, positive)

`server/enrich.js` and `server/websiteAudit.js` validate targets against
loopback, private, link-local and internal hostnames before fetching. Covered by
existing tests.

## 4. What would close the gaps

1. Authentication in front of every mutating/cost-bearing route (or a
   single-operator deployment behind a VPN / basic auth at the edge).
2. Platform-level rate limiting and spend caps (Render, Cloudflare, or a Google
   Cloud quota).
3. Apply `createRateLimiter()` to `/api/enrich` and `/api/free/search`, sized
   generously enough for normal operator use. (`/api/places/*` — done in Stage 3,
   see §3.1.)
4. Per-provider request logging so spend can be attributed.
5. Alerting on provider quotas.
