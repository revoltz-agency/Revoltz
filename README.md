# AgencyOS

AgencyOS is a responsive, dark-mode lead research and CRM MVP for an AI/web agency. It helps an operator search local businesses through the **official Google Places API (New)**, qualify visible opportunities, review website signals, prepare evidence-based outreach drafts, and track follow-ups.

> **Safety by design:** AgencyOS does not scrape Google Maps webpages, bulk-send email, automatically message WhatsApp numbers, or send follow-ups in the background. Email and WhatsApp actions are explicit, per-lead user clicks. WhatsApp opening is gated on a user-confirmed opt-in.

## Architecture

- **Frontend:** React 19 + Vite; responsive single-page workspace.
- **Server:** Express 5 serves the Vite app in development and the static build in production. API keys and outbound API calls stay server-side.
- **Places search:** `POST /api/places/search` calls `https://places.googleapis.com/v1/places:searchText` with an explicit field mask and paginates up to 50 results (20 per request, at most three pages). Results are deduplicated by place ID. No wildcard field masks or Maps-page scraping are used. When a radius is selected, the server optionally geocodes the location through Google's Geocoding API and applies a Text Search location bias. Text Search bias is approximate, not a strict geographic boundary. `POST /api/places/details` is only called when an operator manually refreshes a saved place ID; the frontend caches each successful or failed request for the active app session.
- **Website check:** `POST /api/website/analyze` performs a constrained request to a public website and inspects a small HTML response for observable source signals, including link-text/URL evidence of an ordering link for food businesses. It includes SSRF safeguards, redirect checks, timeouts, content-type checks, and a 350 KB response limit. It is not a visual, accessibility, security, or full conversion audit.
- **Qualification and draft generation:** A local, explainable rule engine scores only observed signals. Message drafts are generated from verified listing fields and any completed HTML check; no external LLM is used in this V1 so the product does not invent business claims. There is no AI-provider credential to configure.
- **CRM storage:** Places responses exist in browser memory for the active session and are not stored by the server or browser storage. `localStorage` holds CRM-only workflow fields keyed by place ID, saved Google place IDs (which are exempt from Places caching restrictions), and recent user-entered search terms only. Saved Google IDs are shown as placeholders after a reload; the operator explicitly refreshes a place to fetch current details. The CRM export includes labeled user-entered workflow fields and Google place IDs only; it intentionally omits Google business content.

## Requirements

- Node.js 20 or later (tested with Node 22)
- npm
- Google Maps Platform credentials only if you want live lead search. The app runs without them in Demo Mode.

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

Open the URL printed by the server (default `http://localhost:5173`). Demo Mode is automatic when `GOOGLE_MAPS_API_KEY` is empty. The app displays:

> Google Places API not configured — Demo Mode active.

The demo contains ten **fictional** Pune businesses. Their `.example` website URLs are reserved placeholders and are never fetched. Demo contact actions cannot reach real businesses.

Run the checks/build:

```bash
npm test
npm run build
```

## Environment variables

Copy `.env.example` to `.env` for local development. `.env` is ignored by Git.

| Variable | Required | Purpose |
| --- | --- | --- |
| `GOOGLE_MAPS_API_KEY` | No (live search only) | Server-only Google Maps Platform key. Enable Places API (New). Geocoding API is optional for radius bias. |
| `PORT` | No | Express server port; defaults to `5173`. |

Never place the Google key in a `VITE_*` variable, frontend code, browser storage, a checked-in file, or a public client bundle. The key is sent from the server to the Google APIs only. The Settings screen reports whether the environment variable is present; an actual search confirms whether Google's API permissions and quota are valid.

## Google Places API setup

1. Create/select a project in Google Cloud Console and enable billing according to Google's current requirements.
2. Enable **Places API (New)**. For actual radius bias, also enable the **Geocoding API**; otherwise, search still uses the city in the Text Search query and tells you that radius could not be applied.
3. Create a server-side API key, restrict it to the required APIs, and add suitable server-side application restrictions for your deployment environment.
4. Set `GOOGLE_MAPS_API_KEY` in the local `.env` or deployment secret manager, then restart the server.
5. Run a small search and review Google Cloud quotas/billing. The search asks for only the business fields used in AgencyOS through an explicit `X-Goog-FieldMask`.

