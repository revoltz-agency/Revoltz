// Neon Function: scheduled 89-day retention cleanup for audit_requests.
//
// This is NOT deployed by this repository and is NOT operational until you
// deploy it and create a scheduled trigger yourself (instructions in
// docs/AUDIT_INBOX.md). Nothing here runs as part of the Express app.
//
// Follows Neon's documented scheduled-invocation pattern:
//   * The route is unauthenticated by design — scheduled invocations arrive
//     without credentials. Neon strips client-set X-Neon-* headers, so the
//     presence of X-Neon-Trigger-Invocation-Id attests the call came from
//     Neon's trigger system.
//   * The handler is idempotent: DELETE is naturally idempotent, and the run is
//     recorded with ON CONFLICT DO NOTHING so a redelivered occurrence is a
//     no-op.
//   * DATABASE_URL is injected by the Neon Functions runtime.
//
// Deploy:   neon functions deploy audit-retention --src functions/audit-retention.ts
// Verify:   neon logs query --source function

import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';

const app = new Hono();

const RETENTION_DAYS = 89;

app.post('/', async (c) => {
  // Reject anything that did not come from Neon's trigger system.
  if (!c.req.header('x-neon-trigger-invocation-id')) {
    return c.json({ error: 'not a trigger call' }, 403);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('audit-retention: DATABASE_URL is not injected');
    return c.json({ error: 'DATABASE_URL missing' }, 500);
  }

  const body = await c.req.json<{ data?: { scheduled_at?: string } }>();
  const scheduledAt = body?.data?.scheduled_at;
  if (!scheduledAt) {
    return c.json({ error: 'missing data.scheduled_at' }, 400);
  }

  const sql = neon(databaseUrl);

  // Run log gives the schedule an auditable history and makes redelivery safe.
  await sql`
    CREATE TABLE IF NOT EXISTS audit_retention_runs (
      scheduled_at timestamptz PRIMARY KEY,
      deleted_count integer NOT NULL,
      ran_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const inserted = await sql`
    INSERT INTO audit_retention_runs (scheduled_at, deleted_count)
    VALUES (${scheduledAt}, 0)
    ON CONFLICT (scheduled_at) DO NOTHING
    RETURNING scheduled_at
  `;

  // Idempotent: a redelivered occurrence finds no row to claim and returns
  // without issuing a second DELETE.
  if (inserted.length === 0) {
    console.log(`audit-retention ${scheduledAt}: already processed, skipping`);
    return c.json({ ok: true, skipped: 'already processed', scheduled_at: scheduledAt });
  }

  // Hard delete everything past its retention expiry. The expiry timestamp was
  // computed at insert time from AUDIT_RETENTION_DAYS, so the window is
  // enforced per row. The bound parameter is `now`; nothing is interpolated.
  const deleted = await sql`
    DELETE FROM audit_requests
    WHERE retention_expires_at < ${new Date()}::timestamptz
  `;

  const deletedCount = Number(deleted?.rowCount ?? deleted?.count ?? 0);
  await sql`
    UPDATE audit_retention_runs
    SET deleted_count = ${deletedCount}
    WHERE scheduled_at = ${scheduledAt}
  `;

  // Neon surfaces this line under neon.function.app; it is the evidence that a
  // scheduled invocation actually ran.
  console.log(`audit-retention ${scheduledAt}: deleted ${deletedCount} row(s), window ${RETENTION_DAYS}d`);

  return c.json({ ok: true, scheduled_at: scheduledAt, deleted: deletedCount, retentionDays: RETENTION_DAYS });
});

export default app;
