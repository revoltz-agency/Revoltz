import test from 'node:test';
import assert from 'node:assert/strict';
import { runDeploymentSmokeCheck } from '../scripts/smoke-test-deployment.mjs';

function response(status, payload) {
  return {
    status,
    headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null },
    json: async () => payload,
  };
}

const publicConfig = {
  googlePlacesConfigured: true,
  auditInboxConfigured: true,
  auditPublicIntakeEnabled: true,
  telegramNotificationsConfigured: true,
  placesRateLimitPerMinute: 20,
};
const auditConfig = { configured: true, publicIntakeEnabled: true, retentionDays: 89 };
const unauthorized = { error: 'Please sign in to use this workspace.' };

test('deployment smoke check passes only when public config and private-route boundaries respond correctly', async () => {
  const payloads = new Map([
    ['/api/config', response(200, publicConfig)],
    ['/api/audit/config', response(200, auditConfig)],
    ['/api/workspace/me', response(401, unauthorized)],
    ['/api/workspace/organization', response(401, unauthorized)],
    ['/api/workspace/state', response(401, unauthorized)],
  ]);
  const result = await runDeploymentSmokeCheck({
    baseUrl: 'https://agencyos.example.test',
    fetchImpl: async (url) => payloads.get(url.pathname),
  });
  assert.equal(result.ready, true);
  assert.equal(result.passed, 6);
  assert.equal(result.total, 6);
});

test('deployment smoke check blocks a private route that unexpectedly allows anonymous access', async () => {
  const fetchImpl = async (url) => {
    if (url.pathname === '/api/config') return response(200, publicConfig);
    if (url.pathname === '/api/audit/config') return response(200, auditConfig);
    if (url.pathname === '/api/workspace/me') return response(200, { user: { id: 'unexpected' } });
    return response(401, unauthorized);
  };
  const result = await runDeploymentSmokeCheck({ baseUrl: 'https://agencyos.example.test', fetchImpl });
  assert.equal(result.ready, false);
  assert.equal(result.checks.find((check) => check.path === '/api/workspace/me').ok, false);
});

test('deployment smoke check rejects insecure base URLs before sending requests', async () => {
  await assert.rejects(
    runDeploymentSmokeCheck({ baseUrl: 'http://agencyos.example.test', fetchImpl: async () => { throw new Error('must not be called'); } }),
    /require HTTPS/,
  );
});

test('deployment smoke check rejects public configuration that exposes secret-like keys', async () => {
  const result = await runDeploymentSmokeCheck({
    baseUrl: 'https://agencyos.example.test',
    fetchImpl: async (url) => {
      if (url.pathname === '/api/config') return response(200, { ...publicConfig, api_key: 'should-not-be-exposed' });
      if (url.pathname === '/api/audit/config') return response(200, auditConfig);
      return response(401, unauthorized);
    },
  });
  assert.equal(result.ready, false);
  assert.equal(result.checks[0].ok, false);
});
