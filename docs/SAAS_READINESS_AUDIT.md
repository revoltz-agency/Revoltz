# Revoltz AgencyOS SaaS readiness audit

**Reviewed:** 20 October 2026  
**Purpose:** Separate verified code capabilities from launch assumptions. This is a repository review, not a live production penetration test.

## Evidence-based current state

| Area | Current code evidence | Status | Required next action |
|---|---|---|---|
| Frontend/build | React 19 + Vite; CI build workflow exists | Implemented, CI-gated | Keep builds green after each change |
| Workspace registration/login | Express routes; scrypt password hashing; sessions stored by hash; CSRF token checks | Implemented in code; live production behavior not verified here | Verify Render environment, database schema and end-to-end account flow |
| Per-account workspace state | PostgreSQL JSONB row keyed by user ID; API uses authenticated session's user ID | Implemented in code | Test cross-account access through HTTP endpoints and multiple browser sessions |
| Workspace data model | One JSONB snapshot per account, not relational business entities | Limited | Gradually migrate to typed records only when needed; preserve JSON snapshot and provide reversible migration |
| Collaboration / organization teams | Current auth model is user-account keyed; no verified organization/member/role model in the reviewed paths | Not ready | Build organizations, membership, roles and invitation flow before marketing team collaboration |
| Subscription / entitlements | Razorpay checkout initiation, signed webhook verification, subscription records, status endpoint, and opt-in server-side access checks exist in code; CI passes | Implemented in code; live lifecycle not verified | Test checkout/webhook against deployed backend, event ordering/idempotency, cancellation, failed payment, account scoping, and support/refund operations before enabling enforcement |
| Password reset / email verification | No verified implementation in the reviewed auth UI/routes | Not verified | Add secure recovery and verification before broad paid launch; never expose account enumeration |
| Leads / CRM | Current app has CRM UI and browser-key based records synced through workspace JSON state | Limited | Test CRUD, duplicates, refresh, export and record integrity |
| Public audit intake | Separate public intake and owner inbox code paths exist | Implemented in code; live delivery/config not verified | Keep it working; verify origin allowlist, DB persistence and notifications in production |
| Lead discovery | Public search/manual research is the zero-cost default; it is not equivalent to automatic verified lead enrichment | Limited by design | Label sources and verification status; never invent results or imply free unlimited scraping |
| AI integrations | Provider modules exist in repository; zero-cost UI has removed paid-provider choices | Optional / not core | Keep off by default; require explicit configuration and honest quota/cost warnings |
| Business records beyond CRM | Several modules persist data through workspace storage; some specific modules use browser-only storage | Mixed | Audit each feature for the actual persistence mechanism and make UI status truthful |
| Backup and recovery | Data Backup UI exists; production database backup/restore was not verified | Not verified | Test exports, automated DB backup policy and an actual restore before charging customers |
| Production hosting | Repo has GitHub Actions; deployment target is separate from GitHub Pages | Not verified here | Check Render health, environment variables, logs and database connectivity directly |
| Privacy/legal readiness | No comprehensive paid SaaS launch review established by this audit | Not verified | Publish accurate terms/privacy, data retention, deletion/export and support contact before public paid launch |

## Launch blockers

Do not claim “production-ready SaaS” until these are verified:

1. **Production deployment:** confirm the intended AgencyOS URL runs the current server and frontend commit.
2. **Data isolation:** account A cannot read/write account B's state through any endpoint or manipulated client request.
3. **Reliability:** add/update/delete and reload work for every feature marketed as core.
4. **Recovery:** test database backups and restore; users can export their records.
5. **Account lifecycle:** secure password reset, session revocation, email verification and account deletion are implemented or clearly scoped.
6. **Subscription lifecycle:** if charging, webhook signature validation, duplicate event idempotency, failed payment, cancellation and server-side plan entitlements are tested.
7. **Support/legal:** privacy notice, terms, support process, retention/deletion policy and honest feature/uptime descriptions are available.
8. **Economics:** free-tier hosting limits, database capacity, backups, email, monitoring and payment fees are understood; never assume “free” means unlimited or sustainable at scale.

## Updated build sequence

### Release 0 — Stabilize the current product
- Keep the public audit form and data.
- Remove dead UI and duplicate features, not records.
- Run unit tests/build and review deployment status.
- Label each module Working / Limited / Unavailable.

### Release 0.5 — Billing acceptance (code exists; not yet launch-approved)
- Use Razorpay test credentials and a test plan on the actual deployed AgencyOS backend.
- Verify checkout creation, signed webhook delivery, duplicate/retried events, active access, cancelled/halted access, and database failure behavior.
- Confirm all subscription checks use the authenticated account and keep `AGENCYOS_BILLING_ENFORCED=false` until the test matrix passes.
- Add and test customer-facing cancellation, failed-payment recovery, support and refund procedures before taking live payments.

### Release 1 — Sellable solo workspace
- Keep the public audit form and data.
- Remove dead UI and duplicate features, not records.
- Run unit tests/build and review deployment status.
- Label each module Working / Limited / Unavailable.

### Release 1 — Sellable solo workspace
- Lead/customer records, pipeline, next action, tasks/projects, invoice/payment tracking, basic reports.
- Reliable account-scoped persistence and export.
- Onboarding that starts with a genuinely empty workspace or explicitly labelled sample data.
- Manual workflows work without AI keys.

### Release 2 — Paid pilot
- Resolve account recovery and security launch blockers.
- Configure and test billing with server-side entitlements.
- Recruit 5–10 design partners and validate willingness to pay.
- Publish a clear support and data policy.

### Release 3 — Team and international expansion
- Organization/member/role model and invitations.
- Timezone, locale and currency handling; translated copy where demand warrants it.
- Billing, privacy, taxes and customer support appropriate to each target market.
- Expand only after retention and unit economics justify more infrastructure.

## Non-negotiable product rules

- Do not use fake records as if they were real customers or revenue.
- Never trust a client-provided user or organization ID for authorization.
- Do not delete existing workspace data during cleanup or migration.
- Paid AI and third-party APIs remain optional and disabled until explicitly configured.
- A successful frontend build is not proof that production deployment or every workflow works.
- A successful payment UI is not proof that subscription access is enforced by the server.
- Build one complete lead-to-cash workflow before expanding into a universal ERP.
