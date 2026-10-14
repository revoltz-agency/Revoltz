import test from 'node:test';
import assert from 'node:assert/strict';
import { __setPoolForTests } from '../server/db.js';
import { readOrganizationWorkspace, requireOrganizationModule, updateOrganizationModules, WORKSPACE_MODULES } from '../server/organizationWorkspace.js';

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const USER_ID = '3f0c1e2a-4b5d-4c6e-8f90-1a2b3c4d5e6f';
const ORGANIZATION_ID = 'org-test-id';

function useOrganizationDatabase(role = 'owner') {
  process.env.DATABASE_URL = 'postgres://example.invalid/agencyos-test';
  const calls = [];
  const modules = new Map();
  const pool = {
    calls,
    on() {},
    async end() {},
    async query(text, values = []) {
      calls.push({ text, values });
      if (/^\s*CREATE (TABLE|INDEX) IF NOT EXISTS/i.test(text)) return { rows: [], rowCount: 0 };
      if (/^\s*INSERT INTO (organizations|organization_memberships|organization_subscriptions|organization_workspace_data)\b/i.test(text) && /\bSELECT\b/i.test(text)) return { rows: [], rowCount: 0 };
      if (/^\s*INSERT INTO organization_modules\s*\(organization_id, module_key, enabled\)\s*SELECT o\.id/i.test(text)) {
        for (const key of WORKSPACE_MODULES.map((module) => module.key)) {
          modules.set(key, { module_key: key, enabled: true, settings: {}, organization_id: ORGANIZATION_ID });
        }
        return { rows: [], rowCount: WORKSPACE_MODULES.length };
      }
      if (text.includes('FROM organization_memberships m') && text.includes('JOIN organizations o')) {
        return { rows: [{
          organization_id: ORGANIZATION_ID,
          organization_name: 'Priya workspace',
          role,
          plan_key: 'starter',
          subscription_status: 'inactive',
          current_period_start: null,
          current_period_end: null,
          cancel_at_period_end: false,
        }], rowCount: 1 };
      }
      if (text.includes('SELECT enabled FROM organization_modules')) {
        const row = modules.get(values[1]);
        return { rows: row ? [{ enabled: row.enabled }] : [], rowCount: row ? 1 : 0 };
      }
      if (text.includes('SELECT module_key, enabled, settings FROM organization_modules')) {
        return { rows: [...modules.values()], rowCount: modules.size };
      }
      if (text.includes('INSERT INTO organization_modules')) {
        const [organizationId, enabledKeys, allKeys] = values;
        for (const key of allKeys) {
          modules.set(key, {
            module_key: key,
            enabled: enabledKeys.includes(key),
            settings: {},
            organization_id: organizationId,
          });
        }
        return { rows: [], rowCount: allKeys.length };
      }
      throw new Error(`Unexpected organization SQL: ${text}`);
    },
  };
  __setPoolForTests(pool);
  return { calls, modules, pool };
}

test.after(() => {
  __setPoolForTests(null);
  if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
});

test('organization overview returns membership, subscription and explicit module choices', async () => {
  const db = useOrganizationDatabase();
  const result = await readOrganizationWorkspace(USER_ID);
  assert.deepEqual(result.organization, { id: ORGANIZATION_ID, name: 'Priya workspace', role: 'owner' });
  assert.deepEqual(result.subscription, {
    planKey: 'starter',
    status: 'inactive',
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  });
  assert.deepEqual(result.modules.map(({ key, enabled }) => ({ key, enabled })), WORKSPACE_MODULES.map(({ key }) => ({ key, enabled: true })));
  assert.ok(db.calls.some((call) => call.text.includes('JOIN organization_subscriptions s')));
});

test('owners can save a bounded allowlisted module selection', async () => {
  const db = useOrganizationDatabase();
  const result = await updateOrganizationModules(USER_ID, ['growth_sales', 'tools', 'growth_sales']);
  assert.deepEqual(result.modules.filter((module) => module.enabled).map((module) => module.key), ['growth_sales', 'tools']);
  const upsert = db.calls.find((call) => call.text.includes('INSERT INTO organization_modules') && call.text.includes('FROM unnest($3::text[])'));
  assert.deepEqual(upsert.values, [ORGANIZATION_ID, ['growth_sales', 'tools'], WORKSPACE_MODULES.map((module) => module.key)]);
  assert.match(upsert.text, /ON CONFLICT \(organization_id, module_key\)/);
});

test('server module entitlements permit enabled modules and deny disabled or missing modules', async () => {
  const db = useOrganizationDatabase();
  assert.equal(await requireOrganizationModule(USER_ID, 'growth_sales'), true);
  db.modules.set('growth_sales', { module_key: 'growth_sales', enabled: false, settings: {} });
  await assert.rejects(requireOrganizationModule(USER_ID, 'growth_sales'), { statusCode: 403, code: 'WORKSPACE_MODULE_DISABLED' });
  await assert.rejects(requireOrganizationModule(USER_ID, 'not_a_module'), { statusCode: 500 });
});

test('billing enforcement requires an active subscription when the rollout switch is enabled', async () => {
  const db = useOrganizationDatabase();
  const original = process.env.AGENCYOS_BILLING_ENFORCED;
  process.env.AGENCYOS_BILLING_ENFORCED = 'true';
  try {
    await assert.rejects(requireOrganizationModule(USER_ID, 'growth_sales'), {
      statusCode: 402,
      code: 'SUBSCRIPTION_REQUIRED',
    });
    assert.equal(db.calls.some((call) => call.text.includes('SELECT enabled FROM organization_modules')), false);
  } finally {
    if (original === undefined) delete process.env.AGENCYOS_BILLING_ENFORCED;
    else process.env.AGENCYOS_BILLING_ENFORCED = original;
  }
});

test('module selection rejects unknown keys and non-owner members', async () => {
  useOrganizationDatabase();
  await assert.rejects(updateOrganizationModules(USER_ID, ['admin_override']), { statusCode: 400 });
  await assert.rejects(updateOrganizationModules(USER_ID, 'growth_sales'), { statusCode: 400 });

  useOrganizationDatabase('member');
  await assert.rejects(updateOrganizationModules(USER_ID, ['growth_sales']), { statusCode: 403 });
});
