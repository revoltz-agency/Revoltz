import http from 'node:http';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const PORT = Number(process.env.PORT) || 4100;
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
      max: Number(process.env.PGPOOL_MAX) || 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    })
  : null;

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  });
  res.end(JSON.stringify(payload));
}

export function createServer({ database = pool } = {}) {
  return http.createServer(async (req, res) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (req.method !== 'GET') {
      res.setHeader('allow', 'GET');
      return sendJson(res, 405, { error: 'method_not_allowed' });
    }
    if (pathname === '/healthz') {
      return sendJson(res, 200, { ok: true, service: 'revoltz-restaurant-os-api' });
    }
    if (pathname === '/readyz') {
      if (!database) return sendJson(res, 503, { ok: false, database: 'not_configured' });
      try {
        await database.query('SELECT 1');
        return sendJson(res, 200, { ok: true, database: 'connected' });
      } catch {
        return sendJson(res, 503, { ok: false, database: 'unavailable' });
      }
    }
    if (pathname.startsWith('/api/')) {
      return sendJson(res, 501, {
        error: 'not_implemented',
        message: 'Data routes stay disabled until authentication and tenant isolation are implemented.',
      });
    }
    return sendJson(res, 404, { error: 'not_found' });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!pool) {
    console.error('DATABASE_URL is required. Use a dedicated Restaurant OS database, not an existing production database.');
    process.exitCode = 1;
  } else {
    const server = createServer();
    server.listen(PORT, '0.0.0.0', () => console.log('Revoltz Restaurant OS API listening on port ' + PORT));
    const shutdown = async () => { server.close(); await pool.end(); };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }
}
