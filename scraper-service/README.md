# Protected Google Maps Scraper for Revoltz AgencyOS

This small gateway wraps the MIT-licensed `gosom/google-maps-scraper` service. It keeps the scraper's unauthenticated API on container loopback and requires a bearer token for all job endpoints. Only `/healthz` is public.

## Deploy on Render (free tier, best-effort)

1. In Render, create a **Web Service** from this repository, branch `main`.
2. Set **Root Directory** to `scraper-service`, **Language** to **Docker**, and select the **Free** plan.
3. Add environment variable `SCRAPER_API_TOKEN` with a random secret of at least 32 characters. Keep it private.
4. Deploy. Wait for the service to become live and copy its HTTPS base URL.
5. In the AgencyOS Render service, set:
   - `GOOGLE_MAPS_SCRAPER_URL` = the scraper service HTTPS base URL (no trailing slash)
   - `GOOGLE_MAPS_SCRAPER_TOKEN` = the same token value
6. Redeploy AgencyOS. Its Settings screen should report the scraper as configured.

Free Render services have 512 MB RAM, sleep after inactivity, and may restart. Chromium scraping is memory-heavy, so this can fail with out-of-memory errors on the free tier. This setup costs no API-key fee but is not guaranteed to run reliably on free compute. If it fails due to memory, leave the free web research workflow enabled rather than adding billing.

## Security notes

- Never remove `SCRAPER_API_TOKEN` or expose the upstream port 8080.
- Do not put the token in frontend code, screenshots, Git commits, or issue comments.
- The token protects the scraper API; the AgencyOS server stores it and sends it server-to-server.
- Search results can be incomplete or blocked; verify listings and contact details before outreach.
