
```bash
npm test
npm run build
VITE_PUBLIC_SITE_ONLY=true npm run build -- --base=/Revoltz/
```

GitHub Actions runs these three checks on pull requests and pushes to `main`. CI also starts a disposable PostgreSQL 16 service and runs the organization-isolation, shared-rate-limit, and out-of-order Razorpay webhook integration tests against it, so those database checks are not silently skipped in CI.

For local runs of the opt-in PostgreSQL integration tests (concurrent rate limiting, organization module-data isolation, and out-of-order Razorpay webhook handling), set `AGENCYOS_TEST_DATABASE_URL` to a **disposable test database** before running `npm test`. The tests create the app schema and clean up only their own rows; they do not drop tables.

## Cloud workspace sync safety

Organization module-data writes require an `expectedUpdatedAt` revision from the latest cloud read. Send the returned `updatedAt` value with each save; send `null` only when the module has no cloud record yet. Writes with a stale revision return HTTP 409 (`WORKSPACE_REVISION_CONFLICT`), and writes that omit the revision return HTTP 400 (`WORKSPACE_REVISION_REQUIRED`). On conflict, reload the latest cloud state before saving; do not blindly retry an old full-state snapshot, because it could restore records another device deleted. The account-sync shell currently uses the full-workspace state endpoint; it follows the same revision requirement, rejects oversized or invalid snapshots, and is restricted to owners/admins. Browser edits are marked pending before the debounce so unsynced account-scoped data can be recovered after reload. If another device changed the cloud snapshot, AgencyOS stops syncing and offers an explicit “Discard local edits & reload cloud” action; use it only when you want to discard the unsynced local snapshot. All keys included in a data backup must also be included in the central workspace-sync key list.

## Paid-launch preflight

Before accepting subscriptions, run `npm run check:launch` with the intended production environment variables loaded. It checks that PostgreSQL, Razorpay credentials/plan/webhook secret, Google Places, billing enforcement, Audit Inbox intake/origins, and trusted proxy configuration are present and syntactically plausible. It never prints secret values. A pass is **not** an end-to-end health check: separately verify the live database connection, Google Places request, Razorpay checkout, signed webhook delivery, cancellation, and a real test subscription before taking payment.

## Deployment

[`render.yaml`](render.yaml) is a Render Blueprint proposal; committing it does not create or change a cloud service. It expects secrets to be entered in the hosting dashboard. Verify the running deployment and provider status before treating any local change as live.

The GitHub Pages workflow builds the public marketing-only site at `/Revoltz/`. Its status is visible in the repository's Actions tab; a local build alone does not verify deployment.

## Important limitations