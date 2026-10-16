
```bash
npm test
npm run build
VITE_PUBLIC_SITE_ONLY=true npm run build -- --base=/Revoltz/
```

GitHub Actions runs these three checks on pull requests and pushes to `main`. CI also starts a disposable PostgreSQL 16 service and runs the organization-isolation and shared-rate-limit integration tests against it, so those database checks are not silently skipped in CI.

For local runs of the opt-in PostgreSQL integration tests (concurrent rate limiting and organization module-data isolation), set `AGENCYOS_TEST_DATABASE_URL` to a **disposable test database** before running `npm test`. The tests create the app schema and clean up only their own rows; they do not drop tables.

## Deployment

[`render.yaml`](render.yaml) is a Render Blueprint proposal; committing it does not create or change a cloud service. It expects secrets to be entered in the hosting dashboard. Verify the running deployment and provider status before treating any local change as live.

The GitHub Pages workflow builds the public marketing-only site at `/Revoltz/`. Its status is visible in the repository's Actions tab; a local build alone does not verify deployment.

## Important limitations