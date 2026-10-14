# API access, abuse, and provider cost

This document reflects the current server routes in `server/index.js`. The public marketing site and AgencyOS workspace have different access rules.

## Route inventory

| Route | Access | External service | Cost or abuse control |
| --- | --- | --- | --- |
| `GET /api/config` | Public | None | Returns configuration booleans and the configured Places request limit; never returns credentials. |
| `/api/workspace/register`, `/login` | Public entry points | PostgreSQL | In-process limits: 5 registrations/hour and 10 login attempts per 10 minutes per client key. |
| `/api/workspace/me`, `/logout`, `/state` | Signed-in workspace session | PostgreSQL | HttpOnly session cookie; state writes require exact-origin and session-bound CSRF checks. State size is bounded. |
| `/api/places/search`, `/details` | Signed-in workspace session | Google Places; optional Geocoding | Per-client in-process limit, separately counted for search and details; default 20 requests/minute per route. Calls can incur Google charges. |
| `/api/website/analyze` | Signed-in workspace session | Public website fetch | SSRF, redirect, timeout, content-type, and response-size safeguards. |
| `/api/audit/config` | Public | None | Returns booleans only. |
| `POST /api/audit/requests` | Public only when enabled | PostgreSQL; optional Telegram | Requires enabled intake and an exact allowlisted Origin; rate-limited to 5 submissions/hour per client. Telegram is optional and failures do not cancel database intake. |
| `/api/audit/session` | Owner password | PostgreSQL | Rate-limited login, server-side session, HttpOnly cookies, origin and CSRF protections. |
| `GET/PATCH/DELETE /api/audit/requests*`, `/api/audit/retention` | Owner session | PostgreSQL | Session, exact-origin and CSRF checks for writes; parameterized SQL and validated identifiers/statuses. |

Gemini calls do not pass through the Express server. The user supplies a Gemini API key in Settings; the browser keeps it in session storage and makes requests directly to Google's API only after an explicit user action. Usage, quotas, and billing eligibility are controlled by the user's Google project.

## Google Places cost controls

`GOOGLE_MAPS_API_KEY` is optional and server-only. Without it, Places routes return `503`. The key is not included in `/api/config` or frontend bundles. The UI requires the operator to select Google Places and submit a search. Saved-place details are requested only after an explicit refresh.

`PLACES_RATE_LIMIT_PER_MIN` defaults to 20 per minute, independently for `/api/places/search` and `/api/places/details`. The limit is held in process memory and resets on restart; it is not a global spending cap. Configure Google Cloud API restrictions, quotas, and budget alerts for the key as well.

The limit can be set to a positive integer up to 1000. Unset, blank, or malformed values use 20. Setting it to `0` disables this backstop and is not recommended for an internet-facing service.

## Scope and limitations

- Workspace search, details, and website-analysis routes require an authenticated workspace session. App-level rate limits are per server instance and are not a substitute for platform controls.
- `TRUST_PROXY_HOPS` must match the deployment proxy chain for `req.ip` to represent the client. The Render Blueprint sets it to one for Render's edge.
- The global JSON parser accepts up to 2 MB; each workspace snapshot is separately limited by entry count and serialized size.
- Public audit intake is disabled in `.env.example` and enabled in the Render Blueprint. It remains unavailable unless its database, owner credential, and origin allowlist are configured. Review those production settings before exposing the form.
- No paid-provider call is made by loading the app, opening Settings, using manual lead entry/import, or using Demo sample. Provider calls occur only after explicit searches or AI actions.
- In-process limits reset on redeploy and do not coordinate across multiple server instances. Use provider-side quotas and hosting-level protections where appropriate.
