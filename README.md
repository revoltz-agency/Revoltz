# AgencyOS

AgencyOS is a responsive, dark-mode lead research and CRM MVP for an AI/web agency. It helps an operator search local businesses through the **OpenStreetMap lead finder** (no API key required; public services are shared and rate-limited) or the **official Google Places API (New)**, enrich public business details, qualify visible opportunities, review website signals, prepare evidence-based outreach drafts, and track follow-ups.

> **Safety by design:** AgencyOS does not scrape Google Maps webpages, bulk-send email, automatically message WhatsApp numbers, or send follow-ups in the background. Email and WhatsApp actions are explicit, per-lead user clicks. WhatsApp opening is gated on a user-confirmed opt-in.

### Server-side AI provider (BluesMinds)

The Express server exposes `POST /api/ai/generate` for server-side AI requests. This keeps the provider secret out of browser bundles and Git history.

Configure these variables in the **server host's environment** (never in frontend code or committed files):

- `BLUESMINDS_API_KEY` — secret key from your BluesMinds account.
- `BLUESMINDS_MODEL` — exact model ID enabled for your account.
- `BLUESMINDS_RESPONSES_URL` — optional override; defaults to `https://api.bluesminds.com/v1/responses`.

Request body: `{"prompt":"Your task..." }`. The endpoint returns `text`, `model`, and `usage`. Prompts are limited to 12,000 characters and the endpoint applies a basic per-IP limit of 12 requests/minute per server process. This in-memory guard is only a fallback; use deployment-level authentication and rate limiting before exposing the endpoint publicly. GitHub Pages is static hosting and cannot run this Express route by itself; deploy the server to a backend host and configure these environment variables there.

## Routes

| Route | What it is |
| --- | --- |
| `/` | The public **REVOLTZ AI** site: hero, capability strip, the AgencyOS product section (with a live workspace preview), services, process, and contact. |
| `/agencyos` | The **AgencyOS** workspace: lead finder, CRM, enrichment, website checks, CSV import/export, campaigns and settings. |

Both routes are served from one single-page bundle. Client-side routing is a thin
History API wrapper in `src/lib/router.js` — no Express routes were added or changed,
so every path still falls back to `index.html`.

- Site components and styles live in `src/site/` (`RevoltzSite.jsx`, `ProductPreview.jsx`, `site.css`).
- Workspace styles remain in `src/styles.css`; the site styles are scoped under `.rv-root` so neither surface affects the other.
- `src/components/leadPrimitives.jsx` holds the small lead badges shared by both surfaces.

## Architecture

