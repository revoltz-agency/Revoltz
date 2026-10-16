
```bash
npm test
npm run build
VITE_PUBLIC_SITE_ONLY=true npm run build -- --base=/Revoltz/
```

GitHub Actions runs these three checks on pull requests and pushes to `main`. CI also starts a disposable PostgreSQL 16 service and runs the organization-isolation, shared-rate-limit, and out-of-order Razorpay webhook integration tests against it, so those database checks are not silently skipped in CI.

For local runs of the opt-in PostgreSQL integration tests (concurrent rate limiting, organization module-data isolation, and out-of-order Razorpay webhook handling), set `AGENCYOS_TEST_DATABASE_URL` to a **disposable test database** before running `npm test`. The tests create the app schema and clean up only their own rows; they do not drop tables.

## Cloud workspace sync safety

Organization module-data writes require an `expectedUpdatedAt` revision from the latest cloud read. Send the returned `updatedAt` value with each save; send `null` only when the module has no cloud record yet. Writes with a stale revision return HTTP 409 (`WORKSPACE_REVISION_CONFLICT`), and writes that omit the revision return HTTP 400 (`WORKSPACE_REVISION_REQUIRED`). On conflict, reload the latest cloud state before saving; do not blindly retry an old full-state snapshot, because it could restore records another device deleted. The legacy full-workspace state write endpoint follows the same revision requirement and rejects oversized or invalid snapshots; it is restricted to owners/admins and is not used by the current app UI.

## Deployment

[`render.yaml`](render.yaml) is a Render Blueprint proposal; committing it does not create or change a cloud service. It expects secrets to be entered in the hosting dashboard. Verify the running deployment and provider status before treating any local change as live.

The GitHub Pages workflow builds the public marketing-only site at `/Revoltz/`. Its status is visible in the repository's Actions tab; a local build alone does not verify deployment.

## Important limitations