# AgencyOS launch acceptance checklist

This checklist is the release gate for PR #46 and the first paid AgencyOS customers. A green CI run is necessary, not sufficient.

## 1. Repository and automated validation

- [ ] Latest commit on `saas/tenant-subscription-foundation` has a successful CI run.
- [ ] `npm ci`
- [ ] `npm test`
- [ ] `npm run check:launch` with the intended production environment values available locally or in the hosting shell; do not paste secrets into issues or commit them.
- [ ] `npm run smoke:deployment` against the exact candidate deployment.
- [ ] Verify the production build and public marketing-site build.

The PostgreSQL integration tests must run against a disposable test database, not the production database.

## 2. Hosting and secret configuration

Set secrets only in the hosting provider's secret/environment settings:

- [ ] `DATABASE_URL` points to the intended production PostgreSQL database with TLS.
- [ ] `TRUST_PROXY_HOPS` matches the actual reverse-proxy topology (typically 1 behind Render's edge); verify the observed client IP before relying on per-client rate limits.
- [ ] `AUDIT_OWNER_PASSWORD_HASH` is a generated scrypt hash, never the plaintext password.
- [ ] `AUDIT_ALLOWED_ORIGINS` contains only exact HTTPS origins that should be allowed to make Audit Inbox writes.
- [ ] `AUDIT_PUBLIC_INTAKE_ENABLED=true` only after database writes and Telegram notifications have been verified.
- [ ] `GOOGLE_MAPS_API_KEY` has only the required Google Places API enabled, plus provider-side quotas and budget alerts.
- [ ] Gemini is tested with the user-provided key and a quota/rate-limit response is presented clearly; do not promise unlimited free discovery.
- [ ] `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_PLAN_ID_STARTER`, and `RAZORPAY_WEBHOOK_SECRET` are set in test mode first.
- [ ] `AGENCYOS_BILLING_ENFORCED=true` remains off until the checkout, webhook, cancellation, and subscription-gating tests below pass. Enable it for the paid release only after the final rehearsal.

Do not share full environment dumps, API keys, password hashes, cookies, webhook signatures, or database URLs in chat, logs, screenshots, or GitHub.

## 3. Audit Inbox acceptance

- [ ] With no owner password hash, the private inbox is unavailable and no private request list is returned.
- [ ] Anonymous requests to list, change, or delete enquiries are rejected.
- [ ] Correct owner password creates a server-side session; wrong passwords are rejected and rate-limited.
- [ ] Sign-out revokes the server-side session; replaying the old cookie no longer grants access.
- [ ] Status changes and deletion require an allowed origin and session-bound CSRF token.
- [ ] Public intake accepts valid submissions only when explicitly enabled; malformed submissions are rejected.
- [ ] A test submission is stored once in PostgreSQL and the configured Telegram notification arrives without exposing credentials.
- [ ] Retention cleanup is deployed and verified independently. The UI's opportunistic purge is not evidence that scheduled deletion is running.
- [ ] The inbox's “Add to Leads” behavior is tested for duplicate clicks and across reloads; explain that its local imported marker is browser-local unless this is changed.

## 4. Multi-customer isolation and data durability

Use two separate test accounts and organizations with obviously different dummy records:

- [ ] Account A cannot read or modify account B's organization or module data, even by changing URL parameters, module keys, or request bodies.
- [ ] Signing out of A and signing in to B in the same browser does not show A's cached data.
- [ ] Open two accounts/devices, edit different sibling records, and verify revision-conflict handling does not discard either side's changes.
- [ ] Delete a record/key, reload, and confirm a stale browser snapshot does not restore the deletion.
- [ ] Verify every module advertised as cloud-synced actually saves and reloads from the organization-scoped store. Screens still using the legacy full workspace snapshot must not be advertised as having independent module permissions until migrated.
- [ ] Verify backups include every supported workspace storage key and that restore does not cross organization boundaries.
- [ ] Confirm account recovery, session expiry, and logout behavior.

Do not use real customer records during these tests.

## 5. Razorpay test-mode rehearsal

- [ ] Confirm the plan ID, billing interval, currency, and displayed price match the offer.
- [ ] Complete a successful hosted checkout with a Razorpay test payment method.
- [ ] Confirm the subscription only becomes entitled after a valid signed webhook or the documented verified provider state.
- [ ] Replay the same webhook and confirm idempotency (no duplicate state changes).
- [ ] Send an invalid signature and confirm it is rejected.
- [ ] Deliver older/out-of-order webhook events and confirm they cannot overwrite newer subscription state.
- [ ] Test cancellation, failed/past-due payment, expiry, and an inactive subscription with `AGENCYOS_BILLING_ENFORCED=true`.
- [ ] Confirm server-only credentials never appear in browser responses or logs.
- [ ] Repeat the flow in live mode with a controlled low-risk internal transaction before accepting external payments.

## 6. Deployment smoke and release decision

- [ ] Run `AGENCYOS_BASE_URL=https://<candidate-host> npm run smoke:deployment` against the exact live candidate.
- [ ] Confirm the public config endpoints expose only non-secret flags and the private workspace endpoints reject anonymous requests.
- [ ] Verify Render logs show a healthy process and no repeated database, auth, webhook, or rate-limit errors.
- [ ] Verify a database backup exists and its restore procedure has been rehearsed.
- [ ] Confirm no OpenStreetMap/Overpass references remain and Gemini + Google Places remain wired.
- [ ] Record the exact tested commit, CI URL, smoke-test result, payment mode, and outstanding limitations.

**Release rule:** keep PR #46 in draft and do not accept paid customers if any isolation, authentication, data durability, billing, or live deployment check is unverified. A successful build or configuration preflight does not establish production readiness.