- **Frontend:** React 19 + Vite; responsive single-page workspace.
- **Server:** Express 5 serves the Vite app in development and the static build in production. API keys and outbound API calls stay server-side.
- **Places search:** `POST /api/places/search` calls `https://places.googleapis.com/v1/places:searchText` with an explicit field mask and paginates up to 50 results (20 per request, at most three pages). Results are deduplicated by place ID. No wildcard field masks or Maps-page scraping are used. When a radius is selected, the server optionally geocodes the location through Google's Geocoding API and applies a Text Search location bias. Text Search bias is approximate, not a strict geographic boundary. `POST /api/places/details` is only called when an operator manually refreshes a saved place ID; the frontend caches each successful or failed request for the active app session.
- **OpenStreetMap search:** `POST /api/free/search` resolves the operator's location text through Nominatim, then runs one Overpass API query for businesses within the requested radius. No API key is required, but these public community services are shared and rate-limited. Operator category text is matched against a fixed allowlist of Overpass tag pairs; when nothing matches it falls back to a name search restricted to seven business tag keys. Category text can never reach the query directly, and fallback name tokens are reduced to `[a-z0-9]` so no regex metacharacter can be injected. Results are deduplicated by OSM object ID and sorted by distance from the resolved point.
- **Website check:** `POST /api/website/analyze` performs a constrained request to a public website and inspects a small HTML response for observable source signals, including link-text/URL evidence of an ordering link for food businesses. It includes SSRF safeguards, redirect checks, timeouts, content-type checks, and a 350 KB response limit. It is not a visual, accessibility, security, or full conversion audit.
- **OSM lead enrichment:** `POST /api/enrich` fetches an OSM lead's listed website first, extracts publicly listed business contact/profile details, and checks at most five pages total per enrichment run (the homepage plus up to four obvious same-site pages). It reuses DNS-pinned public HTTP(S) fetching with redirect, timeout, and response-size limits; Jina Reader is only a fallback. If no website is listed, Tavily is called only when the server has `TAVILY_API_KEY`; its exact-name + city/category candidates are fetched and verified against the business name before acceptance. Tavily is optional. Results are cached in server memory for 24 hours and saved as separate browser-local CRM enrichment fields, leaving existing user-entered/verified contact fields unchanged. Enrichment does not scrape Google Maps or collect named personal email addresses.
- **Qualification and draft generation:** A local, explainable rule engine scores source-appropriate observable signals; manually entered rating/review/social details are clearly identified as user-provided, and missing manual fields are treated as unknown. Message drafts use the supplied business details and any explicitly completed HTML check; no external LLM is used in this V1 so the product does not invent business claims. There is no AI-provider credential to configure.
- **CRM storage:** Google Places responses stay in browser memory for the active session and are not written to the server or browser storage. `localStorage` holds CRM workflow/enrichment fields, manually entered leads and explicit user-entered overrides, saved Google place IDs (which are exempt from Places caching restrictions), and recent user-entered search terms. Saved Google IDs are shown as placeholders after a reload; the operator explicitly refreshes a place to fetch current details. CSV export includes labeled manual/user-entered details, CRM workflow fields, and Google place IDs, but intentionally omits Google Places business listing content.

## Requirements

- Node.js 20 or later (tested with Node 22)
- npm
- No API key is required for OpenStreetMap search, manual lead entry, or CSV import. OpenStreetMap's public Nominatim/Overpass services are shared and rate-limited; these flows make no Google Places API call.
- Google Maps Platform credentials only if you want Google Places lead search.

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

Open the URL printed by the server (default `http://localhost:5173`). When Google Places is not configured, the Lead Finder defaults to OpenStreetMap; its shared public Nominatim/Overpass services require no API key but are rate-limited. **Add Manual Lead** and **Import CSV** are also available without a Google Places key. The fictional sample dataset is an explicit source choice, uses reserved `.example` website placeholders, and is never fetched or contactable.

Run the checks/build:

```bash
npm test
npm run build
npm audit --omit=dev
```

## Environment variables

Copy `.env.example` to `.env` for local development. `.env` is ignored by Git.

| Variable | Required | Purpose |
| --- | --- | --- |
| `GOOGLE_MAPS_API_KEY` | No (Google search only) | Server-only Google Maps Platform key. Enable Places API (New). Geocoding API is optional for radius bias. |
| `PORT` | No | Express server port; defaults to `5173`. |
| `FREE_LEAD_SEARCH` | No | Set to `off` to disable OpenStreetMap search. No API key is required, but public services are shared and rate-limited. Defaults to `on`. |
| `OVERPASS_API_URL` | No | Override the Overpass endpoint (default `https://overpass-api.de/api/interpreter`). |
| `NOMINATIM_API_URL` | No | Override the Nominatim geocoding endpoint (default `https://nominatim.openstreetmap.org/search`). |
| `OSM_USER_AGENT` | No | User-Agent sent to OpenStreetMap services; set to your own app name and contact for production. |
| `OVERPASS_TIMEOUT_MS` | No | Overpass request timeout in milliseconds. Defaults to `30000`. |
| `TAVILY_API_KEY` | No | Optional server-only website discovery for OSM leads without a listed website. The basic enrichment workflow does not require it. |

Never place the Google or Tavily key in a `VITE_*` variable, frontend code, browser storage, a checked-in file, or a public client bundle. These optional credentials are read by the server only; the Tavily key is used only to discover a missing OSM website. The Settings screen reports whether the Google Places variable is present; an actual search confirms its API permissions.

## Google Places API setup

