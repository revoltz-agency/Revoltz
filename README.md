# REVOLTZ AI + AgencyOS

REVOLTZ AI is the public marketing site. AgencyOS is the signed-in workspace for lead research and agency operations. The GitHub Pages build contains only the marketing site; the internal app is served by the Express deployment.

## AgencyOS lead sources

Find Leads offers three explicit choices:

- **Gemini AI + Google Maps grounding** is the default. The operator adds a Google AI Studio API key in Settings. The key stays in that browser's `sessionStorage` and is sent directly to Google's Gemini API when a search or AI action is run. Google controls model availability, quotas, and billing eligibility. No Gemini request runs automatically.
- **Google Places** is available only when `GOOGLE_MAPS_API_KEY` is configured on the server. The credential is never returned to the browser. Select Google Places and submit a search to call the Places API. Requests are rate-limited; Google Maps Platform charges may apply.
- **Demo sample** uses fictional records and makes no provider calls.

Manual lead creation and CSV import are available independently of provider configuration and do not make Google Places or Gemini requests. Imports are parsed and previewed locally before the operator confirms changes.

AgencyOS does not scrape Google Maps webpages or send messages. WhatsApp drafts and follow-up dates require explicit operator actions; the operator reviews and sends every message.

## Routes and builds

| Route | Purpose |
| --- | --- |
| `/` | Public marketing site. |
| `/agencyos` | Internal workspace in the Express deployment. Requires an AgencyOS account. |

The marketing GitHub Pages build uses `src/site-main.jsx` and does not include the AgencyOS app. Public-site audit submissions are sent to the configured AgencyOS API. Intake requires the database, owner password hash, enabled intake setting, and an exact allowed-origin configuration.

## Architecture and data

- **Frontend:** React 19 and Vite. The internal app is a single-page workspace.
- **Server:** Express 5 serves the workspace and its API routes. Workspace APIs require a signed-in user; state-changing workspace requests also check origin and CSRF tokens.
- **Google Places:** `POST /api/places/search` uses the official Places API (New), explicit field masks, and up to 50 results. Search is made only when selected and submitted. Saved Google Place IDs can be refreshed after an explicit action. Google listing content remains session-only; only IDs and user-entered CRM workflow data are saved.
- **Gemini:** Lead search uses Google Maps grounding. Other AI-assisted tools use Gemini JSON generation. The API key is user-provided and held in the current browser session.
- **Website check:** `POST /api/website/analyze` inspects bounded public HTML for observable signals. It applies SSRF protections, redirect checks, timeouts, content-type checks, and response-size limits. It is not a visual, accessibility, security, or full conversion audit.
- **Workspace persistence:** Each account has a separate PostgreSQL-backed workspace snapshot. The browser syncs its namespaced local storage to that account when online. Sync is best-effort; simultaneous edits to the same account from multiple devices can conflict.
- **Audit Inbox:** Public audit requests are stored separately from prospect CRM data. Owner access uses server-side sessions and CSRF protection. Expired requests are purged opportunistically when the inbox is opened; no scheduled production cleanup is claimed here.

## Local setup

Requirements: Node.js `^22.22.0` or `^24.0.0` (the repository pins 22.22.3), npm, and PostgreSQL if you want account/workspace persistence or the Audit Inbox.

```bash
npm ci
cp .env.example .env
npm run dev
```

Open the URL printed by the server (default `http://localhost:5173`). Set `DATABASE_URL` to enable accounts. Without it, workspace registration and sign-in return an unavailable response. Gemini search requires a user-entered key in Settings. Google Places is optional and stays unavailable until a server-side key is configured.

To build and run the production server:

```bash
npm run build
npm start
```

