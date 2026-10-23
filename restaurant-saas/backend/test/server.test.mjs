import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.mjs';

async function withServer(fn, database) {
  const server = createServer({ database });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try { await fn('http://127.0.0.1:' + port); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test('health endpoint identifies the isolated service', async () => {
  await withServer(async (base) => {
    const response = await fetch(base + '/healthz');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, service: 'revoltz-restaurant-os-api' });
  }, null);
});

test('readiness reports missing database configuration', async () => {
  await withServer(async (base) => {
    const response = await fetch(base + '/readyz');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, database: 'not_configured' });
  }, null);
});

test('restaurant data routes stay disabled before authentication is built', async () => {
  await withServer(async (base) => {
    const response = await fetch(base + '/api/v1/orders');
    assert.equal(response.status, 501);
    assert.equal((await response.json()).error, 'not_implemented');
  }, null);
});

test('non-GET requests are rejected', async () => {
  await withServer(async (base) => {
    const response = await fetch(base + '/healthz', { method: 'POST' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET');
  }, null);
});

test('database readiness reports a successful probe only when the database query works', async () => {
  const fakeDb = { query: async (sql) => { assert.equal(sql, 'SELECT 1'); return { rows: [{ '?column?': 1 }] }; } };
  await withServer(async (base) => {
    const response = await fetch(base + '/readyz');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, database: 'connected' });
  }, fakeDb);
});

test('database readiness hides connection error details', async () => {
  const fakeDb = { query: async () => { throw new Error('private database host'); } };
  await withServer(async (base) => {
    const response = await fetch(base + '/readyz');
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.deepEqual(payload, { ok: false, database: 'unavailable' });
    assert.equal(JSON.stringify(payload).includes('private database host'), false);
  }, fakeDb);
});
