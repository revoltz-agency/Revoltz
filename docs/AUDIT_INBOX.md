# Audit Inbox

A passwordless inbox for enquiries submitted from the public REVOLTZ AI website. Anyone who can reach the service can view, update, and delete requests. Use only when access to the service is restricted or the data is non-sensitive.
Requests are stored in PostgreSQL and deliberately separated from prospect CRM data.

When Telegram is configured, every newly accepted public audit request also triggers
a private Telegram message containing the submitted contact details and request ID.
The database save is the source of truth: if Telegram is unavailable, the enquiry
still succeeds and remains in the inbox.

### Optional Telegram alerts

1. In Telegram, open [@BotFather](https://t.me/BotFather), run `/newbot`, and follow the prompts.
2. Copy the bot token from BotFather. Keep it private.
3. Open your new bot and press **Start**.
4. To get your chat ID, open this address in a browser after replacing `<BOT_TOKEN>`
   with your token: `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates`.
   Find `message.chat.id` in the response. Do not share this response publicly.
5. In the Render dashboard, open the `revoltz-agencyos` service → **Environment** and add:
   - `TELEGRAM_BOT_TOKEN` = the token from BotFather
   - `TELEGRAM_CHAT_ID` = your private chat ID
6. Save changes and let Render redeploy. Submit a test enquiry on the website.

Both variables are optional. When absent, the website form and Audit Inbox work as
before, with no Telegram message. Credentials are read only on the server and are
never returned by the configuration endpoint.


> **Production status: not verified by this document.** The code and Render Blueprint enable public intake, but verify the live `/api/config`, submit a real test request, and confirm it appears in this inbox before calling the workflow operational.

| Capability | State |
|---|---|
| Code, schema, validation, session auth | ✅ Implemented |
| Unit tests | ✅ 137/137 passing (`npm test`) |
| Database deployed | ⚠️ Verify in the live Render environment |
| Owner credential configured | ⚠️ Verify in the live Render environment |
| Public intake enabled | ✅ `true` in the current Render Blueprint; verify live configuration |
| Scheduled retention cleanup | ❌ **Not deployed, not operational** |

---

## 1. What it is

- Requests are stored in the `audit_requests` table in PostgreSQL.
- Prospect CRM data never reaches the server — it stays in the operator's
  browser `localStorage`. The two stores are entirely separate, so a website
  enquiry appears in Audit Inbox and is not automatically inserted into Leads.
  The operator must currently transfer a suitable enquiry into the CRM manually.
- **No email or WhatsApp message is sent automatically.** Optional Telegram alerts
  are available for new enquiries when `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`
  are configured on the server.
- The UI lives in the AgencyOS workspace (`src/components/AuditInbox.jsx`), so
  it is **excluded from the public GitHub Pages marketing build**.

## 2. Deployment steps

### 2.1 Database

Set `DATABASE_URL` to a PostgreSQL connection string. Tables are created
automatically on first use with `CREATE TABLE IF NOT EXISTS` — there is no
migration runner and no destructive DDL.

```sql
-- audit_requests:  id, name, business, email, service, message, status,
--                  created_at, updated_at, retention_expires_at
-- audit_sessions:  id, token_hash, csrf_hash, created_at, expires_at,
--                  absolute_expires_at, revoked_at, last_used_at
```

`gen_random_uuid()` is required (built into PostgreSQL 13+).

### 2.2 Passwordless access

The inbox no longer requires (no owner password hash required); only `DATABASE_URL` is required.

**Security warning:** anyone who can reach the service can read contact details and can update or delete requests. Origin checks are not authentication. It never falls back to weaker authentication.

### 2.3 Environment variables

All placeholders live in `.env.example`. Never commit real values.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | *(none)* | PostgreSQL connection string |
| `AUDIT_OWNER_PASSWORD_HASH` | *(none)* | scrypt hash of the owner password |
| `AUDIT_PUBLIC_INTAKE_ENABLED` | `false` in local defaults; `true` in Render blueprint | Public `POST /api/audit/requests` |
| `AUDIT_RETENTION_DAYS` | `89` | Retention window in days |
| `AUDIT_ALLOWED_ORIGINS` | *(none)* | Comma-separated origins for state-changing calls |
| `AUDIT_SESSION_IDLE_MINUTES` | `480` | Idle session lifetime (renewed on use) |
| `AUDIT_SESSION_ABSOLUTE_MINUTES` | `1440` | Absolute ceiling, never renewed |
| `TRUST_PROXY_HOPS` | `0` | Proxy hops to trust so `req.ip` is the real client |

## 3. Authentication model

| Control | Implementation |
|---|---|
| Storage | Server-side session rows in `audit_sessions`; the browser holds only an opaque token |
| Session cookie | `HttpOnly`, `Secure` in production (incl. via `X-Forwarded-Proto`), `SameSite=Strict`, `Path=/`, `Max-Age` = idle TTL |
| Expiry | Two-layered: idle lifetime renewed on use, hard absolute ceiling that is never renewed |
| Revocation | `POST /api/audit/session/logout` deletes the row server-side, then clears cookies |
| Token at rest | Only the SHA-256 digest is stored, so a database leak yields no usable token |
| CSRF | Double-submit: readable CSRF cookie echoed in `X-Audit-CSRF`, compared timing-safely and bound to the session row |
| Origin | `AUDIT_ALLOWED_ORIGINS` allowlist on every state-changing request; **fails closed when empty**; wildcards are never accepted |
| Password check | scrypt + `timingSafeEqual`; minimum 12 characters |
| Rate limiting | 5 sign-ins / 10 min and 5 intakes / hour per client address |

### Routes

| Method | Path | Auth |
|---|---|---|
| `GET` | `/api/audit/config` | none (booleans only) |
| `POST` | `/api/audit/session` | password + origin + rate limit |
| `POST` | `/api/audit/session/logout` | session + origin + CSRF |
| `GET` | `/api/audit/retention` | session |
| `GET` | `/api/audit/requests` | session |
| `POST` | `/api/audit/requests` | **disabled by default**; origin + rate limit |
| `PATCH` | `/api/audit/requests/:id` | session + origin + CSRF |
| `DELETE` | `/api/audit/requests/:id` | session + origin + CSRF |

## 4. Retention: 89 days

Every row stores `retention_expires_at = created_at + 89 days`. Cleanup is a
hard `DELETE`, matching the policy that enquiry records are removed, not
archived.

### Four distinct states — do not conflate them

| State | Current | Meaning |
|---|---|---|
| **Configured** | ✅ Yes | `AUDIT_RETENTION_DAYS` default is 89; a malformed value falls back to 89 rather than disabling retention. Expiry is computed on every insert. |
| **Unit-tested** | ✅ Yes | `tests/auditInbox.test.js` covers the 88/89/90-day boundary, clamping, and that the purge statement is parameterized and a hard delete. |
| **Deployed** | ❌ **No** | No scheduled job exists in any Neon project. The function source is in `functions/audit-retention.ts` and has not been deployed. |
| **Operational & verified** | ❌ **No** | No scheduled invocation has ever been observed. This must not be claimed until a real run is evidenced in logs. |

Opening the inbox also purges opportunistically. **That is defence in depth,
not proof of a scheduled policy** — it only runs when a human opens the page.

### Recommended mechanism: Neon scheduled Function Trigger

Chosen because — per Neon's docs — **Function Triggers fire even when the
compute is scaled to zero**, which `pg_cron` does not.

```bash
# 1. Deploy the function
neon functions deploy audit-retention --src functions/audit-retention.ts

# 2. Start with every minute so a run is observable in under a minute.
#    Console: Functions -> ⋮ -> Manage Triggers -> Create trigger -> Schedule
#      Trigger name : audit-retention-89d
#      Function path: /
#      Cron schedule: * * * * *
#      Timezone     : fixed to UTC (always)
#
#    API equivalent:
curl -sS -X POST \
  "https://console.neon.tech/api/v2/projects/$PROJECT_ID/branches/$BRANCH_ID/triggers" \
  -H "authorization: Bearer $NEON_API_KEY" -H 'content-type: application/json' \
  -d '{"trigger":{"name":"audit-retention-89d","function_slug":"audit-retention","function_path":"/","type":"schedule","schedule":{"cron":"* * * * *"},"enabled":true}}'

# 3. Confirm an actual invocation ran
neon logs query --source function
#    Look for:  audit-retention <scheduled_at>: deleted N row(s), window 89d

# 4. Move to the real cadence — daily at 03:00 UTC
#    PATCH the trigger, or edit it in the Console, then confirm one more run.
curl -sS -X PATCH \
  "https://console.neon.tech/api/v2/projects/$PROJECT_ID/branches/$BRANCH_ID/triggers/audit-retention-89d" \
  -H "authorization: Bearer $NEON_API_KEY" -H 'content-type: application/json' \
  -d '{"trigger":{"schedule":{"cron":"0 3 * * *"}}}'
```

Only after step 3 shows a real run may the cleanup be called *operational*.

### Cron reference (from Neon docs)

Five numeric fields, **always UTC**: `minute hour day-of-month month day-of-week`.
Ranges (`1-5`), lists (`0,30`) and steps (`*/2`) work. Rejected with `400`:
named days/months (`MON`), macros (`@daily`), a seconds field, `*/0`, and any
out-of-range value.

### Alternative: `pg_cron`

`db/audit_retention_pg_cron.sql` has the equivalent job. ⚠️ **`pg_cron` only
runs while the compute is active** — with scale-to-zero, scheduled runs are
silently missed. Use it only on an always-on compute.

## 5. Public intake — enabled in the current Blueprint; verify live

`AUDIT_PUBLIC_INTAKE_ENABLED` defaults to `false` in local development and is set to `true` in the current `render.yaml` Blueprint. A committed Blueprint does not automatically update an existing Render service.

The public marketing form sends `POST /api/audit/requests` to the URL configured by `VITE_AUDIT_API_BASE_URL` (default: `https://revoltz-agencyos.onrender.com`). The backend checks the intake flag, database/owner configuration, exact request origin, rate limit, and field validation before saving the request in PostgreSQL. It then attempts an optional Telegram notification.

### End-to-end verification checklist

1. Check the live backend `GET /api/config`: `auditInboxConfigured`, `auditPublicIntakeEnabled`, and `telegramNotificationsConfigured` are booleans, not proof of delivery.
2. Open the production website at its canonical origin and submit one controlled test enquiry.
3. Confirm the form reports success and the request appears in the authenticated Audit Inbox after refresh.
4. Confirm the Telegram message separately. If Telegram fails, the stored enquiry should still remain available.
5. If submission fails, inspect the browser Network panel for `POST /api/audit/requests` and the Render service logs. Do not expose secrets when sharing diagnostics.

Only after this checklist passes should the website-to-inbox path be called operational.

## 6. Security limitations (known, not fixed)

1. **One shared operator credential.** No accounts, roles, MFA or per-user
   audit trail of owner actions.
2. **No rate limiting on the database side** and no lockout/backoff beyond the
   in-process login limiter (5 / 10 min per client address).
3. **In-process rate limiting is not a global cap.** State is per instance,
   resets on restart or redeploy, and does not coordinate across instances.
4. **`req.ip` is the proxy address unless `TRUST_PROXY_HOPS` is set**, which
   makes rate-limit buckets coarser (fail-closed, not fail-open).
5. **Public intake has a narrow CORS allowlist.** It permits the configured exact
   origins for `POST`/`OPTIONS` and the `Content-Type` header. CORS is a browser
   control, not authentication; non-browser clients can still call public intake.
6. **Owner writes use session + CSRF checks.** The owner session is an HttpOnly
   cookie and state-changing owner requests echo the readable CSRF cookie in
   `X-Audit-CSRF`. Keep both protections if the authentication flow changes.
7. **Session cookies require HTTPS.** `Secure` is only set when the request is
   detected as TLS; a plaintext deployment would leak the session token.
8. **No audit log of owner actions** (view/update/delete of a request).
9. **`audit_requests.email` is stored in plaintext** in Postgres, as it is the
   reply address for the enquiry. Encrypting it is out of scope.
10. **Retention cleanup is not operational** (see §4).