The `npm start` script sets production mode in a cross-platform Node script and works from Windows and POSIX shells.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `GOOGLE_MAPS_API_KEY` | Optional, server-only Google Places API (New) key. Never use a `VITE_` variable for this credential. |
| `PLACES_RATE_LIMIT_PER_MIN` | Per-client limit for each Places route; defaults to 20 requests/minute. This is an instance-level backstop, not a global spend cap. Configure Google Cloud quotas and budget alerts as well. |
| `WEBSITE_AUDIT_RATE_LIMIT_PER_MIN` | Per signed-in workspace user limit for website audits; defaults to 10 requests/minute. Invalid or non-positive values fall back to the default; maximum is 1,000/minute. This is an instance-level backstop. |
| `PORT` | Express port; defaults to `5173`. |
| `DATABASE_URL` | PostgreSQL connection for accounts, workspace snapshots, sessions, and the Audit Inbox. |
| `DATABASE_SSL` | Optional database TLS override. Remote hosts require TLS by default. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Server-only Razorpay API credentials used to create subscription checkout links. Never expose the secret to the browser. |
| `RAZORPAY_PLAN_ID_STARTER` | Razorpay dashboard plan ID for the Starter subscription. Configure the plan's billing interval and amount in Razorpay before enabling checkout. |
| `RAZORPAY_WEBHOOK_SECRET` | Server-only secret configured for the Razorpay webhook endpoint; used to verify signed webhook payloads. |
| `AGENCYOS_BILLING_ENFORCED` | Set to `true` only after checkout and webhooks are verified; protected lead-search and website-audit APIs then require an active subscription. Defaults to `false` during rollout. |
| `AUDIT_OWNER_PASSWORD_HASH` | Scrypt hash for the Audit Inbox owner login. Generate locally with `npm run audit:hash-password`; never commit a real hash. |
| `AUDIT_PUBLIC_INTAKE_ENABLED` | Enables public audit submissions only when set to `true`; default is `false`. |
| `AUDIT_ALLOWED_ORIGINS` | Exact comma-separated origins allowed to submit public audit requests and make owner writes. |
| `AUDIT_RETENTION_DAYS` | Audit request retention interval; defaults to 89 days. |
| `AUDIT_SESSION_IDLE_MINUTES` / `AUDIT_SESSION_ABSOLUTE_MINUTES` | Audit owner session limits; defaults are 480 and 1440 minutes. |
| `TRUST_PROXY_HOPS` | Number of trusted reverse-proxy hops, for correct client IP rate limiting. |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Optional private Telegram notifications for accepted audit requests. Notifications do not replace database storage. |
| `VITE_AUDIT_API_BASE_URL` | Optional marketing-site build-time override for the AgencyOS audit intake API. |

Never commit credentials, database URLs, password hashes, or a populated `.env` file.

## Razorpay subscription setup

Billing routes remain unavailable until the four `RAZORPAY_*` variables above are configured on the server. Create a plan in the Razorpay dashboard with the intended monthly interval and price, then set its plan ID as `RAZORPAY_PLAN_ID_STARTER`. Keep API credentials and the webhook secret in the hosting provider's environment settings, not in frontend variables, repository files, or chat messages.

Configure the Razorpay webhook URL as `https://YOUR-API-HOST/api/webhooks/razorpay` and use the exact same webhook secret as `RAZORPAY_WEBHOOK_SECRET`. Subscribe to the subscription lifecycle events (created, authenticated, activated, charged, pending, halted, paused, updated, cancelled, completed, expired) and `invoice.payment_failed`. The handler verifies the signature against the raw request bytes and records event IDs transactionally to avoid applying duplicate deliveries twice. Subscription state updates also track the provider event timestamp so delayed deliveries do not normally overwrite newer state. Checkout attempts are serialized per organization, and an early webhook can be associated with the organization notes if it arrives before the checkout transaction commits.

`AGENCYOS_BILLING_ENFORCED` defaults to `false` so existing internal workspaces are not accidentally locked out during rollout. When set to `true`, protected lead-search and website-audit APIs return HTTP 402 unless the organization's webhook-confirmed subscription status is `active`. Module-level enable/disable checks remain server-enforced either way. Enable this switch only after checkout and webhook events have been tested end-to-end.

A signed-in organization owner can request a hosted checkout link through `POST /api/workspace/subscription/checkout` with the workspace CSRF token. This is a backend integration foundation, not confirmation that a live Razorpay account, plan, webhook, or production checkout has been configured. Test with Razorpay test credentials and test-mode plan IDs before switching to live mode.

## Audit Inbox setup

The inbox returns unavailable until both `DATABASE_URL` and `AUDIT_OWNER_PASSWORD_HASH` are configured. Local `.env.example` keeps public intake disabled by default. The Render Blueprint sets public intake to `true`; it also configures an exact origin allowlist. Review those values in the hosting dashboard before deployment. Audit requests are never emailed or messaged automatically.

Retention expiry is set on insert and enforced opportunistically when an owner opens the inbox. The repository includes suggested scheduled-cleanup mechanisms, but no scheduled job or production execution is verified here.

## Checks

```bash
npm test
npm run build
VITE_PUBLIC_SITE_ONLY=true npm run build -- --base=/Revoltz/
```

GitHub Actions runs these three checks on pull requests and pushes to `main`.

## Deployment

[`render.yaml`](render.yaml) is a Render Blueprint proposal; committing it does not create or change a cloud service. It expects secrets to be entered in the hosting dashboard. Verify the running deployment and provider status before treating any local change as live.

The GitHub Pages workflow builds the public marketing-only site at `/Revoltz/`. Its status is visible in the repository's Actions tab; a local build alone does not verify deployment.

## Important limitations

- Workspace sync is best-effort and does not resolve concurrent edits across devices.
- Account email verification, password reset, MFA, team sharing, billing, and account-deletion UI are not included.
- Gemini and Google Places access, pricing, quotas, and terms are controlled by Google. Calls happen only after the operator chooses an action, but a configured key may incur charges.
- Google Places use must follow current Maps Platform attribution, display, retention, and export requirements.
- Scores are explainable decision support, not guarantees. Demo data is fictional. Website checks inspect limited HTML and do not establish a business's actual needs.
- Review privacy, terms, and retention requirements for the jurisdictions where the service operates.
