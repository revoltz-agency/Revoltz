const DEFAULT_BASE_URL = 'https://revoltz-agencyos.onrender.com';

export async function runDeploymentSmokeCheck({
  baseUrl = process.env.AGENCYOS_BASE_URL || DEFAULT_BASE_URL,
  fetchImpl = fetch,
} = {}) {
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new Error('AGENCYOS_BASE_URL must be a valid HTTPS URL.');
  }
  if (base.protocol !== 'https:') throw new Error('Deployment smoke checks require HTTPS.');

  const checks = [];
  async function request(path, expectedStatus, validate = () => true) {
    try {
      const response = await fetchImpl(new URL(path, base), {
        method: 'GET',
        redirect: 'manual',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      let payload = null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        payload = await response.json().catch(() => null);
      }
      const statusOk = response.status === expectedStatus;
      const bodyOk = statusOk && validate(payload, response);
      checks.push({
        path,
        ok: statusOk && bodyOk,
        detail: !statusOk
          ? `expected HTTP ${expectedStatus}, received ${response.status}`
          : !bodyOk ? 'response body did not match the expected API contract' : `HTTP ${response.status}`,
      });
    } catch (error) {
      checks.push({ path, ok: false, detail: error?.name === 'TimeoutError' ? 'request timed out' : 'request failed' });
    }
  }

  await request('/api/config', 200, (payload) =>
    payload && typeof payload.googlePlacesConfigured === 'boolean' &&
    typeof payload.auditInboxConfigured === 'boolean' &&
    typeof payload.auditPublicIntakeEnabled === 'boolean' &&
    typeof payload.telegramNotificationsConfigured === 'boolean' &&
    typeof payload.placesRateLimitPerMinute === 'number' &&
    !Object.keys(payload).some((key) => /secret|token|password|database_url|api_key/i.test(key)));

  await request('/api/audit/config', 200, (payload) =>
    payload && typeof payload.configured === 'boolean' &&
    typeof payload.publicIntakeEnabled === 'boolean' &&
    typeof payload.retentionDays === 'number');

  await request('/api/workspace/me', 401, (payload) =>
    payload && typeof payload.error === 'string');

  await request('/api/workspace/organization', 401, (payload) =>
    payload && typeof payload.error === 'string');

  await request('/api/workspace/state', 401, (payload) =>
    payload && typeof payload.error === 'string');

  const result = {
    baseUrl: base.origin,
    passed: checks.filter((check) => check.ok).length,
    total: checks.length,
    ready: checks.every((check) => check.ok),
    checks,
  };
  return result;
}

if (import.meta.url === new URL(process.argv[1] || '', 'file:').href) {
  const result = await runDeploymentSmokeCheck();
  console.log(`AgencyOS deployment smoke check: ${result.passed}/${result.total} checks passed`);
  for (const check of result.checks) {
    console.log(`${check.ok ? 'PASS' : 'BLOCK'}  ${check.path} — ${check.detail}`);
  }
  if (!result.ready) {
    console.error('Deployment smoke check failed. Do not accept customers until the failed checks are resolved.');
    process.exitCode = 1;
  }
}
