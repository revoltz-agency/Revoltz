# Deployment preparation

**Nothing has been deployed.** Committing configuration is not deployment. This
document records verified compatibility and the steps a human must take.

## Verified compatibility

| Item | Finding |
|---|---|
| Runtime | Node **22.22.3** — the version used locally and in CI. Every test and both builds pass on it. |
| Render default | Render's default for services created on/after 2026-09-17 is Node **24.21.0** ([docs](https://render.com/docs/node-version)). We pin 22.22.3. |
| Version resolution | Render checks `NODE_VERSION` → `.node-version` → `.nvmrc` → `engines.node`. All four are set consistently: `NODE_VERSION` in `render.yaml`, `.node-version` = `22.22.3`, `engines.node` = `^22.22.0 \|\| ^24.0.0`, CI `node-version: 22`. |
| Build | `npm ci && npm run build` → Vite 6 build, verified locally (1,619 modules). |
| Start | `npm start` → `NODE_ENV=production node server/index.js`; serves `dist/` and the API. |
| Health check | `/api/config` is dependency-free and returns 200 as soon as the process boots — no database required. |
| Database | Optional. With no `DATABASE_URL` the service runs exactly as before and only the Audit Inbox is unavailable. |
| Static hosting | The Express server serves `dist/` with an SPA fallback; `vercel.json` provides the same rewrite for Vercel. |

## Build architecture — unchanged

- The app remains a single Vite/React SPA with an Express server.
- The GitHub Pages build (`VITE_PUBLIC_SITE_ONLY=true`, `--base=/Revoltz/`) is
  unchanged. `vite.config.js` still swaps the entry to `src/site-main.jsx` and
  **throws** if the combined entry is missing, so AgencyOS cannot leak into the
  public bundle.
- The Audit Inbox lives in the AgencyOS workspace only, so it is **excluded from
  the Pages build by construction**. Verified after every build.

## `render.yaml`

A Blueprint that describes the service. It creates nothing on its own and must
be applied deliberately in the Render dashboard.

- Secrets are declared `sync: false` — Render expects them to be entered in the
  dashboard. **No credential, connection string or `.env` file is in Git.**
- `TRUST_PROXY_HOPS=1` makes `req.ip` the real client address behind Render's
  edge, so the Audit Inbox rate limiters key per client rather than per proxy.
- `AUDIT_PUBLIC_INTAKE_ENABLED=false` is explicit, not implicit.

## Render free-plan caveats

1. Free web services **spin down after inactivity**; the first request after
   idle is slow.
2. Free instances are **single-process**, so the in-process rate limiters are
   effectively global on that plan — but they still reset on redeploy.
3. There is **no SLA** and no persistent disk. PostgreSQL is external (Neon), so
   no disk is needed.
4. Environment changes trigger a redeploy.

## Deployment checklist (for a human, in order)

1. Create the PostgreSQL database (e.g. Neon) and copy the connection string.
2. `npm run audit:hash-password` and store the hash as `AUDIT_OWNER_PASSWORD_HASH`.
3. Create the Render service from `render.yaml`; fill in the `sync: false` variables.
4. Set `AUDIT_ALLOWED_ORIGINS` to the exact service origin (no trailing slash,
   no wildcards). State-changing Audit Inbox calls fail closed without it.
5. Confirm the health check passes and `/api/config` reports
   `auditInboxConfigured: true`.
6. Sign in to the Audit Inbox and confirm an empty list renders.
7. Deploy the retention function and **verify one real scheduled invocation**
   before describing cleanup as operational (see `docs/AUDIT_INBOX.md`).
8. Only then consider `AUDIT_PUBLIC_INTAKE_ENABLED=true`, and test end to end
   before claiming website enquiries reach AgencyOS.

## What is NOT deployed

- Any Render service, database, or cloud resource.
- The Neon retention function (`functions/audit-retention.ts`).
- Any scheduled job (`db/audit_retention_pg_cron.sql` is inert SQL text).
- Public audit intake (disabled).
- Any paid provider integration (all key-gated and unset).
