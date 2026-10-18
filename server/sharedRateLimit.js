import { ensureSchema, queryDatabase } from './db.js';
import { sha256Hex } from './security.js';

// PostgreSQL-backed fixed-window limiter shared by all app instances.
// Keys are hashed before persistence; raw email addresses/IPs are never stored.
export async function checkSharedRateLimit(key, { windowMs = 900_000, limit = 20, now = new Date() } = {}) {
  await ensureSchema();
  const bucketKey = sha256Hex(String(key || 'unknown'));
  // Opportunistically prune expired rows; the index keeps this bounded to stale buckets.
  await queryDatabase('DELETE FROM shared_rate_limit_buckets WHERE expires_at <= $1', [now.toISOString()]);
  const result = await queryDatabase(
    `INSERT INTO shared_rate_limit_buckets (bucket_key, window_started_at, hit_count, expires_at)
     VALUES ($1, $2, 1, $2::timestamptz + ($3::bigint * interval '1 millisecond'))
     ON CONFLICT (bucket_key) DO UPDATE SET
       window_started_at = CASE
         WHEN shared_rate_limit_buckets.window_started_at <= $2::timestamptz - ($3::bigint * interval '1 millisecond')
         THEN $2::timestamptz ELSE shared_rate_limit_buckets.window_started_at END,
       hit_count = CASE
         WHEN shared_rate_limit_buckets.window_started_at <= $2::timestamptz - ($3::bigint * interval '1 millisecond')
         THEN 1 ELSE shared_rate_limit_buckets.hit_count + 1 END,
       expires_at = CASE
         WHEN shared_rate_limit_buckets.window_started_at <= $2::timestamptz - ($3::bigint * interval '1 millisecond')
         THEN $2::timestamptz + ($3::bigint * interval '1 millisecond')
         ELSE shared_rate_limit_buckets.expires_at END
     RETURNING hit_count, window_started_at`,
    [bucketKey, now.toISOString(), windowMs],
  );
  const row = result.rows[0];
  const count = Number(row?.hit_count || 0);
  const elapsed = now.getTime() - new Date(row?.window_started_at || now).getTime();
  return {
    allowed: count > 0 && count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: count <= limit ? 0 : Math.max(1, Math.ceil((windowMs - elapsed) / 1000)),
  };
}

export async function resetSharedRateLimit(key) {
  await ensureSchema();
  await queryDatabase('DELETE FROM shared_rate_limit_buckets WHERE bucket_key = $1', [sha256Hex(String(key || 'unknown'))]);
}