The UI shows the prescribed “Google Maps” text attribution alongside live listing content and includes context for search ranking and user-generated rating/review counts. See [Google's Places API policies and attribution guidance](https://developers.google.com/maps/documentation/places/web-service/policies). Google Maps Platform terms may impose attribution, display, use, and retention requirements that change over time; review current policies before production use. This MVP does not persist Places content, but your use of returned content, the UI, and exports must still follow the applicable provider terms.

## Product flows

- **Dashboard:** Pipeline counts, priority shortlist, and suggested follow-up queue.
- **Find Leads:** Industry/city/radius/result limit search (up to 50), recent-search shortcuts, and deduplicated results. With no Places key it filters the fictional demo dataset; with a key it uses paginated Places Text Search (New). Results show the returned listing fields, Google Maps link, place ID, an evidence panel, and a potential service recommendation.
- **Leads:** Search/filter/sort, HOT/WARM/COLD priority bands, saved/removed leads, CRM checkboxes and bulk status/service/tag actions (never messaging), user-entered contact fields, score, notes, assigned service, estimate, and follow-up. Saved live place IDs persist locally; Google business content does not.
- **Analyze Website:** Manual, per-lead source inspection. Dynamic content can be missed. Visual design freshness is deliberately reported as not assessed.
- **Generate Pitch:** Editable email and WhatsApp drafts based only on returned facts. Email copy/open requires a valid business email entered by the user, verified by the user, plus a per-lead contact-basis confirmation. WhatsApp copy/open requires a valid public business phone and explicit per-lead opt-in. Demo and Do Not Contact records cannot use channel actions. No action sends automatically; the operator must review and send in their own app. A future compliant mail provider belongs behind a server-side, single-recipient adapter that re-checks consent at send time; V1 intentionally has no send endpoint.
- **Campaigns:** Suggested Day 0 / Day 3 / Day 7 / Day 14 cadence, manually advanced and a dashboard overdue queue. Marking a lead contacted stores a timestamp and suggests the next date; there are no bulk-send or automated scheduling controls.
- **CRM statuses:** `NEW`, `RESEARCHED`, `CONTACTED`, `REPLIED`, `INTERESTED`, `CALL BOOKED`, `PROPOSAL`, `WON`, `LOST`, `DO NOT CONTACT`.
- **Export:** CSV headers identify Google-sourced place IDs separately from user-entered CRM fields and use spreadsheet-formula injection protection. Business names, categories, ratings, addresses, phone numbers, and URLs are excluded.
- **Privacy / Terms:** In-app MVP notices explain local storage, external actions, responsibilities, and product limitations. These are placeholders, not legal advice.

## Deployment

Build and run the Express server in production mode:

```bash
npm ci
npm run build
PORT=3000 npm start
```

Provide `GOOGLE_MAPS_API_KEY` through your host's secret/environment manager, not a frontend build argument. Terminate TLS at your hosting platform or reverse proxy. The server binds to `0.0.0.0`; the Vite development host allowlist includes Arena's `*.e2b.app` preview host.

**Important production limitation:** V1 has no accounts, authentication, authorization, shared database, server-side audit log, or multi-tenant boundary. Do not expose a public instance with prospect or CRM data without adding appropriate authentication/access controls and reviewing rate limits, privacy notices, retention/deletion, and deployment security. Local workflow fields are browser-specific and are lost if that browser's storage is cleared.

## Compliance and limitations

- There is no Google Maps webpage scraping, automatic bulk outreach, unofficial WhatsApp API, or background message sending.
- The operator is responsible for a lawful basis for email outreach, honoring opt-outs, and getting WhatsApp opt-in before opening a WhatsApp conversation. The in-app contact check is an operator confirmation, not legal verification.
- Google Places does not return business email in this field set. Email is blank until the operator enters it; AgencyOS does not discover or verify email addresses.
- Scores are deterministic and explainable, not predictive guarantees. Raw factor points are normalized to 0–100 because mutually exclusive website signals cap the raw sum at 70. The drawer shows raw and normalized values.
- “Active” means Google returned `OPERATIONAL`; it does not prove a business is currently open. Website checks are limited to public HTML signals and do not claim visual or design findings.
- Demo values are fictional. Do not use them as real prospects.
- Google Places results are session-only in this app. CRM workflow data is local to the browser. CSV exports intentionally omit Places content; verify current Google policies before changing retention, display, or export behavior.
- Before a public launch, replace the policy placeholders with jurisdiction-specific legal text and a real agency contact address.

## API routes

- `GET /api/config` — reports whether a server-side Places key is present; never returns the key.
- `POST /api/places/search` — validates search input and proxies up to three official Places Text Search pages (maximum 50 results) with an explicit field mask.
- `POST /api/places/details` — refreshes one saved place ID using a minimal explicit field mask; called only after an operator action.
- `POST /api/website/analyze` — performs a constrained public-website HTML check.
