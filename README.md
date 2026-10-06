# AgencyOS

**A lead-generation and outreach assistant for a small AI/web agency.**

Find local businesses with the official **Google Places API (New)**, score them by how much they need your services, audit their website, draft personalised outreach, track them through a pipeline, and export the lot as CSV — with **no bulk sending, no WhatsApp automation, no Maps scraping, and no fabricated facts**.

It runs **fully without any API key** (Demo Mode) and never pretends an integration is configured when it isn't.

```
Google Places API not configured — Demo Mode active.
```

---

## Contents

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Google Places API (New) setup](#google-places-api-new-setup)
- [Architecture](#architecture)
- [Data model](#data-model)
- [Opportunity scoring](#opportunity-scoring)
- [Website analysis](#website-analysis)
- [Outreach generation](#outreach-generation)
- [API reference](#api-reference)
- [Testing](#testing)
- [Deployment](#deployment)
- [Compliance and safety](#compliance-and-safety)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)

---

## What it does

| Area | Capability |
| --- | --- |
| **Dashboard** | Total leads, high-priority leads, contacted, replies, meetings, won; pipeline / priority / activity charts; service mix; follow-ups due; top opportunities; campaign health; data-freshness panel. |
| **Find Leads** | Industry + city + radius + max-results search against Google **Text Search (New)**; live candidate preview with a score *before* you import; import into a campaign; Google attribution. |
| **Lead qualification** | Opportunity Score 0–100 from 7 evidence-backed factors, banded 🔥 High / 🟡 Medium / ⚪ Low, with a short reason and a data-coverage percentage. |
| **Website analysis** | "Analyze Website" → mobile-friendliness, CTAs, enquiry form, WhatsApp/contact flow, SEO basics, freshness, legacy stack, business info, page weight; site score, conversion issues and a "potential opportunity". |
| **Lead table** | Business, category, location, rating, reviews, website, phone, email, score, status, actions; filter by text/status/band/service/website/campaign, sort on every column, bulk status + bulk campaign. |
| **Outreach** | Email subject, email body and WhatsApp draft built only from verified lead data; copy, `mailto:` and `wa.me` deep links. |
| **CRM** | Notes, status history, last contacted, next follow-up, assigned service, estimated deal value, source. |
| **Follow-ups** | Day 0 / Day 3 / Day 7 suggested sequence, anchored on the next follow-up (or last contact, or today). Suggestions only — nothing is ever auto-sent. |
| **Campaigns** | Group leads, per-campaign stats, weighted pipeline value, editable sequence. |
| **Export** | CSV of your own prospecting data (leads + campaigns), with a UTF-8 BOM so Excel behaves. |
| **Suppression** | Do-not-contact list; setting a lead to `DO_NOT_CONTACT` adds it automatically. |

**10 lead statuses:** `NEW` · `RESEARCHED` · `CONTACTED` · `REPLIED` · `INTERESTED` · `CALL_BOOKED` · `PROPOSAL` · `WON` · `LOST` · `DO_NOT_CONTACT`
**6 services:** Website · AI Automation · AI Chatbot · Lead Generation · Social Media · Finance Automation

---

## Quick start

```bash
git clone https://github.com/revoltz-agency/Revoltz.git agencyos
cd agencyos
npm install
cp .env.example .env.local      # optional — the app runs without any keys
npm run dev                     # http://localhost:3000
```

That's it. With no `GOOGLE_PLACES_API_KEY` you get **Demo Mode**: 12 fictional Pune businesses (clearly labelled `Demo` everywhere), a working pipeline, working scoring, working CRM, working CSV export, and simulated website audits.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server on `0.0.0.0:3000`. |
| `npm run build` | Production build (also runs lint + type checking). |
| `npm start` | Serve the production build. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run smoke` | 139 HTTP assertions across every flow (needs a running app). |
| `npm run smoke:google` | 73 assertions against a **mock** Places API (New) — spawns its own app instance. |
| `npm run smoke:web` | 71 assertions for the **live** website analyzer against a local fixture site — spawns its own app instance. |

### A five-minute tour

1. **`/find`** — pick an example chip (e.g. *Dental clinics in Pune*), search in Demo Mode, review the candidates with their preview scores, tick a few, **Import leads**.
2. **`/leads`** — filter to 🔥 High, sort by score, open a lead.
3. **Lead page** — *Analyze Website*, then *Generate Pitch*, copy the email or open WhatsApp.
4. **CRM panel** — set status `CONTACTED`, add a note, pick a service, set a deal value.
5. **`/campaigns`** — create a campaign, attach leads, watch the weighted pipeline.
6. **`/leads` → Export CSV** — take your prospecting data with you.

---

## Environment variables

Everything is optional. Anything you leave empty simply degrades to a labelled fallback.

### Google Places API (New)

| Variable | Default | Notes |
| --- | --- | --- |
| `GOOGLE_PLACES_API_KEY` | *(empty)* | **The only thing that turns on live search.** Server-side only; never sent to the browser. |
| `GOOGLE_PLACES_REGION_CODE` | `IN` | ISO 3166-1 alpha-2; affects formatting and result bias. |
| `GOOGLE_PLACES_LANGUAGE_CODE` | `en` | BCP-47 language for names/addresses. |
| `GOOGLE_DATA_MAX_AGE_DAYS` | `30` | After this a stored snapshot is flagged stale; only `place_id` is kept long-term. |
| `GOOGLE_PLACES_BASE_URL` | `https://places.googleapis.com/v1` | Only for corporate egress proxies or tests. |

### AI provider (optional)

| Variable | Default | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | *(empty)* | Any OpenAI-compatible provider (OpenAI, OpenRouter, Groq, Azure-compatible, local Ollama…). |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | |
| `OPENAI_MODEL` | `gpt-4o-mini` | |
| `GEMINI_API_KEY` | *(empty)* | Google Gemini alternative. |
| `GEMINI_MODEL` | `gemini-2.0-flash` | |
| `AI_ENABLED` | `true` | Kill switch for all outbound AI calls. |

Provider auto-detection: `OPENAI_API_KEY` first, then `GEMINI_API_KEY`. **With no key, outreach and score reasoning are produced from deterministic templates over verified data and are labelled `generatedBy: "template"` in the API response and in the UI.** The app never claims AI ran when it didn't.

### Website analysis

| Variable | Default | Notes |
| --- | --- | --- |
| `WEBSITE_ANALYSIS_ENABLED` | `true` | Set `false` to disable all outbound fetching. |
| `WEBSITE_ANALYSIS_TIMEOUT_MS` | `10000` | |
| `WEBSITE_ANALYSIS_MAX_BYTES` | `786432` | ~750 KB cap; oversized pages are reported, not truncated silently. |
| `WEBSITE_ANALYSIS_USER_AGENT` | `AgencyOSBot/1.0 (+https://github.com/revoltz-agency/Revoltz; lead-research)` | Identifies itself, per polite-crawler conventions. |
| `WEBSITE_ANALYSIS_ALLOW_PRIVATE` | `false` | **Testing only.** Disables the SSRF guard so tests can fetch localhost fixtures. Leave `false` on any deployment other people can reach. |

### Agency defaults and storage

| Variable | Default | Notes |
| --- | --- | --- |
| `AGENCY_NAME` | `Revoltz` | Used in outreach copy; editable in Settings → Agency profile. |
| `AGENCY_SENDER_NAME` / `AGENCY_SENDER_EMAIL` | `Your Name` / `you@youragency.com` | |
| `AGENCY_WHATSAPP_NUMBER` | `919000000000` | Your business number, used for `wa.me` links. |
| `AGENCY_DEFAULT_CITY` | `Pune` | Prefills the finder. |
| `DEFAULT_COUNTRY_CODE` | `91` | Normalises lead phone numbers into `wa.me` links. |
| `DEFAULT_CURRENCY` | `INR` | Deal values. |
| `AGENCYOS_DATA_FILE` | `./data/agencyos.json` | JSON datastore location. |
| `AGENCYOS_SEED_DEMO` | `true` | Seeds the demo dataset on first boot. |

All agency/profile/pitch settings are **editable at runtime** in `/settings`; env vars only provide the first-run defaults.

---

## Google Places API (New) setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create or select a project.
2. **APIs & Services → Library** → search **"Places API (New)"** → **Enable**. (The legacy "Places API" is a different product and will not work with this code.)
3. **APIs & Services → Credentials → Create credentials → API key.**
4. Restrict the key: **Application restrictions** = your server IPs / HTTP referrers; **API restrictions** = *Places API (New)* only.
5. Put it in `.env.local` as `GOOGLE_PLACES_API_KEY=…` and restart. Billing must be enabled on the project for live calls.

### What the app sends

**Search** — `POST https://places.googleapis.com/v1/places:searchText`

```jsonc
{
  "textQuery": "Dental clinics in Pune",
  "maxResultCount": 10,          // 1–20
  "languageCode": "en",
  "regionCode": "IN",
  "locationBias": {              // only when you supply coordinates
    "circle": { "center": { "latitude": 18.5204, "longitude": 73.8567 }, "radius": 5000 }
  }
}
```

**Refresh** — `GET https://places.googleapis.com/v1/places/{place_id}` (same field mask).

Headers: `X-Goog-Api-Key` and `X-Goog-FieldMask`. **No wildcards anywhere** — the mask is exactly:

```
places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,
places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,
places.googleMapsUri,places.primaryType,places.primaryTypeDisplayName,places.types,
places.businessStatus,places.currentOpeningHours.openNow,places.priceLevel,nextPageToken
```

The refresh mask (`GET /v1/places/{place_id}`) is the same list without the `places.` prefix. Both are rendered live from the source constants in **Settings → Integrations**, so the disclosure can never drift from what the code actually sends.

> **Radius caveat:** Text Search (New) only supports a circular `locationBias` when you give it a centre point. The finder therefore offers optional latitude/longitude plus a "Use my location" button; if you type a radius without coordinates, the search still runs (text-only) and the UI tells you the radius was not applied.

### Google policy compliance

- Official endpoints only — **no Maps scraping, no HTML parsing of google.com, no unofficial clients.**
- The API key lives in `process.env` on the server. It is never rendered into HTML, never shipped in a client bundle, and `/api/status` returns only a boolean `configured` flag.
- Search results are shown **to you for selection**; they are only written to the datastore when you click *Import leads*.
- Google attribution is displayed next to any Google-derived data.
- **Nothing restricted is stored long-term.** Leads keep the `place_id` permanently and a timestamped snapshot of the public business fields; after `GOOGLE_DATA_MAX_AGE_DAYS` the record is flagged stale and *Refresh from Google* re-fetches it. **Maintenance → Purge stale place data** strips the snapshot and keeps only the `place_id`.
- CRM data (notes, status, deal value, follow-ups) is yours, and survives any refresh or purge.

---

## Architecture

**Next.js 15 (App Router) + TypeScript + Tailwind CSS 3.** No component library, no chart library, no icon package — every chart and icon is hand-rolled inline SVG, which keeps the shared client bundle at ~103 kB first load.

```
src/
├── app/
│   ├── page.tsx                  Dashboard (RSC) ── metrics computed server-side
│   ├── find/                     Lead finder
│   ├── leads/ + leads/[id]/      Pipeline table + lead workspace
│   ├── campaigns/ + [id]/        Campaign list + workspace
│   ├── settings/                 Integrations, agency, pitch defaults, data policy, suppression
│   ├── privacy/ + terms/         Legal pages
│   └── api/                      21 route handlers (JSON, zod-validated)
├── components/
│   ├── layout/AppShell.tsx       Nav, toasts, global Demo Mode indicator
│   ├── ui/                       Design system: feedback, controls, display, charts, menu
│   ├── dashboard/ find/ leads/ campaigns/ outreach/ settings/
└── lib/
    ├── config.ts                 Env parsing (server-only) — never imported by client code
    ├── types.ts                  Domain types
    ├── validation.ts             Zod schemas shared by every route
    ├── api.ts / client/api.ts    Server error envelope + typed client fetcher
    ├── db/                       JSON store (atomic write), demo dataset, seeding
    ├── google/places.ts          Text Search (New) + Place Details (New), field masks, error mapping
    ├── scoring/opportunity.ts    7-factor opportunity model
    ├── analysis/                 ssrf, robots, html heuristics, orchestrator
    ├── ai/                       Provider-agnostic client + prompt builders
    ├── outreach/                 Pitch generation + follow-up sequencing
    ├── services/                 lead-search, website-analysis, lead-query (business logic)
    ├── metrics.ts csv.ts utils.ts sequence.ts server-status.ts
scripts/                          smoke.mjs, smoke-google-mock.mjs, smoke-website.mjs
```

### Design decisions

- **Pages are React Server Components** that read the store directly (`export const dynamic = 'force-dynamic'`), so there is no client-side water­fall and no key material reaches the browser. Interactions go through `apiFetch` to the JSON API.
- **All business logic lives in `src/lib/services`**, not in route handlers — the routes are thin adapters that validate, call a service, and shape the response. That is also what makes the integration tests possible.
- **Every error uses one envelope:** `{ ok: false, error: { code, message, hint } }`. The client turns it into `"message — hint"` in a toast.
- **No secrets in the client bundle.** `lib/config.ts` and `lib/db/defaults.ts` read `process.env` and are only imported from server code; the browser gets `ServerStatus` (booleans and labels) via props.
- **Storage is a single JSON file** written atomically (tmp file + `rename`) with a `globalThis` cache, falling back to memory on read-only filesystems. Swap it for Postgres/Prisma without touching the UI.

---

## Data model

```ts
Lead {
  id, placeId | null, isDemo, source: 'google_places' | 'manual' | 'import',
  place: {                      // timestamped snapshot of public business data
    displayName, formattedAddress, locality, nationalPhoneNumber, internationalPhoneNumber,
    websiteUri, rating, userRatingCount, googleMapsUri, primaryType, types,
    businessStatus, openNow, priceLevel, retrievedAt
  },
  email, emailSource, phone,
  score: { score, band, reason, factors[], maxScoreable, dataCoverage, calculatedAt },
  analysis: WebsiteAnalysis | null,
  crm: { status, notes[], statusHistory[], lastContactedAt, nextFollowUpAt,
         assignedService, estimatedDealValue, owner },
  outreach: { drafts[], history[] },
  campaignId | null,
  createdAt, updatedAt
}

Campaign { id, name, description, service, tone, status, manualSendOnly: true,
           sequence[], leadIds[], createdAt, updatedAt }

Settings { agency{}, pitch{}, dataPolicy{}, demoMode }
SuppressionEntry { id, kind: 'business' | 'phone' | 'email' | 'domain', value, reason, createdAt }
SearchRecord { id, industry, city, radiusKm, maxResults, mode, total, createdAt }
```

**Upsert semantics:** importing a lead that already exists (matched on `placeId`) **refreshes** the Google snapshot and **never overwrites** your CRM data. Re-importing the same search is safe and idempotent.

---

## Opportunity scoring

0–100, seven factors, each with evidence text. Unknown data awards **0** and is excluded from the maximum, so `dataCoverage` tells you how much of the judgement is actually informed.

| Factor | Points | Rule |
| --- | --- | --- |
| No website | **+30** | `websiteUri` is null/empty |
| Poor or weak website | **+20** (moderate: +10, strong: 0) | From the website audit's site score |
| High review count | **+15** | ≥400 reviews → 15 · ≥150 → 12 · ≥60 → 7 |
| Strong rating | **+10** | ≥4.3 → 10 · ≥4.0 → 6 |
| Active-looking business | **+10** | `OPERATIONAL` + open now → 10 · `OPERATIONAL` → 8 · `CLOSED_*` → 0 |
| Missing enquiry flow | **+10** | No website → 10 · both form and WhatsApp missing → 10 · one missing → 5 |
| Social presence | **+5** | Only from profiles actually found on their website |

`no_website` and `weak_website` are mutually exclusive.

**Bands:** 🔥 **High** 80–100 · 🟡 **Medium** 50–79 · ⚪ **Low** <50.

The `reason` is a short sentence assembled from the factors that actually fired — if the AI provider is configured it may be polished by the model, but every clause is anchored to retrieved data. **Nothing is inferred that wasn't fetched.**

---

## Website analysis

Pressing **Analyze Website** performs a single server-side `GET` of the lead's `websiteUri` and evaluates real HTML:

| Signal | Weight | How it's decided |
| --- | --- | --- |
| Mobile friendliness | 20 | `<meta name="viewport">` + count of `@media` rules |
| HTTPS | 10 | Final URL scheme |
| Calls to action | 15 | Buttons/links matching *book, buy, get a quote, contact, call, WhatsApp, enquire…* |
| Enquiry form | 15 | `<form>` with a name/email/phone/tel input |
| Contact flow | 10 | `tel:`, `mailto:`, `wa.me`, click-to-chat links |
| SEO basics | 10 | Title length 10–70 + meta description ≥70 chars |
| Heading structure | 5 | Exactly one `<h1>` |
| Freshness | 10 | Copyright year vs. this year, `Last-Modified` |
| Legacy stack | 5 | jQuery 1.x/2.x, Bootstrap ≤3, `<marquee>`, `<font>`, `bgcolor`, IE compat meta, no viewport |

Plus informational signals: page weight (bytes/scripts/images), structured data (JSON-LD/microdata), business info (address/hours/phone in text or JSON-LD), discovered public email, social profiles, and redirects.

**Site score → `weak` (<50) / `moderate` (50–74) / `strong` (≥75)**, which feeds the scoring model above.

**Guardrails:** `robots.txt` is fetched and **respected** (a disallowed path is never requested); only `http`/`https`; private, loopback, link-local and metadata IPs are blocked (with a DNS check before *and* a re-check after redirects); 10 s timeout; ~750 KB cap; non-HTML content types are rejected; an identifying user agent is sent.

If the page can't be fetched — robots, timeout, 500, DNS failure, no website at all — the result says exactly that. **The audit is never simulated and never guessed.** It is a heuristic HTML review, not a Lighthouse/Core Web Vitals audit, and the UI says so.

---

## Outreach generation

*Generate Pitch* returns an **email subject**, **email body** and **WhatsApp draft**, built strictly from: business name, category, city, rating/review count (only when present), the website URL, audited gaps, your agency profile and the assigned service.

Hard rules enforced in code and asserted by tests:

- **No false claims.** No invented metrics, no "we increased X by 40%", no fake client names, no made-up testimonials. There is a test that fails the build if a growth-percentage claim appears in generated copy.
- The WhatsApp draft always ends with an explicit opt-out line (`Reply STOP and I will not message again`) and is capped at 480 characters.
- Every draft records `generatedBy: "ai" | "template"` plus `factsUsed[]`, so you can see what it was based on.
- **No send endpoint exists.** `POST /api/leads/[id]/send` is not a route; `bulk` only supports `update` and `delete`. Sending is *always* a human click on **Copy email**, **Open in Mail** (`mailto:`) or **Open WhatsApp** (`wa.me`).
- Suppressed contacts are flagged before you draft.

---

## API reference

All routes accept/return JSON and use the `{ ok, data }` / `{ ok: false, error: { code, message, hint } }` envelope.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/status` | Config booleans, banner text, storage driver. **Never returns key material.** |
| `POST` | `/api/leads/search` | `{industry, city, radiusKm?, maxResults?, latitude?, longitude?, demo?}` → candidates with preview scores. `409 GOOGLE_NOT_CONFIGURED` if you ask for live without a key. |
| `POST` | `/api/leads/import` | Writes selected candidates. → `{imported, created, refreshed, notice}` |
| `GET` `POST` | `/api/leads` | List (filter/sort/limit) · create a manual lead |
| `GET` `PATCH` `DELETE` | `/api/leads/[id]` | Read · partial update (CRM, contact, campaign) · delete |
| `POST` | `/api/leads/[id]/score` | Recompute the opportunity score |
| `POST` | `/api/leads/[id]/analysis` | Run the website analysis |
| `POST` | `/api/leads/[id]/pitch` | Generate outreach drafts |
| `POST` | `/api/leads/[id]/refresh` | Re-fetch place data by `place_id` |
| `POST` | `/api/leads/bulk` | `{action:'update'|'delete', ids[], patch?}` — **no send action** |
| `GET` `POST` | `/api/campaigns` | List with stats · create |
| `GET` `PATCH` `DELETE` | `/api/campaigns/[id]` | Delete unassigns leads rather than deleting them |
| `POST` | `/api/campaigns/[id]/leads` | Attach leads (`?detach=1` to detach) |
| `GET` | `/api/export/leads` · `/api/export/campaigns` | CSV with BOM and dated `Content-Disposition` |
| `GET` `PATCH` | `/api/settings` | Read · write (`agency`, `pitch`, `dataPolicy`, `demoMode`) |
| `GET` `POST` | `/api/suppression` | Do-not-contact list |
| `DELETE` | `/api/suppression/[id]` | Remove an entry |
| `POST` | `/api/demo` | `reseed` · `clear` · `clear-all-leads` |
| `GET` | `/api/follow-ups` | `{overdue, today, upcoming, unscheduled, counts}` |
| `GET` `POST` | `/api/maintenance` | Stale-data report · `purge-stale` |

---

## Testing

Three suites, **284 assertions**, all currently passing:

```bash
npm run build
npm start                      # terminal 1
npm run smoke                  # terminal 2 — 139 checks: every page + every flow
npm run smoke:google           # 74 checks: mock Places API (New), self-contained
npm run smoke:web              # 71 checks: live analyzer vs. fixture site, self-contained
```

**`smoke.mjs`** (139) covers: configuration honesty (`banner` string, no key leakage), live-search refusal with `409 GOOGLE_NOT_CONFIGURED`, input validation, demo search not writing leads, import idempotency, scoring invariants (band thresholds, evidence on every factor, 0/3/7 follow-up days), website analysis, SSRF blocking of `169.254.169.254` and loopback, pitch generation + the **absence of a send endpoint**, CRM patching, DO_NOT_CONTACT auto-suppression, campaign CRUD/attach/detach, bulk updates, CSV export, refresh honesty, maintenance, settings round-trip, SSR markers on 9 routes, and self-cleanup.

**`smoke-google-mock.mjs`** (74) spawns a fake Places API (New) and a second app instance with a test key, then asserts the exact endpoint, the `X-Goog-Api-Key` and `X-Goog-FieldMask` headers, the wildcard-free mask contents, `textQuery`/`maxResultCount`/`languageCode`/`regionCode`, the `locationBias.circle` when coordinates are supplied, full response mapping, refresh-by-`place_id` preserving CRM data, and translation of Google `403`/`429` errors into actionable hints — without spending a single real API call.

**`smoke-website.mjs`** (71) spawns a fixture website (a strong page, a legacy 2015 page, a robots-disallowed path, a 302 redirect, a JSON endpoint, a 6-second slow endpoint, an HTTP 500) plus an app instance with the testing-only `WEBSITE_ANALYSIS_ALLOW_PRIVATE=true` flag, and asserts every signal, the robots refusal, the timeout, the content-type rejection, score impact, and that audited gaps show up in the generated pitch.

---

## Deployment

### VPS / container (recommended for V1)

```bash
npm ci && npm run build
GOOGLE_PLACES_API_KEY=... AGENCYOS_DATA_FILE=/var/lib/agencyos/data.json npm start
```

Use a persistent volume for `AGENCYOS_DATA_FILE`, put it behind Caddy/nginx/Traefik for TLS, and add a process manager (`systemd`, `pm2`, Docker `restart: unless-stopped`).

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
```

Mount `/app/data` as a volume.

### Serverless (Vercel, Netlify, Lambda)

Works, with one caveat: the filesystem is ephemeral or read-only, so the JSON store **falls back to in-memory** and data is lost between cold starts. `/api/status` reports `storagePersistent: false` and Settings shows the warning. For a serverless deployment, swap `src/lib/db/store.ts` for Postgres (Neon/Supabase) + Prisma/Drizzle — the store is the only file that touches persistence, and nothing else needs to change.

**Before exposing this to anyone other than yourself:** V1 has **no authentication** (documented in the Privacy Policy and Terms). Put it behind your platform's auth, a VPN, Cloudflare Access, or basic auth.

---

## Compliance and safety

| Requirement | How it's met |
| --- | --- |
| Official Google endpoints only | Text Search (New) + Place Details (New). No scraping, no unofficial clients. |
| Explicit field masks | No wildcards; the mask is shown in Settings → Integrations and asserted in tests. |
| Server-side keys | `process.env` only; never rendered, never bundled; `/api/status` returns booleans. |
| Google attribution | Shown next to Google-derived data on `/find`, `/leads` and lead pages. |
| No permanent storage of restricted data | `place_id` kept indefinitely; snapshots timestamped, flagged stale after 30 days, purgeable to `place_id` only. |
| No bulk unsolicited email | No send endpoint exists. Only `mailto:` + copy, per lead, per human click. |
| No WhatsApp automation | Only `wa.me` deep links the user must click. No unofficial APIs, no opt-in bypass. |
| Consent & preferences | Do-not-contact list, `DO_NOT_CONTACT` status with auto-suppression, opt-out line in every draft. |
| No sensitive personal data | Business contact data only. No passwords, no auth secrets, no special-category data. |
| robots.txt respected | Fetched and honoured before any page request. |
| SSRF protection | Private/loopback/link-local/metadata IPs blocked before and after redirects; `http(s)` only. |
| Honest degradation | "Google Places API not configured — Demo Mode active." Demo records are labelled everywhere; simulated audits say they are simulated. |
| Legal pages | `/privacy` (10 sections, incl. retention and the no-auth warning) and `/terms` (8 sections, incl. "what the Software never does"). |

---

## Known limitations

1. **No authentication.** Single-user, self-hosted, trusted network. Add auth before multi-user use.
2. **JSON-file storage.** Fine for hundreds-to-low-thousands of leads on one instance; not concurrent-write safe across processes; ephemeral on serverless. Postgres/Prisma is the production path.
3. **Heuristic website audit, not Lighthouse.** No real mobile emulation, no Core Web Vitals, no JS rendering — a React SPA with no server-rendered content will look sparse to the analyzer. That is reported honestly rather than papered over.
4. **DNS-rebinding window.** The SSRF guard resolves DNS, then `fetch` resolves again. A hostile domain that flips its answer between the two could slip through. Fix properly with an egress proxy or a pinned-IP `Agent`. (Not exploitable by the app's own data, only by a website you deliberately analyze.)
5. **Radius needs coordinates** in Text Search (New); without them the search is text-only and the UI says so.
6. **No email delivery.** By design in V1. When you add a compliant provider (Resend/Postmark/SES + double opt-in + suppression sync), put it behind an explicit per-message user action and record consent.
7. **AI quality depends on the model.** Templates are the guaranteed floor; every draft is editable before you send it, and you are the one who sends it.
8. **`maxResults` ≤ 20** per search — Google's Text Search (New) limit. Pagination via `nextPageToken` is not implemented in V1 (the token is returned by the API and ignored).

---

## Roadmap

- Postgres + Prisma adapter behind the existing store interface
- Authentication (Auth.js) and per-user workspaces
- Compliant transactional email provider with double opt-in and suppression sync
- `nextPageToken` pagination and "nearby search" as a complement to text search
- Headless-browser or PageSpeed Insights integration for a real performance audit
- Scheduled follow-up **reminders** (notifications only — still no auto-send)
- Deal forecasting and win-rate reporting on the dashboard

---

## Licence

MIT — see [LICENSE](LICENSE). Google Places data is subject to the [Google Maps Platform Terms of Service](https://cloud.google.com/maps-platform/terms) and [Policies](https://cloud.google.com/maps-platform/terms/other-terms). WhatsApp is a trademark of Meta; nothing here is affiliated with or endorsed by Meta.

Built for [Revoltz](https://github.com/revoltz-agency).