1. Create/select a project in Google Cloud Console and enable billing according to Google's current requirements.
2. Enable **Places API (New)**. For actual radius bias, also enable the **Geocoding API**; otherwise, search still uses the city in the Text Search query and tells you that radius could not be applied.
3. Create a server-side API key, restrict it to the required APIs, and add suitable server-side application restrictions for your deployment environment.
4. Set `GOOGLE_MAPS_API_KEY` in the local `.env` or deployment secret manager, then restart the server.
5. Run a small search and review Google Cloud quotas/billing. The search asks for only the business fields used in AgencyOS through an explicit `X-Goog-FieldMask`.

The UI shows the prescribed “Google Maps” text attribution alongside live listing content and includes context for search ranking and user-generated rating/review counts. See [Google's Places API policies and attribution guidance](https://developers.google.com/maps/documentation/places/web-service/policies). Google Maps Platform terms may impose attribution, display, use, and retention requirements that change over time; review current policies before production use. This MVP does not persist Places content, but your use of returned content, the UI, and exports must still follow the applicable provider terms.

## Product flows

- **Dashboard:** Pipeline counts, priority shortlist, and suggested follow-up queue.
- **Find Leads:** Choose a data source — **OpenStreetMap** (no key; shared/rate-limited public services), **Google Places** (when a key is configured), or the explicitly selected **Demo sample** — then run an industry/city/radius/result limit search (up to 50) with recent-search shortcuts and deduplicated results. OpenStreetMap results come from one Overpass query around the resolved city; Places results use paginated Places Text Search (New). The same page includes **Add Manual Lead** (business name, industry, city, website, phone, email, Google Maps URL, address, rating, review count, Instagram, Facebook, and notes) and a local **Import CSV** preview/validation flow. CSV imports detect likely duplicates by Maps URL, website domain, phone, and normalized business name plus city, then let you cancel, add anyway, or update existing records. Manual entry/import never scrapes Google Maps or makes a Places API call. Search results show their source, evidence, and potential service recommendation.
- **Leads:** Search/filter/sort, HOT/WARM/COLD priority bands, Manual / Google Places / OpenStreetMap / sample source labels, saved/removed leads, CRM checkboxes and bulk status/service/tag actions (never messaging), user-entered contact fields, score, notes, assigned service, estimate, and follow-up. OSM leads have an **Enrich Lead** action showing public contact/profile details with source, evidence, and confidence. Enrichment fields and workflow details persist in this browser; existing user-entered/verified contacts are preserved; Google Places business content does not.
- **Enrich Lead:** For OSM records, inspect the listed public website first and optionally up to four obvious same-site pages (five pages total). If the listing has no website, only a configured `TAVILY_API_KEY` enables exact business-name + city/category discovery; the candidate is fetched and verified before being stored. Jina Reader is a fallback for normal website fetch failures. Results expire from the server cache after 24 hours; the basic workflow needs no Tavily key.
- **Analyze Website:** Manual, per-lead source inspection. Dynamic content can be missed. Visual design freshness is deliberately reported as not assessed.
- **Generate Pitch:** Editable email and WhatsApp drafts based only on returned facts. Email copy/open requires a valid business email entered by the user, verified by the user, plus a per-lead contact-basis confirmation. WhatsApp copy/open requires a valid international-format business phone and explicit per-lead opt-in. Demo and Do Not Contact records cannot use channel actions. No action sends automatically; the operator must review and send in their own app. A future compliant mail provider belongs behind a server-side, single-recipient adapter that re-checks consent at send time; V1 intentionally has no send endpoint.
- **Campaigns:** Suggested Day 0 / Day 3 / Day 7 / Day 14 cadence, manually advanced and a dashboard overdue queue. Marking a lead contacted stores a timestamp and suggests the next date; there are no bulk-send or automated scheduling controls.
- **CRM statuses:** `NEW`, `RESEARCHED`, `CONTACTED`, `REPLIED`, `INTERESTED`, `CALL BOOKED`, `PROPOSAL`, `WON`, `LOST`, `DO NOT CONTACT`.
- **Export:** CSV uses spreadsheet-formula injection protection. It exports manually entered lead details and labeled CRM workflow fields; Google-sourced place IDs are identified separately while Google Places business names, categories, ratings, addresses, phone numbers, and URLs remain excluded.
- **Privacy / Terms:** In-app MVP notices explain local storage, external actions, responsibilities, and product limitations. These are placeholders, not legal advice.

## Manual lead import

The Lead Finder's **Add Manual Lead** form requires Business Name, Industry, and City; all remaining fields are optional. **Import CSV** accepts UTF-8 comma-separated files with a header row. Required headers are `Business Name`, `Industry`, and `City`; supported optional headers are `Website`, `Phone`, `Email`, `Google Maps URL`, `Address`, `Rating`, `Review Count`, `Instagram`, `Facebook`, and `Notes`. `Category` may be used instead of `Industry`, and `Name` may be used instead of `Business Name`.

CSV import validates rows and previews errors and likely duplicates before the operator confirms **Add anyway** or **Update existing**. Duplicate checks compare normalized Maps URLs, website domains, phone digits, and business name plus city. Blank optional data is shown as **Not provided** and does not count as a confirmed website/contact weakness. Imports are parsed locally in the browser (maximum 5 MB and 1,000 rows); manual creation/import makes no Google Places API request and does not visit or scrape any Maps URL. Manual lead details, explicit overrides, and CRM workflow fields are stored in that browser's local storage.

## OpenStreetMap lead search

OpenStreetMap search requires no API key and makes no Google Places calls. Nominatim and Overpass are public community services shared by many users, so requests are rate-limited and availability is not guaranteed. Select **OpenStreetMap** as the data source on the Find Leads page.

How it works:

1. The city/location text is resolved to coordinates with one **Nominatim** place lookup.
2. The industry/category is matched against a fixed allowlist of roughly 55 Overpass tag groups (`Dental clinics` → `amenity=dentist`, `Gyms` → `leisure=fitness_centre`, and so on).
3. One **Overpass** query fetches matching businesses within the radius. Results are deduplicated by OSM object ID and sorted by distance from the resolved point.
4. Each result is normalised into the same lead shape used everywhere else in AgencyOS, with `source: "osm"` and an `osm-node/12345`-style identifier that links to `openstreetmap.org`.

Categories with no fixed tag fall back to a case-insensitive **name search** limited to seven business tag keys (`amenity`, `shop`, `office`, `craft`, `leisure`, `tourism`, `healthcare`). Results are then approximate and are labelled as such in the UI.

**Security:** operator text never reaches the Overpass query. Tag keys and values come only from the allowlist and are re-validated against `^[a-z_]{2,32}$` / `^[a-z0-9_:]{1,40}$` before use; fallback name tokens are reduced to `[a-z0-9]{2,30}`, which removes every regex metacharacter.

**Honest limitations.** OpenStreetMap is community-maintained:

- **Coverage varies** by city and category. A short result list means thin map data, not a thin market.
- **No ratings, review counts, or operational status exist** in the source. These are left empty in the lead record rather than estimated, and the evidence panel states that they are absent rather than poor. The 100+ reviews and operational-status scoring signals therefore cannot fire for OSM leads.
- **A missing website is unknown, not proof of a gap.** It still counts as the strongest observable signal (no website listed), but it should be confirmed by a human before outreach.
- Unnamed map objects are skipped instead of being given a placeholder name.
- Both services are rate limited. `429` responses surface as an actionable "wait a moment" message, and a slow query returns a "try a smaller radius" timeout message.

Attribution is required: results display **© OpenStreetMap contributors** and link the [Open Database License](https://www.openstreetmap.org/copyright). Review the [Overpass API](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) and [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) usage policies before heavy or production use.

## Deployment

Build and run the Express server in production mode:

```bash
npm ci
npm run build
PORT=3000 npm start
```

Provide `GOOGLE_MAPS_API_KEY` through your host's secret/environment manager, not a frontend build argument. Terminate TLS at your hosting platform or reverse proxy. The server binds to `0.0.0.0`; the Vite development host allowlist includes Arena's `*.e2b.app` preview host.

### GitHub Pages (static build)

`.github/workflows/deploy.yml` builds the bundle with `--base=/Revoltz/` and publishes it to <https://revoltz-agency.github.io/Revoltz/> on every push to `main` (or via a manual run). The repository setting **Settings → Pages → Source: GitHub Actions** must be selected. `src/lib/router.js` derives its path prefix from the Vite base, so the same code serves `/` on the Express server and `/Revoltz/` on Pages, with `dist/404.html` covering history-route deep links. The static build ships no Express API: live OpenStreetMap/Google search, enrichment and website checks are unavailable there, and the workspace falls back to the demo and manual leads with browser-local CRM storage.

**Important production limitation:** V1 has no accounts, authentication, authorization, shared database, server-side audit log, or multi-tenant boundary. Do not expose a public instance with prospect or CRM data without adding appropriate authentication/access controls and reviewing rate limits, privacy notices, retention/deletion, and deployment security. Local workflow fields are browser-specific and are lost if that browser's storage is cleared.

## Compliance and limitations

- There is no Google Maps webpage scraping, automatic bulk outreach, unofficial WhatsApp API, or background message sending.
- The operator is responsible for a lawful basis for email outreach, honoring opt-outs, and getting WhatsApp opt-in before opening a WhatsApp conversation. The in-app contact check is an operator confirmation, not legal verification.
- Enrichment reads only public business websites, applies SSRF protection and strict fetch limits, skips Google Maps pages, and does not collect named personal email addresses. Normal fetching is attempted first; optional Jina Reader and Tavily services may receive the requested public website URL or exact business name/city/category as needed.
- Google Places does not return business email in this field set. OSM enrichment can surface only publicly listed shared/role-based business email addresses; named personal mailboxes are ignored. An enriched address is not user-verified and stays separate from the outreach email until the operator chooses to use and verify it.
- Scores are deterministic and explainable, not predictive guarantees. Raw factor points are normalized to 0–100 because mutually exclusive website signals cap the raw sum at 70. The drawer shows raw and normalized values.
- “Active” means Google returned `OPERATIONAL` on a Google-sourced lead; manual records default to business status **Not provided**. An operational status does not prove a business is currently open. Website checks are limited to public HTML signals and do not claim visual or design findings.
- Demo values are fictional. Do not use them as real prospects.
- Google Places results are session-only in this app. CRM workflow data, manually entered leads, and explicit manual overrides are local to the browser. CSV exports include manual/user-entered details but intentionally omit Google Places and OpenStreetMap listing content (only the source identifier is exported); verify current Google and ODbL policies before changing retention, display, or export behavior.
- OSM listing results remain session-only and are covered by the ODbL: keep the “© OpenStreetMap contributors” attribution visible wherever listing data is displayed, and review the Overpass and Nominatim usage policies before heavy use. Enrichment and CRM workflow fields are stored separately in browser-local storage; CSV export does not include OSM/enrichment listing details.
- Before a public launch, replace the policy placeholders with jurisdiction-specific legal text and a real agency contact address.

## API routes

- `GET /api/config` — reports whether a server-side Places key is present and whether OpenStreetMap search is enabled; never returns credentials.
- `POST /api/free/search` — OpenStreetMap lead search. Validates input, geocodes the location via Nominatim, runs one allowlisted Overpass query, and returns normalised leads with attribution and coverage warnings. Makes no Google Places call and needs no API key; public services are shared and rate-limited.
- `POST /api/places/search` — validates search input and proxies up to three official Places Text Search pages (maximum 50 results) with an explicit field mask.
- `POST /api/places/details` — refreshes one saved place ID using a minimal explicit field mask; called only after an operator action.
- `POST /api/enrich` — enriches an OSM lead from its public business website; optional Tavily discovery runs only when `TAVILY_API_KEY` is configured and verifies the candidate site before accepting it.
- `POST /api/website/analyze` — performs a constrained public-website HTML check.

Manual lead creation, validation, duplicate detection, and CSV parsing/import are client-side workflows; they have no server route and do not call Google Places. Website analysis and lead enrichment run only after an explicit per-lead click.
